import { Agent, createServer, request, type IncomingMessage, type Server } from "node:http";
import { connect, type Socket } from "node:net";

/**
 * Espelho do preview do anfitrião no loopback do convidado.
 *
 * A CSP do app só emoldura `localhost`/`127.0.0.1`, e ela é carimbada quando a
 * janela carrega — muito antes de existir sessão. Alargá-la depois não pega:
 * a política do documento já foi decidida. Em vez de abrir a CSP pra rede, o
 * `next dev` do outro Mac entra por aqui e sai em `127.0.0.1`, que já é
 * permitido. O app continua a nunca emoldurar nada que não seja local.
 *
 * O `upgrade` é o que mantém o HMR vivo: sem ele a página do convidado carrega
 * uma vez e nunca mais repinta quando o anfitrião grava.
 */
let espelho: {
  server: Server;
  url: string;
  alvo: string;
  agente: Agent;
  sockets: Set<Socket>;
} | null = null;

function abrirTunel(
  req: IncomingMessage,
  socketCliente: Socket,
  cabeca: Buffer,
  alvo: URL,
  sockets: Set<Socket>,
): void {
  const socketAlvo = connect(Number(alvo.port), alvo.hostname, () => {
    const linhas = Object.entries(req.headers).flatMap(([k, v]) =>
      (Array.isArray(v) ? v : [v]).map((x) => `${k}: ${x}`),
    );
    socketAlvo.write(`${req.method} ${req.url} HTTP/1.1\r\n${linhas.join("\r\n")}\r\n\r\n`);
    if (cabeca.length) socketAlvo.write(cabeca);
    socketAlvo.pipe(socketCliente);
    socketCliente.pipe(socketAlvo);
  });
  // A ponta de saída também entra na lista: `destroy()` não propaga pelo pipe,
  // então sem isto o websocket do HMR ficava pendurado no Mac do anfitrião
  // depois da sessão fechar.
  sockets.add(socketAlvo);
  socketAlvo.on("close", () => sockets.delete(socketAlvo));
  const fechar = (): void => {
    socketAlvo.destroy();
    socketCliente.destroy();
  };
  socketAlvo.on("error", fechar);
  socketCliente.on("error", fechar);
  socketAlvo.on("close", fechar);
  socketCliente.on("close", fechar);
}

/** Devolve o endereço local a apontar no iframe. `alvo` é `http://ip:porta`. */
export function ligarEspelho(alvo: string): Promise<string> {
  if (espelho?.alvo === alvo) return Promise.resolve(espelho.url);
  pararEspelho();
  const destino = new URL(alvo);
  const sockets = new Set<Socket>();
  // Agente próprio em vez do global: ao parar, `destroy()` fecha o pool inteiro
  // de uma vez, sem esperar o timeout do keep-alive.
  const agente = new Agent({ keepAlive: true });

  const server = createServer((req, res) => {
    const saida = request(
      {
        agent: agente,
        host: destino.hostname,
        port: destino.port,
        method: req.method,
        path: req.url,
        headers: { ...req.headers, host: destino.host },
      },
      (resposta) => {
        res.writeHead(resposta.statusCode ?? 502, resposta.headers);
        resposta.pipe(res);
      },
    );
    saida.on("error", () => {
      if (!res.headersSent) res.writeHead(502);
      res.end("o anfitrião não respondeu");
    });
    req.pipe(saida);
  });

  server.on("upgrade", (req, socket, cabeca) =>
    abrirTunel(req, socket as Socket, cabeca, destino, sockets),
  );
  server.on("connection", (s) => {
    sockets.add(s);
    s.on("close", () => sockets.delete(s));
  });

  return new Promise((resolve, reject) => {
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as { port: number };
      const url = `http://127.0.0.1:${port}`;
      espelho = { server, url, alvo, agente, sockets };
      resolve(url);
    });
  });
}

export function pararEspelho(): void {
  if (!espelho) return;
  for (const s of espelho.sockets) s.destroy();
  espelho.agente.destroy();
  espelho.server.close();
  espelho = null;
}

export function urlDoEspelho(): string | null {
  return espelho?.url ?? null;
}
