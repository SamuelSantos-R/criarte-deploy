import { createSocket, type Socket } from "node:dgram";
import { hostname, networkInterfaces } from "node:os";

/**
 * Quem está a receber na sala. O anfitrião grita de dois em dois segundos por
 * UDP e todos os Studios da rede ouvem — assim ninguém precisa de perguntar o IP
 * ao lado antes de entrar.
 *
 * Ouvir não é ser convidado: o farol só diz onde bater, e o código de 6 dígitos
 * continua a ser a porta. Descoberta não é autorização.
 */

const PORTA_FAROL = 7413;
const ANUNCIO_MS = 2_000;
/** Três anúncios de folga: um pacote UDP perdido não faz o vizinho piscar. */
const VALIDADE_MS = 7_000;
const VARRER_MS = 1_000;
const MAX = 32;

export type Vizinho = { endereco: string; nome: string; siteId: string };

/**
 * `255.255.255.255` não sai de algumas placas e alguns APs deitam-no fora. O
 * endereço de difusão dirigido da própria sub-rede é o que chega mesmo — daí
 * calculá-lo a partir da máscara, com o genérico só como último recurso.
 */
function enderecosDeDifusao(): string[] {
  const saida: string[] = [];
  for (const [nome, addrs] of Object.entries(networkInterfaces())) {
    if (/^(feth|bridge|utun|awdl|llw|ap\d)/.test(nome)) continue;
    for (const a of addrs ?? []) {
      if (a.family !== "IPv4" || a.internal || a.address.startsWith("169.254.")) continue;
      const ip = a.address.split(".").map(Number);
      const mascara = a.netmask.split(".").map(Number);
      if (ip.length !== 4 || mascara.length !== 4 || mascara.some(Number.isNaN)) continue;
      saida.push(ip.map((o, i) => o | (~mascara[i] & 255)).join("."));
    }
  }
  return saida.length > 0 ? [...new Set(saida)] : ["255.255.255.255"];
}

function meusIps(): Set<string> {
  const meus = new Set<string>();
  for (const addrs of Object.values(networkInterfaces())) {
    for (const a of addrs ?? []) if (a.family === "IPv4") meus.add(a.address);
  }
  return meus;
}

let soquete: Socket | null = null;
let farol: NodeJS.Timeout | null = null;
let varredura: NodeJS.Timeout | null = null;
let anunciando: { siteId: string; porta: number } | null = null;

const vistos = new Map<string, Vizinho & { visto: number }>();
const ouvintes: (() => void)[] = [];

function avisar(): void {
  for (const o of ouvintes) o();
}

export function aoMudarVizinhos(ouvinte: () => void): void {
  ouvintes.push(ouvinte);
}

/** Só o que sobrevive à leitura vira vizinho: isto vem da rede, não de nós. */
function ler(carga: Buffer, origem: string): void {
  if (carga.length > 512) return;
  let obj: unknown;
  try {
    obj = JSON.parse(carga.toString("utf8"));
  } catch {
    return;
  }
  if (!obj || typeof obj !== "object") return;
  const { t, nome, siteId, porta } = obj as Record<string, unknown>;
  if (t !== "criarte-studio") return;
  if (typeof siteId !== "string" || !/^[a-z0-9-]{1,64}\/[a-z0-9-]{1,64}$/.test(siteId)) return;
  if (typeof porta !== "number" || !Number.isInteger(porta) || porta < 1024 || porta > 65535) return;
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(origem)) return;
  if (vistos.size >= MAX && !vistos.has(`${origem}:${porta}`)) return;

  const endereco = `${origem}:${porta}`;
  const anterior = vistos.get(endereco);
  const limpo = typeof nome === "string" ? nome.replace(/[^\p{L}\p{N} ._-]/gu, "").slice(0, 40) : origem;
  vistos.set(endereco, { endereco, nome: limpo || origem, siteId, visto: Date.now() });
  if (!anterior || anterior.nome !== limpo || anterior.siteId !== siteId) avisar();
}

function varrer(): void {
  const limite = Date.now() - VALIDADE_MS;
  let mudou = false;
  for (const [k, v] of vistos) {
    if (v.visto < limite) {
      vistos.delete(k);
      mudou = true;
    }
  }
  if (mudou) avisar();
}

function abrir(): void {
  if (soquete) return;
  const s = createSocket({ type: "udp4", reuseAddr: true });
  soquete = s;
  s.on("error", () => {
    s.close();
    if (soquete === s) soquete = null;
  });
  s.on("message", (carga, rinfo) => {
    // O próprio grito volta pela difusão. Filtrar aqui, e não na lista, é o que
    // impede o Studio de se oferecer a si mesmo como vizinho.
    if (meusIps().has(rinfo.address)) return;
    ler(carga, rinfo.address);
  });
  s.bind(PORTA_FAROL, () => {
    try {
      s.setBroadcast(true);
    } catch {
      /* sem difusão nesta placa: ainda dá pra ouvir */
    }
  });
  varredura ??= setInterval(varrer, VARRER_MS);
  varredura.unref?.();
}

function gritar(): void {
  if (!soquete || !anunciando) return;
  const carga = Buffer.from(
    JSON.stringify({ t: "criarte-studio", nome: hostname().replace(/\.local$/, ""), ...anunciando }),
  );
  for (const destino of enderecosDeDifusao()) {
    soquete.send(carga, PORTA_FAROL, destino, () => {
      /* rede fora do ar: o próximo tique tenta de novo */
    });
  }
}

/** Enquanto houver sessão aberta, este Studio aparece na lista dos outros. */
export function anunciar(siteId: string, porta: number): void {
  abrir();
  anunciando = { siteId, porta };
  gritar();
  farol ??= setInterval(gritar, ANUNCIO_MS);
  farol.unref?.();
}

export function pararAnuncio(): void {
  anunciando = null;
  if (farol) clearInterval(farol);
  farol = null;
}

export function vizinhos(): Vizinho[] {
  abrir();
  varrer();
  return [...vistos.values()]
    .sort((a, b) => a.nome.localeCompare(b.nome))
    .map(({ endereco, nome, siteId }) => ({ endereco, nome, siteId }));
}
