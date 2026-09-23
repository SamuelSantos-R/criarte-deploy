// O relógio do envelope: as posições fracionárias e os pesos do obturador.
// Importa o motor de verdade — o mesmo ficheiro que o Studio carrega.
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
const require = createRequire(import.meta.url);
const { playbackFrames, playbackPositions, pesosDoObturador } = require("../resources/envelope-animado/lib/playback.js");

const perfil = JSON.parse(readFileSync(new URL("../resources/envelope-animado/perfis/curva-pmm/perfil.json", import.meta.url), "utf8"));
const ritmo = JSON.parse(readFileSync(new URL("../resources/envelope-animado/playback.json", import.meta.url), "utf8")).progress;
const ultima = perfil.frameCount - 1;
let falhas = 0;
const ok = (cond, texto) => { console.log(`${cond ? "ok  " : "FALHA"} ${texto}`); if (!cond) falhas++; };

for (const segundos of [3, 4, 6, 9]) {
  const frac = playbackPositions(perfil, segundos, ritmo);
  const inteiro = playbackFrames(perfil, segundos, ritmo);
  ok(frac.length === inteiro.length, `${segundos}s: mesmo número de quadros que o motor original (${frac.length})`);
  ok(frac[0] === 0 && frac.at(-1) === ultima, `${segundos}s: começa fechado e acaba aberto`);
  ok(frac.every((p, i) => i === 0 || p >= frac[i - 1]), `${segundos}s: a aba nunca anda para trás`);
  ok(frac.every((p, i) => Math.abs(Math.round(p) - inteiro[i]) <= 1), `${segundos}s: o ritmo é o do original (±1 pose)`);
}

const frac = playbackPositions(perfil, 4, ritmo);
const todos = frac.map((_, k) => pesosDoObturador(frac, k, 0.5, ultima));
ok(todos.every((ps) => Math.abs(ps.reduce((s, [, w]) => s + w, 0) - 1) < 1e-9), "os pesos de cada quadro somam 1 (não escurece nem clareia)");
ok(todos.every((ps) => ps.every(([i]) => Number.isInteger(i) && i >= 0 && i <= ultima)), "só pede poses que existem");
ok(todos.every((ps) => ps.length >= 1 && ps.length <= 7), "nunca mais de 7 poses por quadro");

// Onde quase não se mexe: interpolação pura entre duas vizinhas, nada de rasto.
const lento = frac.findIndex((p, k) => k > 0 && p - frac[k - 1] < 0.9);
ok(pesosDoObturador(frac, lento, 0.5, ultima).length <= 2, `quadro lento (${lento}): no máximo 2 poses — nítido`);
// Onde a aba vira depressa: várias poses, é aí que fica o rasto.
let rapido = 1; for (let k = 1; k < frac.length; k++) if (frac[k] - frac[k - 1] > frac[rapido] - frac[rapido - 1]) rapido = k;
ok(pesosDoObturador(frac, rapido, 0.5, ultima).length >= 3, `quadro rápido (${rapido}): 3 ou mais poses — rasto de movimento`);
// Obturador fechado: sem rasto nenhum, só a interpolação.
ok(frac.every((_, k) => pesosDoObturador(frac, k, 0, ultima).length <= 2), "obturador 0: nunca mais de 2 poses (só suaviza, sem rasto)");

console.log(falhas === 0 ? "\nTODOS OS CASOS PASSARAM" : `\n${falhas} FALHA(S)`);
process.exit(falhas === 0 ? 0 : 1);
