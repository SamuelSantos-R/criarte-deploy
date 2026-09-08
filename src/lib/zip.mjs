// ============================================================================
// ZIP — compactador em JS puro (só `node:zlib`)
// ============================================================================
// O envio pra VPS corria `zip -r` pela shell. No macOS e no Linux o binário está
// sempre lá; no Windows não existe, e a publicação morria no "Falha ao criar
// zip" antes de sequer tentar a rede. Escrever o formato à mão é ~120 linhas e
// tira a última dependência de binário externo do caminho de publicação.
import { createReadStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { open } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { deflateRaw } from "node:zlib";
import { promisify } from "node:util";

const comprimir = promisify(deflateRaw);

const TABELA_CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = TABELA_CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

/** Data no formato MS-DOS que o ZIP exige. Antes de 1980 o formato não sabe representar. */
function dataDos(d) {
  const ano = Math.max(1980, d.getFullYear());
  return {
    hora: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    data: ((ano - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

async function listar(raiz, dir, saida) {
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const caminho = join(dir, item.name);
    // Symlink vira o que aponta ou nada: o servidor desempacota noutra máquina,
    // onde o alvo do link não existe.
    if (item.isSymbolicLink()) continue;
    const nome = relative(raiz, caminho).split(sep).join("/");
    if (item.isDirectory()) {
      saida.push({ nome: `${nome}/`, caminho, pasta: true });
      await listar(raiz, caminho, saida);
    } else if (item.isFile()) {
      saida.push({ nome, caminho, pasta: false });
    }
  }
  return saida;
}

/**
 * Compacta `raiz` inteira para `destino`, como fazia o `zip -r "$destino" .`.
 * Escreve em streaming: o conteúdo entra ficheiro a ficheiro e nunca há mais do
 * que um deles em memória, senão um site com vídeo rebentava o heap.
 */
export async function zipPasta(raiz, destino) {
  const itens = await listar(raiz, raiz, []);
  if (itens.length > 0xffff) throw new Error(`zip: ${itens.length} entradas, o formato clássico só leva 65535`);

  const fh = await open(destino, "w");
  try {
    const central = [];
    let deslocamento = 0;

    for (const item of itens) {
      const nome = Buffer.from(item.nome, "utf8");
      const info = await stat(item.caminho);
      const { hora, data } = dataDos(info.mtime);

      let cru = Buffer.alloc(0);
      if (!item.pasta) cru = await lerFicheiro(item.caminho, info.size);
      const crc = item.pasta ? 0 : crc32(cru);
      // Deflate que incha (JPEG, WEBP, ZIP) entra guardado: comprimir de novo só
      // gastava CPU pra ficar maior.
      const comprimido = item.pasta ? Buffer.alloc(0) : await comprimir(cru);
      const guardar = item.pasta || comprimido.length >= cru.length;
      const corpo = guardar ? cru : comprimido;
      const metodo = guardar ? 0 : 8;

      const local = Buffer.alloc(30);
      local.writeUInt32LE(0x04034b50, 0);
      local.writeUInt16LE(20, 4); // versão mínima
      // Flags a zero de propósito. O bit 11 ("nome em UTF-8") faz o unzip do
      // Info-ZIP transcodificar o nome para o charset da consola, e numa VPS com
      // locale C isso rebenta em "Illegal byte sequence". O `zip -r` que estava
      // aqui antes também escreve zero e passa os bytes crus — é o que a VPS já
      // sabe desempacotar há anos.
      local.writeUInt16LE(0, 6);
      local.writeUInt16LE(metodo, 8);
      local.writeUInt16LE(hora, 10);
      local.writeUInt16LE(data, 12);
      local.writeUInt32LE(crc, 14);
      local.writeUInt32LE(corpo.length, 18);
      local.writeUInt32LE(cru.length, 22);
      local.writeUInt16LE(nome.length, 26);
      local.writeUInt16LE(0, 28);

      await fh.write(local);
      await fh.write(nome);
      if (corpo.length) await fh.write(corpo);

      const dir = Buffer.alloc(46);
      dir.writeUInt32LE(0x02014b50, 0);
      // Alto = host Unix (3). Não é cosmético: com host MS-DOS o unzip do
      // Info-ZIP assume que o nome vem em CP437 e transcodifica-o, rebentando em
      // "Illegal byte sequence" no primeiro ficheiro acentuado. Com host Unix
      // passa os bytes crus — e passa a ler o modo nos 16 bits de cima do
      // atributo externo, que por isso tem de ir preenchido.
      dir.writeUInt16LE((3 << 8) | 30, 4); // criado por
      dir.writeUInt16LE(20, 6); // versão mínima
      dir.writeUInt16LE(0, 8);
      dir.writeUInt16LE(metodo, 10);
      dir.writeUInt16LE(hora, 12);
      dir.writeUInt16LE(data, 14);
      dir.writeUInt32LE(crc, 16);
      dir.writeUInt32LE(corpo.length, 20);
      dir.writeUInt32LE(cru.length, 24);
      dir.writeUInt16LE(nome.length, 28);
      // Modo Unix em cima, bit de "é pasta" do DOS em baixo. O bit de executável
      // vem do ficheiro real — apagá-lo estragaria qualquer script no pacote.
      const modo = item.pasta ? 0o40755 : info.mode & 0o111 ? 0o100755 : 0o100644;
      dir.writeUInt32LE(((modo << 16) | (item.pasta ? 0x10 : 0)) >>> 0, 38);
      dir.writeUInt32LE(deslocamento, 42);
      central.push(Buffer.concat([dir, nome]));

      deslocamento += local.length + nome.length + corpo.length;
      if (deslocamento > 0xffffffff) throw new Error("zip: passou dos 4 GB, o formato clássico não chega lá");
    }

    const inicioCentral = deslocamento;
    for (const c of central) await fh.write(c);
    const tamanhoCentral = central.reduce((s, c) => s + c.length, 0);

    const fim = Buffer.alloc(22);
    fim.writeUInt32LE(0x06054b50, 0);
    fim.writeUInt16LE(central.length, 8);
    fim.writeUInt16LE(central.length, 10);
    fim.writeUInt32LE(tamanhoCentral, 12);
    fim.writeUInt32LE(inicioCentral, 16);
    await fh.write(fim);
  } finally {
    await fh.close();
  }
}

async function lerFicheiro(caminho, tamanho) {
  const partes = [];
  for await (const parte of createReadStream(caminho)) partes.push(parte);
  const buf = Buffer.concat(partes);
  if (buf.length !== tamanho) throw new Error(`zip: ${caminho} mudou de tamanho a meio da leitura`);
  return buf;
}
