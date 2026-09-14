import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CalendarDays, NotebookPen, Plus, Trash2, X } from "lucide-react";
import type { Site } from "@/lib/api";
import { Button, Field, Input, Textarea } from "@/components/ui/primitives";
import { NumeroAnimado } from "@/components/ui/NumeroAnimado";
import { Topo } from "@/components/Topo";
import { cn } from "@/lib/utils";

// ============================================================================
// QUADRO — o kanban de quem faz os convites. Mora no localStorage desta
// máquina e não sobe para lado nenhum: cada pessoa organiza o seu trabalho.
// ============================================================================

type Coluna = { id: string; nome: string };
type Cartao = { id: string; coluna: string; titulo: string; site: string; prazo: string; notas: string; criado: string };
type Estado = { v: 1; colunas: Coluna[]; cartoes: Cartao[] };

const CHAVE = "criarte.quadro.v1";
const COLUNAS: Coluna[] = [
  { id: "briefing", nome: "Briefing" },
  { id: "producao", nome: "Em produção" },
  { id: "revisao", nome: "Revisão do casal" },
  { id: "aprovado", nome: "Aprovado" },
  { id: "publicado", nome: "Publicado" },
];

const novoId = (): string => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

function ler(): Estado {
  try {
    const bruto = JSON.parse(localStorage.getItem(CHAVE) ?? "null") as Estado | null;
    if (bruto && bruto.v === 1 && Array.isArray(bruto.colunas) && Array.isArray(bruto.cartoes)) return bruto;
  } catch {
    /* quadro ilegível começa limpo em vez de derrubar a tela */
  }
  return { v: 1, colunas: COLUNAS, cartoes: [] };
}

function prazoRotulo(prazo: string): { texto: string; atrasado: boolean } | null {
  if (!prazo) return null;
  const d = new Date(`${prazo}T23:59:59`);
  if (Number.isNaN(d.getTime())) return null;
  const hoje = new Date();
  return {
    texto: d.toLocaleDateString("pt-PT", { day: "2-digit", month: "short" }),
    atrasado: d.getTime() < hoje.getTime(),
  };
}

export function Quadro({ sites }: { sites: Site[] }): ReactElement {
  const [estado, setEstado] = useState<Estado>(ler);
  const [aberto, setAberto] = useState<string | null>(null);
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [alvo, setAlvo] = useState<string | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(CHAVE, JSON.stringify(estado));
    } catch {
      /* sem espaço ou bloqueado: o quadro continua a funcionar nesta sessão */
    }
  }, [estado]);

  const mudarCartao = (id: string, parcial: Partial<Cartao>): void =>
    setEstado((e) => ({ ...e, cartoes: e.cartoes.map((c) => (c.id === id ? { ...c, ...parcial } : c)) }));

  const criar = (coluna: string): void => {
    const cartao: Cartao = { id: novoId(), coluna, titulo: "", site: "", prazo: "", notas: "", criado: new Date().toISOString() };
    setEstado((e) => ({ ...e, cartoes: [...e.cartoes, cartao] }));
    setAberto(cartao.id);
  };

  const apagar = (id: string): void => {
    setEstado((e) => ({ ...e, cartoes: e.cartoes.filter((c) => c.id !== id) }));
    setAberto(null);
  };

  const mover = (id: string, coluna: string, antesDe: string | null): void =>
    setEstado((e) => {
      const cartao = e.cartoes.find((c) => c.id === id);
      if (!cartao) return e;
      const resto = e.cartoes.filter((c) => c.id !== id);
      const movido = { ...cartao, coluna };
      const i = antesDe ? resto.findIndex((c) => c.id === antesDe) : -1;
      if (i < 0) return { ...e, cartoes: [...resto, movido] };
      return { ...e, cartoes: [...resto.slice(0, i), movido, ...resto.slice(i)] };
    });

  const convites = useMemo(() => sites.filter((s) => s.temConvite).map((s) => s.id), [sites]);
  const cartaoAberto = estado.cartoes.find((c) => c.id === aberto) ?? null;

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      <Topo>
        <span className="font-narrow text-label font-semibold text-muted">Quadro dos convites</span>
        <span className="ml-2 text-[11px] text-muted">Só nesta máquina — não vai para a nuvem.</span>
        <Button variant="primary" className="ml-auto h-9 rounded-full px-4" onClick={() => criar(estado.colunas[0].id)}>
          <Plus size={14} /> Novo convite
        </Button>
      </Topo>

      <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto p-4">
        {estado.colunas.map((col) => {
          const cartoes = estado.cartoes.filter((c) => c.coluna === col.id);
          return (
            <section
              key={col.id}
              aria-label={col.nome}
              onDragOver={(e) => {
                if (!arrastando) return;
                e.preventDefault();
                if (alvo === null || !cartoes.some((c) => c.id === alvo)) setAlvo(`col:${col.id}`);
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (arrastando) mover(arrastando, col.id, alvo && !alvo.startsWith("col:") ? alvo : null);
                setArrastando(null);
                setAlvo(null);
              }}
              className={cn(
                "flex w-[272px] shrink-0 flex-col rounded-2xl bg-surface-2/60 p-2 transition-colors",
                arrastando && alvo === `col:${col.id}` && "bg-cyan/10",
              )}
            >
              <header className="flex items-center gap-2 px-2 pb-2 pt-1">
                <span className="text-[13px] font-bold text-text">{col.nome}</span>
                <span className="rounded-full bg-surface px-2 text-[11px] font-semibold text-muted">
                  <NumeroAnimado valor={cartoes.length} />
                </span>
                <button
                  type="button"
                  onClick={() => criar(col.id)}
                  aria-label={`Novo cartão em ${col.nome}`}
                  className="no-drag ml-auto flex h-7 w-7 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface hover:text-text"
                >
                  <Plus size={15} />
                </button>
              </header>

              <div className="flex min-h-[60px] flex-1 flex-col gap-2 overflow-y-auto pb-1">
                <AnimatePresence initial={false}>
                  {cartoes.map((c) => {
                    const prazo = prazoRotulo(c.prazo);
                    return (
                      <motion.button
                        layout
                        key={c.id}
                        type="button"
                        draggable
                        onDragStart={(e) => {
                          const ev = e as unknown as DragEvent;
                          ev.dataTransfer?.setData("text/plain", c.id);
                          setArrastando(c.id);
                        }}
                        onDragEnd={() => {
                          setArrastando(null);
                          setAlvo(null);
                        }}
                        onDragOver={(e) => {
                          if (!arrastando || arrastando === c.id) return;
                          e.preventDefault();
                          setAlvo(c.id);
                        }}
                        onClick={() => setAberto(c.id)}
                        initial={{ opacity: 0, y: 8, scale: 0.97 }}
                        animate={{ opacity: arrastando === c.id ? 0.45 : 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ type: "spring", stiffness: 480, damping: 36 }}
                        className={cn(
                          "no-drag group w-full cursor-grab rounded-xl border border-rule bg-surface p-3 text-left shadow-sm transition-[border-color,box-shadow] hover:border-rule-strong hover:shadow-md active:cursor-grabbing",
                          arrastando && alvo === c.id && "border-cyan",
                        )}
                      >
                        <p className={cn("text-[13px] font-semibold leading-snug", c.titulo ? "text-text" : "text-muted")}>
                          {c.titulo || "Sem título"}
                        </p>
                        {c.site && <p className="mt-1 truncate font-mono text-[11px] text-muted">{c.site}</p>}
                        {(prazo || c.notas) && (
                          <div className="mt-2.5 flex items-center gap-3 text-[11px] text-muted">
                            {prazo && (
                              <span className={cn("flex items-center gap-1", prazo.atrasado && c.coluna !== "publicado" && "text-pencil")}>
                                <CalendarDays size={12} /> {prazo.texto}
                              </span>
                            )}
                            {c.notas && (
                              <span className="flex items-center gap-1">
                                <NotebookPen size={12} /> nota
                              </span>
                            )}
                          </div>
                        )}
                      </motion.button>
                    );
                  })}
                </AnimatePresence>
              </div>
            </section>
          );
        })}
      </div>

      <AnimatePresence>
        {cartaoAberto && (
          <DetalheCartao
            key={cartaoAberto.id}
            cartao={cartaoAberto}
            colunas={estado.colunas}
            convites={convites}
            onMudar={(p) => mudarCartao(cartaoAberto.id, p)}
            onApagar={() => apagar(cartaoAberto.id)}
            onFechar={() => setAberto(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function DetalheCartao({
  cartao,
  colunas,
  convites,
  onMudar,
  onApagar,
  onFechar,
}: {
  cartao: Cartao;
  colunas: Coluna[];
  convites: string[];
  onMudar: (p: Partial<Cartao>) => void;
  onApagar: () => void;
  onFechar: () => void;
}): ReactElement {
  const titulo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!cartao.titulo) titulo.current?.focus();
    const tecla = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onFechar();
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
    // Só ao abrir: focar a cada letra roubaria o cursor das notas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <motion.div
      className="no-drag fixed inset-0 z-50 flex justify-end bg-ground/60"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onMouseDown={(e) => e.target === e.currentTarget && onFechar()}
    >
      <motion.aside
        role="dialog"
        aria-modal="true"
        aria-label="Detalhes do cartão"
        initial={{ x: 40, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: 40, opacity: 0 }}
        transition={{ type: "spring", stiffness: 420, damping: 38 }}
        className="m-3 flex w-[420px] flex-col rounded-2xl border border-rule bg-surface shadow-flutua"
      >
        <div className="flex items-center gap-2 border-b border-rule px-5 py-3">
          <span className="text-[13px] font-bold text-text">Cartão</span>
          <button type="button" onClick={onFechar} aria-label="Fechar" className="ml-auto rounded-full p-1.5 text-muted hover:bg-surface-2 hover:text-text">
            <X size={15} />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
          <Field label="Título">
            <Input ref={titulo} value={cartao.titulo} onChange={(e) => onMudar({ titulo: e.target.value })} placeholder="Joana & Ricardo" />
          </Field>
          <Field label="Status">
            <select
              value={cartao.coluna}
              onChange={(e) => onMudar({ coluna: e.target.value })}
              className="no-drag h-9 w-full rounded-lg border border-rule bg-surface px-3 text-[13px] text-text"
            >
              {colunas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Convite">
              <select
                value={cartao.site}
                onChange={(e) => onMudar({ site: e.target.value })}
                className="no-drag h-9 w-full rounded-lg border border-rule bg-surface px-2 text-[12px] text-text"
              >
                <option value="">— nenhum —</option>
                {convites.map((s) => (
                  <option key={s} value={s}>
                    {s.split("/").pop()}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Prazo">
              <Input type="date" value={cartao.prazo} onChange={(e) => onMudar({ prazo: e.target.value })} />
            </Field>
          </div>
          <Field label="Notas" hint="Pedidos do casal, pendências, o que for — fica só aqui.">
            <Textarea rows={10} value={cartao.notas} onChange={(e) => onMudar({ notas: e.target.value })} placeholder="Trocar a foto do hero, confirmar horário do copo-d'água…" />
          </Field>
        </div>

        <div className="flex items-center border-t border-rule px-5 py-3">
          <span className="text-[11px] text-muted">
            Criado a {new Date(cartao.criado).toLocaleDateString("pt-PT", { day: "2-digit", month: "long" })}
          </span>
          <Button variant="ghost" className="ml-auto rounded-full text-pencil hover:bg-pencil/10 hover:text-pencil" onClick={onApagar}>
            <Trash2 size={13} /> Apagar
          </Button>
        </div>
      </motion.aside>
    </motion.div>
  );
}
