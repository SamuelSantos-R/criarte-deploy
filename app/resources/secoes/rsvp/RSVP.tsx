"use client";

import { useState, useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import Section from "./Section";
import SectionDivider from "./SectionDivider";
import { Heart, X, Check, ChevronDown, Lock } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import confetti from "canvas-confetti";
import convite from "@/lib/convite";

const rsvp = (convite as { rsvp?: Record<string, unknown> }).rsvp ?? {};
const form = (rsvp.form ?? {}) as Record<string, string>;

const texto = (chave: string, padrao: string): string =>
  typeof rsvp[chave] === "string" && (rsvp[chave] as string).trim() !== ""
    ? (rsvp[chave] as string).trim()
    : padrao;

/**
 * O POST só entra no `/formResponse`; o link que se tem à mão é quase sempre o
 * `/viewform` ou um `forms.gle`. O `no-cors` daqui não deixa ver que o envio
 * falhou — a pessoa via "confirmado" e a planilha ficava vazia.
 */
const GOOGLE_FORM_URL = ((): string => {
  const url = typeof form.url === "string" ? form.url.trim() : "";
  if (!url.includes("docs.google.com/forms/")) return "";
  const base = url
    .split("?")[0]
    .replace(/\/(viewform|edit|formResponse)\/?$/, "")
    .replace(/\/$/, "");
  return `${base}/formResponse`;
})();

const ALIANCAS = texto("aliancas", "/assets/aliancas-casamento.png");

/**
 * O `prazo` continua a ser lido para os convites que já o têm gravado: era só a
 * data, e o "Por favor, confirme até" estava cravado no componente. A `frase`
 * veio porque cada casal escreve a sua à maneira dele.
 */
const PRAZO = texto("prazo", "");
const FRASE = texto("frase", PRAZO ? `Por favor, confirme até ${PRAZO}` : "Por favor, confirme a sua presença");

/** Último dia em que se pode responder, como `AAAA-MM-DD`. Vazio: nunca fecha. */
const LIMITE = texto("limite", "");
const TEXTO_ENCERRADO = texto("encerrado", "Confirmações encerradas");

/**
 * O papel `rsvp` do tema, por variável em vez de classe: o botão pode usar
 * `bg-destaque` porque o Studio só planta esta secção onde o `destaque` existe,
 * mas um papel novo não está no `tailwind.config.ts` de convite nenhum. Assim a
 * cor segue o tema em qualquer convite, e cai no dourado de sempre onde ninguém
 * a escolheu.
 */
const OURO_RSVP = "rgb(var(--c-rsvp, var(--c-realce-profundo)))";
const COR_TEXTO = { color: OURO_RSVP };
/** O rótulo é desenhado com contorno, senão a maiúscula fina desaparece no branco. */
const COR_ROTULO = { color: OURO_RSVP, WebkitTextStroke: `0.2px ${OURO_RSVP}` };
/** Vazio deixa o branco de sempre, como o cartão do Correio do Amor. */
const COR_CARD = { background: "rgb(var(--c-rsvp-fundo, 255 255 255))" };

/**
 * A bolinha do "Sim, estarei lá" e o realce da opção escolhida entre "Somente eu"
 * e "+1 acompanhante". Ficam em papéis próprios porque a marca da escolha nem
 * sempre quer ser a mesma cor do título — e antes eram o `destaque` e um creme,
 * ambos cravados no componente.
 *
 * Vão para variáveis locais em vez de irem direitas à classe: o Tailwind aceita
 * valor arbitrário, mas `var()` encavalitado com vírgulas lá dentro é frágil. Aqui
 * a cascata resolve-se uma vez, e a classe lê uma variável só — que é o que o
 * `::after` do rádio precisa, por ser pseudo-elemento e não aceitar estilo inline.
 */
const CANAL_OPCAO = "var(--c-rsvp-opcao, var(--c-destaque))";
const CANAL_SELECAO = "var(--c-rsvp-selecao, var(--c-fundo-2, 248 240 224))";
const PAPEIS = {
  "--rsvp-opcao": CANAL_OPCAO,
  "--rsvp-selecao": CANAL_SELECAO,
} as CSSProperties;

/** A borda de todos os campos do cartão, a mesma escolhida ou não. */
const BORDA = "border-[rgb(var(--c-card-borda,214_187_141))]";

/**
 * O tamanho da frase do prazo, em pixels. Escrita curta pede letra maior; frase
 * comprida em telemóvel estreito precisa de encolher para não partir em três
 * linhas. Fora do intervalo cai no tamanho com que a secção foi desenhada.
 */
const FRASE_PX = ((): number => {
  const n = rsvp.frasePx;
  return typeof n === "number" && Number.isFinite(n) && n >= 11 && n <= 32 ? n : 17;
})();

/**
 * Fecha no fim do dia limite, pelo relógio de quem abre o convite: a data está
 * escrita no cartão sem fuso nenhum, e quem responde às 23h do último dia ainda
 * está a horas. Data mal escrita não fecha nada — pior que abrir de mais é o
 * convite trancar sozinho por causa de uma gralha.
 */
const jaFechou = (): boolean => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(LIMITE);
  if (!m) return false;
  const fim = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 23, 59, 59, 999);
  return Date.now() > fim.getTime();
};

/** Os números do convite são desenhados na infant, e o prazo vem do json. */
const emInfant = (t: string): ReactNode[] =>
  t.split(/(\d+)/).map((p, i) =>
    /^\d+$/.test(p) ? (
      <span key={i} className="font-infant">
        {p}
      </span>
    ) : (
      <span key={i}>{p}</span>
    ),
  );

function fireWeddingConfetti(canvas: HTMLCanvasElement) {
  const fire = confetti.create(canvas, { resize: true, useWorker: false });
  const colors = ["#7A7F4B", "#A8843F", "#B08A4A", "#F5EDD8", "#FDFAF4"];
  const common: confetti.Options = {
    spread: 45,
    startVelocity: 18,
    gravity: 0.45,
    ticks: 380,
    scalar: 0.9,
    decay: 0.94,
    colors,
    shapes: ["square", "circle"],
    disableForReducedMotion: true,
  };
  setTimeout(() => {
    fire({ ...common, particleCount: 40, angle: 60,  origin: { x: 0.05, y: 0.65 } });
    fire({ ...common, particleCount: 40, angle: 120, origin: { x: 0.95, y: 0.65 } });
  }, 300);
  setTimeout(() => {
    fire({ ...common, particleCount: 30, angle: 65,  startVelocity: 15, origin: { x: 0.08, y: 0.7 } });
    fire({ ...common, particleCount: 30, angle: 115, startVelocity: 15, origin: { x: 0.92, y: 0.7 } });
  }, 800);
  setTimeout(() => {
    fire({ ...common, particleCount: 22, angle: 70,  startVelocity: 14, origin: { x: 0.05, y: 0.72 } });
    fire({ ...common, particleCount: 22, angle: 110, startVelocity: 14, origin: { x: 0.95, y: 0.72 } });
  }, 1400);
}

const ACOMPANHANTES_OPTIONS = [
  { value: "0", label: <>Somente eu</> },
  { value: "1", label: <><span className="font-infant">+1</span> acompanhante</> },
];

export default function RSVP() {
  const [isOpen, setIsOpen] = useState(false);
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [resposta, setResposta] = useState<"sim" | "nao" | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [mounted, setMounted] = useState(false);
  // Só depois de montar: o HTML é estático, e decidir isto na build deixava o
  // convite trancado com a data em que foi publicado.
  const [encerrado, setEncerrado] = useState(false);
  const [formData, setFormData] = useState({
    nome: "",
    comparecer: "",
    acompanhantes: "0",
  });
  const [acompanhantesList, setAcompanhantesList] = useState<string[]>([]);
  const [acompOpen, setAcompOpen] = useState(false);
  const acompRef = useRef<HTMLDivElement>(null);
  const scrollYRef = useRef(0);
  const confettiCanvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!acompOpen) return;
    const handler = (e: MouseEvent) => {
      if (acompRef.current && !acompRef.current.contains(e.target as Node)) {
        setAcompOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [acompOpen]);

  useEffect(() => {
    setMounted(true);
    setEncerrado(jaFechou());
    const confirmed = localStorage.getItem("rsvp-confirmado") === "1";
    if (confirmed) setIsConfirmed(true);
    const respostaSalva = localStorage.getItem("rsvp-resposta");
    if (respostaSalva === "sim" || respostaSalva === "nao") setResposta(respostaSalva);
  }, []);

  const handleOpen = () => {
    scrollYRef.current = window.scrollY;
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollYRef.current}px`;
    document.body.style.width = "100%";
    setIsOpen(true);
  };

  const handleClose = () => {
    document.body.style.position = "";
    document.body.style.top = "";
    document.body.style.width = "";
    window.scrollTo({ top: scrollYRef.current, behavior: "instant" });
    setIsOpen(false);
  };

  const handleComparecerChange = (value: string) => {
    setFormData({ ...formData, comparecer: value });
    if (value === "nao") {
      setFormData((prev) => ({ ...prev, acompanhantes: "0" }));
      setAcompanhantesList([]);
    }
  };

  const handleAcompanhantesChange = (value: string) => {
    const n = parseInt(value, 10);
    setFormData({ ...formData, acompanhantes: value });
    setAcompanhantesList(new Array(n).fill(""));
  };

  const handleAcompanhanteNameChange = (index: number, name: string) => {
    const newList = [...acompanhantesList];
    newList[index] = name;
    setAcompanhantesList(newList);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);

    const ENTRY_NOME       = form.nome;
    const ENTRY_COMPARECER = form.comparecer;
    const ENTRY_ACOMP      = form.acompanhantes;
    const ENTRY_ACOMP_NOME = form.acompanhanteNome;

    const compOpcao = formData.comparecer === 'sim' ? 'Sim, estarei lá!' : 'Infelizmente não';
    const acompOpcao = formData.acompanhantes === '0' ? 'Somente eu' : '+1 acompanhante';
    const acompNome = acompanhantesList.join(", ");

    const params = new URLSearchParams();
    params.append(ENTRY_NOME, formData.nome);
    params.append(ENTRY_COMPARECER, compOpcao);
    if (ENTRY_ACOMP) params.append(ENTRY_ACOMP, acompOpcao);
    if (ENTRY_ACOMP_NOME) params.append(ENTRY_ACOMP_NOME, acompNome);

    fetch(GOOGLE_FORM_URL, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    }).then(() => {
      localStorage.setItem("rsvp-confirmado", "1");
      localStorage.setItem("rsvp-resposta", formData.comparecer);
      setIsConfirmed(true);
      setResposta(formData.comparecer as "sim" | "nao");
      setSubmitting(false);
      if (formData.comparecer === "sim" && confettiCanvasRef.current) {
        fireWeddingConfetti(confettiCanvasRef.current);
      }
      setTimeout(() => handleClose(), 7000);
    });
  };

  const modalContent = (
    <AnimatePresence>
      {isOpen && (
        <div
          className="fixed inset-0 z-[9999] flex items-end md:items-center justify-center bg-black/55 backdrop-blur-sm"
          onClick={handleClose}
        >
          <canvas
            ref={confettiCanvasRef}
            className="fixed inset-0 pointer-events-none"
            style={{ zIndex: 99999, width: "100vw", height: "100vh" }}
          />
          <motion.div
            className="w-full max-w-[460px] md:max-w-[420px] rounded-t-[20px] md:rounded-[22px] p-[22px_24px_32px] shadow-2xl overflow-hidden relative"
            style={{ ...COR_CARD, ...PAPEIS }}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[rgb(var(--c-card-borda,214_187_141))] pb-3.5 mb-[22px]">
              <p className="font-medium text-destaque" style={{ fontSize: `${FRASE_PX}px` }}>{emInfant(FRASE)}</p>
              <button type="button" onClick={handleClose} className="p-0 text-text/60 hover:text-text"><X size={24} /></button>
            </div>

            {!isConfirmed ? (
              <form className="flex flex-col gap-3.5" onSubmit={handleSubmit}>
                <label className="flex flex-col gap-1 text-left">
                  <span className="font-infant text-[11.5px] tracking-[2px] uppercase" style={COR_ROTULO}>Nome completo</span>
                  <input
                    type="text"
                    required
                    placeholder="Seu nome"
                    className="w-full p-[11px_14px] bg-white border border-[rgb(var(--c-card-borda,214_187_141))] rounded-[10px] text-base text-text outline-none focus:border-gold focus:ring-3 focus:ring-gold/15 transition-all"
                    value={formData.nome}
                    onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                  />
                </label>

                <div className="flex flex-col gap-1 text-left">
                  <span className="font-infant text-[11.5px] tracking-[2px] uppercase" style={COR_ROTULO}>Você irá comparecer?</span>
                  <div className="flex gap-2.5 flex-wrap mt-1">
                    {["sim", "nao"].map((val) => (
                      <label
                        key={val}
                        className={`flex items-center gap-2 flex-1 min-w-[130px] p-[11px_14px] bg-white border rounded-[10px] cursor-pointer font-medium text-base text-text transition-all ${BORDA} ${formData.comparecer === val ? "ring-3 ring-[rgb(var(--rsvp-opcao)/0.15)]" : ""}`}
                      >
                        <input
                          type="radio"
                          name="comparecer"
                          value={val}
                          required
                          className="appearance-none w-[18px] h-[18px] border-2 border-[rgb(var(--rsvp-opcao)/0.5)] rounded-full relative checked:border-[rgb(var(--rsvp-opcao))] checked:after:content-[''] checked:after:absolute checked:after:top-1/2 checked:after:left-1/2 checked:after:-translate-x-1/2 checked:after:-translate-y-1/2 checked:after:w-2 checked:after:h-2 checked:after:bg-[rgb(var(--rsvp-opcao))] checked:after:rounded-full"
                          onChange={() => handleComparecerChange(val)}
                        />
                        {val === "sim" ? "Sim, estarei lá!" : "Não poderei ir"}
                      </label>
                    ))}
                  </div>
                </div>

                <AnimatePresence>
                  {formData.comparecer === "sim" && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="flex flex-col gap-3"
                    >
                      <div className="flex flex-col gap-1 text-left">
                        <span className="font-infant text-[11.5px] tracking-[2px] uppercase" style={COR_ROTULO}>Acompanhantes</span>
                        <div ref={acompRef} className="relative">
                          <button
                            type="button"
                            onClick={() => setAcompOpen((v) => !v)}
                            className={`w-full flex items-center justify-between p-[11px_14px] bg-white border rounded-[10px] text-base text-text outline-none transition-all ${BORDA} ${acompOpen ? "ring-3 ring-[rgb(var(--rsvp-opcao)/0.15)]" : ""}`}
                          >
                            <span>
                              {ACOMPANHANTES_OPTIONS.find((o) => o.value === formData.acompanhantes)?.label}
                            </span>
                            <ChevronDown size={18} className={`text-gold-dark transition-transform ${acompOpen ? "rotate-180" : ""}`} />
                          </button>
                          {acompOpen && (
                            <ul className="absolute top-full left-0 right-0 mt-1 bg-white border border-[rgb(var(--c-card-borda,214_187_141))] rounded-[10px] shadow-md z-10 overflow-hidden">
                              {ACOMPANHANTES_OPTIONS.map((opt) => (
                                <li key={opt.value}>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      handleAcompanhantesChange(opt.value);
                                      setAcompOpen(false);
                                    }}
                                    className={`w-full text-left p-[11px_14px] text-base text-text transition-colors hover:bg-[rgb(var(--rsvp-selecao))] ${formData.acompanhantes === opt.value ? "bg-[rgb(var(--rsvp-selecao))]" : ""}`}
                                  >
                                    {opt.label}
                                  </button>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </div>

                      {acompanhantesList.map((_, i) => (
                        <label key={i} className="flex flex-col gap-1 text-left">
                          <span className="font-infant text-[11.5px] tracking-[2px] uppercase" style={COR_ROTULO}>
                            {acompanhantesList.length === 1 ? "Nome completo do acompanhante" : `Nome completo do acompanhante ${i + 1}`}
                          </span>
                          <input
                            type="text"
                            required
                            placeholder="Nome completo do acompanhante"
                            className="w-full p-[11px_14px] bg-white border border-[rgb(var(--c-card-borda,214_187_141))] rounded-[10px] text-base text-text outline-none focus:border-gold transition-all"
                            value={acompanhantesList[i]}
                            onChange={(e) => handleAcompanhanteNameChange(i, e.target.value)}
                          />
                        </label>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>

                <button type="submit" disabled={submitting} className="mt-1.5 self-center inline-block py-[13px] px-11 bg-destaque text-[#ffffff] border-none rounded-full font-medium  text-base cursor-pointer shadow-lg hover:translate-y-[-1px] hover:shadow-xl transition-all disabled:opacity-70 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-lg">
                  {submitting ? "Enviando..." : "Confirmar Presença"}
                </button>
              </form>
            ) : resposta === "nao" ? (
              <div className="text-center pt-2">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="w-12 h-12 mx-auto mb-3.5 border-2 border-[#B33A3A] rounded-full flex items-center justify-center"
                >
                  <X className="text-[#B33A3A]" size={32} />
                </motion.div>
                <p className="font-medium italic text-[22px] text-[#B33A3A] mb-2.5">Sua ausência foi registrada.</p>
                <p className="font-medium text-sm text-[#B33A3A]/70 mb-6 leading-[1.5]">Você já enviou suas informações para este evento.</p>
              </div>
            ) : (
              <div className="text-center pt-2">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="w-12 h-12 mx-auto mb-3.5 border-2 border-destaque rounded-full flex items-center justify-center"
                >
                  <Check className="text-destaque" size={32} />
                </motion.div>
                <p className="font-medium italic text-[22px] text-destaque mb-2.5">Sua presença foi confirmada!</p>
                <p className="font-medium text-sm text-destaque/70 mb-6 leading-[1.5]">Você já enviou suas informações para este evento.</p>
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );

  // Sem form ligado não há o que confirmar. Melhor não existir do que pôr no ar
  // um botão que engole a resposta.
  if (!GOOGLE_FORM_URL || !form.nome || !form.comparecer) return null;

  // Quem já respondeu antes do prazo continua a ver o que respondeu.
  const trancado = encerrado && !isConfirmed;

  return (
    <Section id="rsvp" className="px-6 bg-cream text-center relative z-10" topo={80} base={80} topDivider={<SectionDivider side="right" offsetRatio={0.85} ancora="rsvp" />}>
      <div className="flex justify-center mb-[28px]">
        <Image
          src={ALIANCAS}
          alt="Alianças de casamento"
          width={100}
          height={70}
          className="object-contain opacity-80"
        />
      </div>
      <p className="font-medium text-[15px] tracking-[1px] uppercase mb-3" style={COR_TEXTO}>Sua presença tornará<br />este dia ainda mais especial</p>
      <button
        onClick={handleOpen}
        disabled={trancado}
        className={`inline-flex items-center justify-center gap-1.5 w-full max-w-[350px] py-[13px] px-7 ${resposta === "nao" ? 'bg-[#B33A3A]' : 'bg-destaque'} text-cream border-none font-medium italic text-[19px] tracking-[0.3px] rounded-[15px] transition-all hover:translate-y-[-1px] hover:opacity-90 ${isConfirmed ? 'brightness-95' : ''} ${trancado ? 'opacity-60 grayscale hover:translate-y-0 cursor-not-allowed' : ''}`}
      >
        {trancado ? (
          <Lock className="w-5 h-5 stroke-[1.8]" />
        ) : resposta === "nao" ? (
          <X className="w-5 h-5 stroke-[2]" />
        ) : (
          <Heart className={`w-5 h-5 fill-none stroke-[1.8] ${isConfirmed ? 'fill-cream' : ''}`} />
        )}
        <span>{trancado ? TEXTO_ENCERRADO : resposta === "nao" ? "Ausência Informada" : isConfirmed ? "Presença Confirmada" : "Confirmar Presença"}</span>
      </button>

      {mounted && createPortal(modalContent, document.body)}
    </Section>
  );
}
