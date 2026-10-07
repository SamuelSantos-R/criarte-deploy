import { perguntarSalvar } from "@/lib/api";

// Quem tem edição pendente regista-se aqui (a tela de Convites). Trocar de
// convite ou atualizar o Studio pergunta antes, em vez de descartar calado.
type Pendente = { sujo: boolean; salvar: () => Promise<boolean>; descartar: () => void };
let atual: Pendente | null = null;

export function registarPendente(p: Pendente | null): void {
  atual = p;
}

/** `true` = pode seguir (salvou, descartou ou não havia nada); `false` = cancelou. */
export async function resolverPendente(): Promise<boolean> {
  if (!atual?.sujo) return true;
  const r = await perguntarSalvar();
  if (r === 2) return false;
  if (r === 0) return atual.salvar();
  atual.descartar();
  return true;
}
