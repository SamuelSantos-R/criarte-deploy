import { useCallback, useEffect, useRef, useState } from "react";
import { cancelJob, onDone, onOutput, startJob, type Job } from "./api";

export type Linha = { n: number; stream: "out" | "err"; texto: string };
export type Estado = "parado" | "rodando" | "ok" | "falhou";

// O CLI pinta a saída na unha, ignorando FORCE_COLOR — os escapes chegariam
// como "[38;2;200;160;90m" no meio do texto.
const ANSI = /\u001B\[[0-?]*[ -/]*[@-~]/g;

/**
 * O CLI chega em pedaços, não em linhas. O buffer segura o rabo incompleto até
 * o próximo chunk — sem ele, uma linha vira duas na tela na hora errada.
 */
export function useJob(): {
  linhas: Linha[];
  estado: Estado;
  rodando: boolean;
  erro: string | null;
  rodar: (job: Job) => Promise<void>;
  cancelar: () => void;
  limpar: () => void;
} {
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [estado, setEstado] = useState<Estado>("parado");
  const [erro, setErro] = useState<string | null>(null);
  const runId = useRef<string | null>(null);
  const buffer = useRef("");
  const contador = useRef(0);

  useEffect(() => {
    const push = (stream: "out" | "err", partes: string[]): void => {
      if (partes.length === 0) return;
      setLinhas((atual) => [
        ...atual.slice(-2000),
        ...partes.map((texto) => ({ n: contador.current++, stream, texto: texto.replace(ANSI, "") })),
      ]);
    };

    const offOut = onOutput(({ runId: id, stream, text }) => {
      if (id !== runId.current) return;
      buffer.current += text;
      const partes = buffer.current.split("\n");
      buffer.current = partes.pop() ?? "";
      // \r é barra de progresso se sobrescrevendo — fica só o último estado.
      push(stream, partes.map((l) => l.split("\r").pop() ?? l));
    });

    const offDone = onDone(({ runId: id, code, erro: falha }) => {
      if (id !== runId.current) return;
      if (buffer.current) push("out", [buffer.current]);
      buffer.current = "";
      runId.current = null;
      setErro(falha);
      setEstado(code === 0 ? "ok" : "falhou");
    });

    return () => {
      offOut();
      offDone();
    };
  }, []);

  const rodar = useCallback(async (job: Job) => {
    if (runId.current) return;
    setLinhas([]);
    setErro(null);
    buffer.current = "";
    setEstado("rodando");
    try {
      runId.current = await startJob(job);
    } catch (e) {
      setEstado("falhou");
      setErro(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const cancelar = useCallback(() => {
    if (runId.current) void cancelJob(runId.current);
  }, []);

  const limpar = useCallback(() => {
    setLinhas([]);
    setErro(null);
    setEstado("parado");
  }, []);

  return { linhas, estado, rodando: estado === "rodando", erro, rodar, cancelar, limpar };
}
