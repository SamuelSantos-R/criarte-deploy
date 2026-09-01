import { BrowserWindow } from "electron";
import { readdir, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import { siteDirExistente } from "./sites";

const CONVERSIVEIS = new Set([".png", ".jpg", ".jpeg"]);
const PULAR = new Set([
  "node_modules", ".next", ".git", "out", "dist", "build", ".turbo", ".vercel", ".originais",
]);

export type Foto = { caminho: string; rel: string; bytes: number };

async function varrer(raiz: string): Promise<Foto[]> {
  const achados: Foto[] = [];
  const fila = [raiz];
  while (fila.length > 0) {
    const dir = fila.shift() as string;
    let entradas;
    try {
      entradas = await readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entradas) {
      if (PULAR.has(e.name) || e.name.startsWith(".")) continue;
      const cheio = join(dir, e.name);
      if (e.isDirectory()) {
        fila.push(cheio);
      } else if (e.isFile() && CONVERSIVEIS.has(extname(e.name).toLowerCase())) {
        achados.push({ caminho: cheio, rel: relative(raiz, cheio), bytes: (await stat(cheio)).size });
      }
    }
  }
  return achados.sort((a, b) => a.rel.localeCompare(b.rel));
}

/**
 * O encoder é o próprio Chromium. O `cwebp` do Homebrew deixou de ser preciso:
 * uma janela escondida decodifica a imagem, desenha no tamanho pedido e chama
 * `convertToBlob({type:"image/webp"})`, que é o mesmo codec que o browser usa
 * para ler .webp. Assim a máquina não precisa de instalar nada.
 *
 * `webSecurity:false` é o preço de ler `file://` a partir de about:blank. A
 * janela não navega para lado nenhum, não tem preload e morre no fim — nada de
 * fora chega perto dela.
 */
class Encoder {
  private win: BrowserWindow | null = null;

  private janela(): BrowserWindow {
    if (this.win && !this.win.isDestroyed()) return this.win;
    this.win = new BrowserWindow({
      show: false,
      webPreferences: { webSecurity: false, sandbox: false, contextIsolation: true, nodeIntegration: false },
    });
    void this.win.loadURL("about:blank");
    return this.win;
  }

  async pronta(): Promise<void> {
    const w = this.janela();
    if (w.webContents.isLoading()) {
      await new Promise<void>((r) => w.webContents.once("did-finish-load", () => r()));
    }
  }

  async converter(caminho: string, largura: number, qualidade: number): Promise<Buffer> {
    const url = pathToFileURL(caminho).href;
    const codigo = `(async () => {
      const resposta = await fetch(${JSON.stringify(url)});
      const bitmap = await createImageBitmap(await resposta.blob());
      const escala = Math.min(1, ${largura} / bitmap.width);
      const l = Math.max(1, Math.round(bitmap.width * escala));
      const a = Math.max(1, Math.round(bitmap.height * escala));
      const tela = new OffscreenCanvas(l, a);
      const ctx = tela.getContext("2d");
      ctx.drawImage(bitmap, 0, 0, l, a);
      bitmap.close();
      const blob = await tela.convertToBlob({ type: "image/webp", quality: ${qualidade / 100} });
      if (blob.type !== "image/webp") throw new Error("este Chromium não encoda webp");
      const bytes = new Uint8Array(await blob.arrayBuffer());
      // Em pedaços: o spread de um array grande estoura a pilha do argumento.
      let bin = "";
      for (let i = 0; i < bytes.length; i += 0x8000) {
        bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
      }
      return btoa(bin);
    })()`;
    const base64 = (await this.janela().webContents.executeJavaScript(codigo, true)) as string;
    return Buffer.from(base64, "base64");
  }

  fechar(): void {
    if (this.win && !this.win.isDestroyed()) this.win.destroy();
    this.win = null;
  }
}

export type Progresso = (linha: string) => void;

/**
 * Converte tudo o que ainda não tem `.webp` ao lado (ou cujo `.webp` é mais
 * velho que o original). O original nunca é apagado — o Photoshop continua a
 * ser a fonte e reconverter tem de ser possível.
 */
export async function converterFotos(
  siteId: string,
  max: number,
  qualidade: number,
  diz: Progresso,
  cancelado: () => boolean,
): Promise<void> {
  const raiz = await siteDirExistente(siteId);
  const fotos = await varrer(raiz);
  if (fotos.length === 0) {
    diz("Nenhum .png/.jpg para converter.");
    return;
  }

  const encoder = new Encoder();
  await encoder.pronta();
  let feitas = 0;
  let puladas = 0;
  let ganho = 0;

  try {
    for (const [i, foto] of fotos.entries()) {
      if (cancelado()) {
        diz("Cancelado.");
        return;
      }
      const destino = foto.caminho.replace(/\.(png|jpe?g)$/i, ".webp");
      if (existsSync(destino) && (await stat(destino)).mtimeMs >= (await stat(foto.caminho)).mtimeMs) {
        puladas += 1;
        continue;
      }
      const rotulo = `[${i + 1}/${fotos.length}] ${foto.rel}`;
      try {
        const bytes = await encoder.converter(foto.caminho, max, qualidade);
        await writeFile(destino, bytes);
        ganho += foto.bytes - bytes.length;
        feitas += 1;
        const antes = (foto.bytes / 1024).toFixed(0);
        const depois = (bytes.length / 1024).toFixed(0);
        const corte = Math.round((1 - bytes.length / foto.bytes) * 100);
        diz(`${rotulo} — ${antes} KB → ${depois} KB (-${corte}%)`);
      } catch (e) {
        diz(`${rotulo} — falhou: ${e instanceof Error ? e.message : "erro"}`);
      }
    }
  } finally {
    encoder.fechar();
  }

  const mb = (ganho / 1024 / 1024).toFixed(1);
  diz(`${feitas} convertida(s), ${puladas} já em dia — ${mb} MB poupados.`);
}
