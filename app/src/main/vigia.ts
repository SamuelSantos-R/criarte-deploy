import { watch, type FSWatcher } from "node:fs";
import { stat } from "node:fs/promises";
import { BrowserWindow } from "electron";
import { conviteFile, gravadaPeloStudio } from "./sites";

// Uma gravação solta vários eventos (truncar, escrever, fechar). Esperar um
// tico junta tudo num aviso só, já com o arquivo inteiro em disco.
const REPIQUE = 150;

let atual: { id: string; watcher: FSWatcher; timer: NodeJS.Timeout | null } | null = null;

function avisar(id: string, marca: number): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send("convite:mudou", { id, marca });
  }
}

/**
 * Um convite por vez: o editor só tem um aberto. `null` desliga.
 * O aviso só sai quando o mtime não é o da última gravação do próprio Studio —
 * senão cada tecla digitada voltaria como "mudou lá fora".
 */
export async function vigiarConvite(id: string | null): Promise<void> {
  if (atual?.id === id) return;
  pararVigia();
  if (!id) return;
  const file = await conviteFile(id);
  const watcher = watch(file, () => {
    if (atual?.id !== id) return;
    if (atual.timer) clearTimeout(atual.timer);
    atual.timer = setTimeout(() => {
      void stat(file)
        .then((s) => {
          if (!gravadaPeloStudio(id, s.mtimeMs)) avisar(id, s.mtimeMs);
        })
        .catch(() => {});
    }, REPIQUE);
  });
  // Watcher morto é silencioso e perigoso: o guarda do mtime na gravação segue
  // valendo, então perder o aviso custa um conflito na tela, não a edição.
  watcher.on("error", () => pararVigia());
  atual = { id, watcher, timer: null };
}

export function pararVigia(): void {
  if (!atual) return;
  if (atual.timer) clearTimeout(atual.timer);
  atual.watcher.close();
  atual = null;
}
