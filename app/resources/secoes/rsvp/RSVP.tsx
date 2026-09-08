"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import Section from "./Section";
import SectionDivider from "./SectionDivider";
import GoldLine from "./GoldLine";
import { Heart, X, Check, ChevronDown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import convite from "@/lib/convite";

const rsvp = (convite as { rsvp?: Record<string, unknown> }).rsvp ?? {};

const texto = (chave: string, padrao: string): string =>
  typeof rsvp[chave] === "string" && (rsvp[chave] as string).trim() !== ""
    ? (rsvp[chave] as string).trim()
    : padrao;

const form = (rsvp.form ?? {}) as Record<string, string>;

/**
 * O POST do Google Forms só entra no `/formResponse`; o link que se tem à mão é
 * quase sempre o `/viewform`. O `forms.gle` fica de fora de propósito: é um
 * encurtador, só resolve com redirecionamento, e o `no-cors` daqui não deixa ver
 * que o envio falhou — a pessoa via "confirmado" e a planilha ficava vazia.
 */
const destino = ((): string => {
  const url = typeof form.url === "string" ? form.url.trim() : "";
  if (!url.includes("docs.google.com/forms/")) return "";
  const base = url
    .split("?")[0]
    .replace(/\/(viewform|edit|formResponse)\/?$/, "")
    .replace(/\/$/, "");
  return `${base}/formResponse`;
})();

/** Os rótulos são os das opções do form: o Google recusa valor fora da lista. */
const ACOMPANHANTES = [
  { valor: "0", rotulo: "Somente eu" },
  { valor: "1", rotulo: "+1 acompanhante" },
];

const ALIANCAS = texto("aliancas", "");
const PRAZO = texto("prazo", "");

export default function RSVP() {
  const [aberto, setAberto] = useState(false);
  const [confirmado, setConfirmado] = useState(false);
  const [montado, setMontado] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [dados, setDados] = useState({ nome: "", comparecer: "", acompanhantes: "0" });
  const [acompanhantes, setAcompanhantes] = useState<string[]>([]);
  const [listaAberta, setListaAberta] = useState(false);
  const listaRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef(0);

  useEffect(() => {
    setMontado(true);
    if (localStorage.getItem("rsvp-confirmado") === "1") setConfirmado(true);
  }, []);

  useEffect(() => {
    if (!listaAberta) return;
    const fora = (e: MouseEvent): void => {
      if (listaRef.current && !listaRef.current.contains(e.target as Node)) setListaAberta(false);
    };
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, [listaAberta]);

  // A página fica presa enquanto o cartão está aberto, e volta ao mesmo ponto ao
  // fechar: sem isto o fundo rolava por baixo do dedo no telemóvel.
  const abrir = (): void => {
    scrollRef.current = window.scrollY;
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollRef.current}px`;
    document.body.style.width = "100%";
    setAberto(true);
  };

  const fechar = (): void => {
    document.body.style.position = "";
    document.body.style.top = "";
    document.body.style.width = "";
    window.scrollTo({ top: scrollRef.current, behavior: "instant" });
    setAberto(false);
  };

  const escolherComparecer = (valor: string): void => {
    setDados((p) => ({ ...p, comparecer: valor, acompanhantes: valor === "nao" ? "0" : p.acompanhantes }));
    if (valor === "nao") setAcompanhantes([]);
  };

  const escolherAcompanhantes = (valor: string): void => {
    setDados((p) => ({ ...p, acompanhantes: valor }));
    setAcompanhantes(new Array(parseInt(valor, 10)).fill(""));
  };

  const enviar = (e: React.FormEvent): void => {
    e.preventDefault();
    if (enviando) return;
    setEnviando(true);

    const params = new URLSearchParams();
    params.append(form.nome, dados.nome.trim());
    params.append(
      form.comparecer,
      dados.comparecer === "sim" ? "Sim, estarei lá!" : "Infelizmente não",
    );
    params.append(
      form.acompanhantes,
      ACOMPANHANTES.find((o) => o.valor === dados.acompanhantes)?.rotulo ?? "Somente eu",
    );
    params.append(form.acompanhanteNome, acompanhantes.map((n) => n.trim()).join(", "));

    fetch(destino, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    }).then(() => {
      localStorage.setItem("rsvp-confirmado", "1");
      setConfirmado(true);
      setEnviando(false);
      setTimeout(() => fechar(), 2500);
    });
  };

  // Sem form ligado não há o que confirmar. Melhor não existir do que pôr no ar
  // um botão que engole a resposta.
  if (!destino || !form.nome || !form.comparecer) return null;

  const rotulo = "font-medium text-[11.5px] tracking-[2px] uppercase text-chapeu";
  const campo =
    "w-full p-[14px_18px] bg-white border border-card-borda rounded-lg text-base text-destaque outline-none focus:border-gold transition-colors";

  const cartao = (
    <AnimatePresence>
      {aberto && (
        <div
          className="fixed inset-0 z-[9999] flex items-end md:items-center justify-center bg-black/55 backdrop-blur-sm"
          onClick={fechar}
        >
          <motion.div
            className="w-full max-w-[480px] max-h-[92vh] overflow-y-auto bg-white rounded-t-[20px] md:rounded-[20px] p-[22px_24px_30px] shadow-2xl"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 26, stiffness: 210 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-4 border-b border-card-borda pb-3.5 mb-5">
              <p className="font-medium text-left text-[16px] leading-[1.35] text-destaque">
                {PRAZO ? `Por favor, confirme até ${PRAZO}` : "Confirmação de presença"}
              </p>
              <button
                type="button"
                aria-label="Fechar"
                onClick={fechar}
                className="shrink-0 text-historia/60 hover:text-destaque transition-colors"
              >
                <X size={22} />
              </button>
            </div>

            {!confirmado ? (
              <form className="flex flex-col gap-3.5" onSubmit={enviar}>
                <label className="flex flex-col gap-1.5 text-left">
                  <span className={rotulo}>Nome completo</span>
                  <input
                    type="text"
                    required
                    maxLength={80}
                    placeholder="Seu nome"
                    className={campo}
                    value={dados.nome}
                    onChange={(e) => setDados({ ...dados, nome: e.target.value })}
                  />
                </label>

                <div className="flex flex-col gap-1.5 text-left">
                  <span className={rotulo}>Você irá comparecer?</span>
                  <div className="flex gap-2.5 flex-wrap">
                    {["sim", "nao"].map((valor) => (
                      <label
                        key={valor}
                        className={`flex items-center gap-2.5 flex-1 min-w-[140px] p-[14px_16px] bg-white border rounded-lg cursor-pointer font-medium text-base text-destaque transition-colors ${
                          dados.comparecer === valor ? "border-gold" : "border-card-borda"
                        }`}
                      >
                        <input
                          type="radio"
                          name="comparecer"
                          value={valor}
                          required
                          className="appearance-none w-[18px] h-[18px] shrink-0 border-2 border-card-borda rounded-full relative checked:border-destaque checked:after:content-[''] checked:after:absolute checked:after:top-1/2 checked:after:left-1/2 checked:after:-translate-x-1/2 checked:after:-translate-y-1/2 checked:after:w-2 checked:after:h-2 checked:after:bg-destaque checked:after:rounded-full"
                          onChange={() => escolherComparecer(valor)}
                        />
                        {valor === "sim" ? "Sim, estarei lá!" : "Não poderei ir"}
                      </label>
                    ))}
                  </div>
                </div>

                <AnimatePresence>
                  {dados.comparecer === "sim" && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                      className="flex flex-col gap-3.5 overflow-hidden"
                    >
                      <div className="flex flex-col gap-1.5 text-left">
                        <span className={rotulo}>Acompanhantes</span>
                        <div ref={listaRef} className="relative">
                          <button
                            type="button"
                            onClick={() => setListaAberta((v) => !v)}
                            className={`w-full flex items-center justify-between p-[14px_18px] bg-white border rounded-lg font-medium text-base text-destaque transition-colors ${
                              listaAberta ? "border-gold" : "border-card-borda"
                            }`}
                          >
                            {ACOMPANHANTES.find((o) => o.valor === dados.acompanhantes)?.rotulo}
                            <ChevronDown
                              size={18}
                              className={`text-chapeu transition-transform ${listaAberta ? "rotate-180" : ""}`}
                            />
                          </button>
                          {listaAberta && (
                            <ul className="absolute top-full left-0 right-0 mt-1 bg-white border border-card-borda rounded-lg shadow-md z-10 overflow-hidden">
                              {ACOMPANHANTES.map((o) => (
                                <li key={o.valor}>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      escolherAcompanhantes(o.valor);
                                      setListaAberta(false);
                                    }}
                                    className={`w-full text-left p-[13px_18px] font-medium text-base text-destaque hover:bg-cream-dark transition-colors ${
                                      dados.acompanhantes === o.valor ? "bg-cream-dark" : ""
                                    }`}
                                  >
                                    {o.rotulo}
                                  </button>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </div>

                      {acompanhantes.map((_, i) => (
                        <label key={i} className="flex flex-col gap-1.5 text-left">
                          <span className={rotulo}>Nome completo do acompanhante</span>
                          <input
                            type="text"
                            required
                            maxLength={80}
                            placeholder="Nome do acompanhante"
                            className={campo}
                            value={acompanhantes[i]}
                            onChange={(e) => {
                              const proximo = [...acompanhantes];
                              proximo[i] = e.target.value;
                              setAcompanhantes(proximo);
                            }}
                          />
                        </label>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>

                <button
                  type="submit"
                  disabled={enviando}
                  className="mt-1.5 flex items-center justify-center gap-2.5 py-[15px] px-10 bg-destaque text-white border-none font-medium text-xs tracking-[2.5px] uppercase rounded-lg cursor-pointer hover:opacity-85 transition-opacity disabled:opacity-60 disabled:cursor-not-allowed"
                  style={{ textShadow: "0 0 0.4px currentColor", WebkitTextStroke: "0.2px rgb(var(--c-creme))" }}
                >
                  <Heart size={16} className="fill-none stroke-[1.8]" />
                  {enviando ? "Enviando..." : "Confirmar Presença"}
                </button>
              </form>
            ) : (
              <div className="text-center py-4">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", damping: 14, stiffness: 240 }}
                  className="w-12 h-12 mx-auto mb-4 border-2 border-destaque rounded-full flex items-center justify-center"
                >
                  <Check className="text-destaque" size={28} />
                </motion.div>
                <p className="font-medium italic text-[22px] text-destaque mb-2">
                  Presença confirmada!
                </p>
                <p className="font-medium text-sm text-historia leading-[1.5]">
                  Já recebemos a sua resposta. Obrigado!
                </p>
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );

  return (
    <Section
      id="rsvp"
      className="px-6 text-center relative z-10"
      topo={90}
      base={100}
      topDivider={<SectionDivider side="left" offsetRatio={0.93} ancora="rsvp" />}
    >
      <p className="font-medium text-[15px] tracking-[1.5px] uppercase text-chapeu mb-2">
        {texto("eyebrow", "Confirmação")}
      </p>
      <h2 className="section-title !text-destaque">{texto("titulo", "Confirme a Sua Presença")}</h2>
      <GoldLine />

      {ALIANCAS && (
        <div className="flex justify-center mt-6">
          <Image
            src={ALIANCAS}
            alt=""
            width={100}
            height={70}
            className="object-contain opacity-80"
          />
        </div>
      )}

      <p className="text-[clamp(16px,2.5vw,19px)] text-historia leading-[1.8] mt-5 font-medium whitespace-pre-line">
        {texto("chamada", "Sua presença tornará\neste dia ainda mais especial.")}
      </p>

      {PRAZO && (
        <p className="font-medium text-[13px] tracking-[1.5px] uppercase text-chapeu mt-3">
          Confirme até {PRAZO}
        </p>
      )}

      <motion.button
        type="button"
        onClick={abrir}
        className="mx-auto mt-8 flex items-center justify-center gap-2.5 py-[15px] px-10 bg-destaque text-white border-none font-medium text-xs tracking-[2.5px] uppercase rounded-lg cursor-pointer hover:opacity-85 transition-opacity"
        style={{ textShadow: "0 0 0.4px currentColor", WebkitTextStroke: "0.2px rgb(var(--c-creme))" }}
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-8%" }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
      >
        <Heart size={16} className={confirmado ? "fill-current" : "fill-none stroke-[1.8]"} />
        {confirmado ? "Presença Confirmada" : "Confirmar Presença"}
      </motion.button>

      {montado && createPortal(cartao, document.body)}
    </Section>
  );
}
