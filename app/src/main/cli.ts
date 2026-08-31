import { app, type WebContents } from "electron";
import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { dirname } from "node:path";
import { acharNpm, prepararRaiz } from "./deps";
import { cliPath, requireSitesRoot } from "./paths";
import { siteDir } from "./sites";

export type Job =
  | { kind: "deploy"; siteId: string; dryRun: boolean }
  | { kind: "check"; siteId: string }
  | { kind: "fotos"; siteId: string; max: number; qualidade: number }
  | { kind: "doctor" }
  | { kind: "deps" };

const running = new Map<string, ChildProcess>();

/**
 * O renderer manda um Job tipado, nunca argv. Assim não existe caminho pra
 * injetar flag (--guests-reset queima os links já enviados) a partir da UI.
 *
 * `script` é o .js que o Electron-em-modo-Node vai rodar. Quase sempre é o
 * nosso CLI; o job das dependências troca pelo `npm-cli.js` da máquina.
 */
async function plan(job: Job): Promise<{ script: string; args: string[]; cwd: string }> {
  const cli = cliPath();
  switch (job.kind) {
    case "deploy": {
      const cwd = await siteDir(job.siteId);
      const args = ["--yes"];
      if (job.dryRun) args.push("--dry-run");
      return { script: cli, args, cwd };
    }
    case "check":
      return { script: cli, args: ["check"], cwd: await siteDir(job.siteId) };
    case "fotos": {
      const max = Math.min(Math.max(Math.trunc(job.max), 200), 6000);
      const q = Math.min(Math.max(Math.trunc(job.qualidade), 1), 100);
      return {
        script: cli,
        args: ["fotos", ".", "--max", String(max), "--q", String(q)],
        cwd: await siteDir(job.siteId),
      };
    }
    case "doctor":
      return { script: cli, args: ["doctor"], cwd: app.getPath("home") };
    case "deps": {
      const npm = acharNpm();
      if (!npm) throw new Error("não achei o npm nesta máquina");
      await prepararRaiz();
      return {
        script: npm,
        args: ["install", "--no-audit", "--no-fund"],
        cwd: requireSitesRoot(),
      };
    }
    default:
      throw new Error("job desconhecido");
  }
}

export async function startJob(sender: WebContents, job: Job): Promise<string> {
  const { script, args, cwd } = await plan(job);
  const runId = randomUUID();

  // ELECTRON_RUN_AS_NODE faz o próprio binário do Electron rodar como Node,
  // então o app não depende de ter Node instalado na máquina.
  const child = spawn(process.execPath, [script, ...args], {
    cwd,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      NODE_PATH: dirname(script),
      FORCE_COLOR: "0",
      CI: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  running.set(runId, child);

  const emit = (stream: "out" | "err", chunk: Buffer): void => {
    if (sender.isDestroyed()) return;
    sender.send("cli:output", { runId, stream, text: chunk.toString() });
  };
  child.stdout?.on("data", (c: Buffer) => emit("out", c));
  child.stderr?.on("data", (c: Buffer) => emit("err", c));

  const finish = (code: number | null, erro?: string): void => {
    running.delete(runId);
    if (sender.isDestroyed()) return;
    sender.send("cli:done", { runId, code: code ?? -1, erro: erro ?? null });
  };
  child.on("error", (e) => finish(-1, e.message));
  child.on("close", (code) => finish(code));

  return runId;
}

export function cancelJob(runId: unknown): boolean {
  if (typeof runId !== "string") return false;
  const child = running.get(runId);
  if (!child) return false;
  child.kill("SIGTERM");
  return true;
}

export function killAll(): void {
  for (const child of running.values()) child.kill("SIGTERM");
  running.clear();
}
