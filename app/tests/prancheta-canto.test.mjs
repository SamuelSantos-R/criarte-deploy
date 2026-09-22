// Importa o código de verdade — o mesmo ficheiro que o Studio usa.
import { cantoEFolga, ALTURA, LARGURA } from "../src/renderer/src/lib/prancheta.ts";
// A prancheta na tela: 452×786 escalada, e uma moldura de 37% de largura.
const caixa = { width: LARGURA, height: ALTURA };
const L = LARGURA * 0.37, A = L; // a arte é ~quadrada

const casos = [
  ["colada no canto de cima à esquerda", 0, 0, "superior-esquerdo", 0, 0],
  ["colada no canto de baixo à direita", caixa.width - L, caixa.height - A, "inferior-direito", 0, 0],
  ["a 10% do topo, à esquerda", 45.2, 78.6, "superior-esquerdo", 10, 10],
  ["encostada à direita, em cima", caixa.width - L, 0, "superior-direito", 0, 0],
  ["puxada pra fora pela esquerda", -60, -40, "superior-esquerdo", 0, 0],
  ["no meio do quadro", (caixa.width - L) / 2, (caixa.height - A) / 2, "superior-esquerdo", 31.5, 39.4],
];

let falhas = 0;
for (const [nome, x, y, canto, fx, fy] of casos) {
  const r = cantoEFolga(x, y, L, A, caixa);
  const ok = r.canto === canto && Math.abs(r.folgaX - fx) < 0.15 && Math.abs(r.folgaY - fy) < 0.15;
  if (!ok) falhas++;
  console.log(`${ok ? "ok  " : "FALHA"} ${nome.padEnd(36)} -> ${r.canto} ${r.folgaX}% / ${r.folgaY}%`);
}
// Ida e volta: a folga guardada tem de devolver a moldura ao mesmo sítio.
const posto = cantoEFolga(90, 120, L, A, caixa);
const voltaX = posto.canto.endsWith("esquerdo") ? (posto.folgaX / 100) * caixa.width : caixa.width - (posto.folgaX / 100) * caixa.width - L;
const voltaOk = Math.abs(voltaX - 90) < 0.6;
console.log(`${voltaOk ? "ok  " : "FALHA"} ida e volta da folga -> ${voltaX.toFixed(1)}px (posto em 90)`);
if (!voltaOk) falhas++;
console.log(falhas === 0 ? "\nTODOS OS CASOS PASSARAM" : `\n${falhas} FALHA(S)`);
process.exit(falhas === 0 ? 0 : 1);
