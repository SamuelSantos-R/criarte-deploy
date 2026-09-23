// Desenha poses do envelope noutras threads. Medido no profiler: com a mistura
// de poses, o desenho em JavaScript é o gargalo e corre num núcleo só; cada
// thread aqui tem o seu próprio núcleo e o seu próprio `prepare`.
//
// Cada thread prepara o convite sozinha em vez de o receber pronto: o `prepare`
// é determinístico (nada de aleatório nele), então todas chegam aos mesmos
// dados — e assim não há objeto grande nenhum a copiar entre threads.
const { Worker, isMainThread, parentPort, workerData } = require('node:worker_threads');
const path = require('node:path');
const fs = require('node:fs');

if (!isMainThread) {
  const sharp = require('sharp');
  // O paralelismo vem das threads: se cada uma ainda pedisse quatro ao libvips,
  // eram doze a disputar quatro núcleos.
  sharp.concurrency(1);
  const { prepare, renderFrame, createPlateReader } = require('../engine-curva.js');
  (async () => {
    const { entrada, largura, perfil } = workerData;
    const profile = JSON.parse(fs.readFileSync(perfil, 'utf8'));
    const prepared = await prepare(entrada, largura);
    const lerPlaca = createPlateReader(profile, prepared.width, prepared.height);
    parentPort.on('message', async ({ id, i }) => {
      try {
        const buf = await renderFrame(prepared, profile, await lerPlaca(i), i, true);
        // A memória que o sharp devolve é "externa" e não se transfere entre
        // threads. Copiar para um ArrayBuffer próprio custa ~1 ms por pose.
        const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
        parentPort.postMessage({ id, dados: ab }, [ab]);
      } catch (e) {
        parentPort.postMessage({ id, erro: String((e && e.message) || e) });
      }
    });
    parentPort.postMessage({ pronto: true, largura: prepared.width, altura: prepared.height });
  })().catch((e) => parentPort.postMessage({ falhou: String((e && e.message) || e) }));
}

/**
 * Abre `quantas` threads, espera que todas tenham preparado o convite, e
 * devolve quem desenha. A pose vai para a thread com menos trabalho na fila.
 */
async function abrirDesenhistas({ entrada, largura, perfil, quantas }) {
  const threads = [];
  const pendentes = new Map();
  let proximo = 0;
  const prontas = [];
  for (let t = 0; t < quantas; t++) {
    const w = new Worker(__filename, { workerData: { entrada, largura, perfil } });
    const estado = { w, fila: 0 };
    threads.push(estado);
    prontas.push(new Promise((resolve, reject) => {
      const aoMsg = (m) => {
        if (m.pronto) return resolve(m);
        if (m.falhou) return reject(new Error(m.falhou));
        const p = pendentes.get(m.id);
        if (!p) return;
        pendentes.delete(m.id);
        estado.fila--;
        if (m.erro) p.reject(new Error(m.erro));
        else p.resolve(Buffer.from(m.dados));
      };
      w.on('message', aoMsg);
      w.on('error', (e) => {
        reject(e);
        for (const [, p] of pendentes) p.reject(e);
        pendentes.clear();
      });
    }));
  }
  let dim;
  try {
    [dim] = await Promise.all(prontas);
  } catch (e) {
    await Promise.all(threads.map(({ w }) => w.terminate()));
    throw e;
  }
  return {
    largura: dim.largura,
    altura: dim.altura,
    desenhar(i) {
      const alvo = threads.reduce((a, b) => (b.fila < a.fila ? b : a));
      alvo.fila++;
      const id = proximo++;
      return new Promise((resolve, reject) => {
        pendentes.set(id, { resolve, reject });
        alvo.w.postMessage({ id, i });
      });
    },
    fechar() {
      return Promise.all(threads.map(({ w }) => w.terminate()));
    },
  };
}

module.exports = { abrirDesenhistas };
