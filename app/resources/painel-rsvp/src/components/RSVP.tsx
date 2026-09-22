"use client";

import { useState, useEffect, useRef, ReactNode } from "react";
import { Heart, Check, ChevronDown, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import confetti from "canvas-confetti";
import {
  conteudo,
  coresDoConfete,
  DATA_EVENTO,
  DATA_EVENTO_ISO,
  NOIVOS,
  estiloDaMoldura,
  molduras,
  rotuloAcompanhante,
  rsvpContent,
} from "@/lib/painel";

function fireWeddingConfetti() {
  // Os tons saem do tema do painel: o confete de um casal não é o do outro.
  const colors = coresDoConfete;
  const common: confetti.Options = {
    spread: 70,
    startVelocity: 32,
    gravity: 0.55,
    ticks: 220,
    scalar: 0.85,
    decay: 0.93,
    colors,
    shapes: ["square", "circle"],
    disableForReducedMotion: true,
  };
  confetti({ ...common, particleCount: 55, angle: 60, origin: { x: 0.15, y: 0.6 } });
  confetti({ ...common, particleCount: 55, angle: 120, origin: { x: 0.85, y: 0.6 } });
  setTimeout(() => {
    confetti({ ...common, particleCount: 25, angle: 55, startVelocity: 26, origin: { x: 0.2, y: 0.65 } });
    confetti({ ...common, particleCount: 25, angle: 125, startVelocity: 26, origin: { x: 0.8, y: 0.65 } });
  }, 350);
}

function Countdown({ targetISO }: { targetISO: string }) {
  const target = (() => {
    const m = targetISO?.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return null;
    const dt = new Date(+m[1], +m[2] - 1, +m[3], 0, 0, 0, 0);
    const t = dt.getTime();
    return Number.isNaN(t) ? null : t;
  })();
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    if (!target) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [target]);
  if (!target) return null;
  const diff = target - now;
  if (diff <= 0) {
    return (
      <div className="mt-6 text-center">
        <p className="font-cormorant italic" style={{ fontSize: "20px", color: "#000000" }}>
          O grande dia chegou!
        </p>
      </div>
    );
  }
  const dias = Math.floor(diff / 86400000);
  const horas = Math.floor((diff / 3600000) % 24);
  const mins = Math.floor((diff / 60000) % 60);
  const segs = Math.floor((diff / 1000) % 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  const units = [
    { value: pad(dias), label: "dias" },
    { value: pad(horas), label: "horas" },
    { value: pad(mins), label: "min" },
    { value: pad(segs), label: "seg" },
  ];
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className="mt-6 text-center"
    >
      <p
        className="font-cormorant uppercase mb-3"
        style={{ fontSize: "11px", color: "#000000", letterSpacing: "1.5px" }}
      >
        Contagem regressiva para o grande dia
      </p>
      <div
        className="inline-flex items-center justify-center gap-3 px-5 py-2.5 rounded-[12px] bg-white/70"
        style={{ border: "1px solid rgba(0, 0, 0, 0.5)" }}
      >
        {units.map((u, i) => (
          <div key={u.label} className="flex items-center">
            <div className="flex flex-col items-center min-w-[38px]">
              <span className="font-infant leading-none" style={{ fontSize: "28px", color: "#000000" }}>
                {u.value}
              </span>
              <span
                className="font-cormorant uppercase tracking-[1.3px] mt-1"
                style={{ fontSize: "8.5px", color: "#000000" }}
              >
                {u.label}
              </span>
            </div>
            {i < units.length - 1 && (
              <span
                className="font-infant mx-1.5 leading-none"
                style={{ fontSize: "20px", color: "#000000", opacity: 0.7 }}
                aria-hidden
              >
                •
              </span>
            )}
          </div>
        ))}
      </div>
    </motion.div>
  );
}

const C = rsvpContent;
const H = C.header;
const K = C.card;
const F = C.footer;
const SP = C.spacing;

// Helper: transforma { size, color } em style inline
const s = (o: { size: number; color: string }) => ({
  fontSize: `${o.size}px`,
  color: o.color,
});

// Helper: separa dígitos do resto e aplica font-infant só nos números
// Ex: "21 · Agosto · 2026" → "21" e "2026" ficam em Cormorant Infant
const renderNumbers = (text: string): ReactNode => {
  return text.split(/(\d+)/).map((part, i) =>
    /^\d+$/.test(part) ? (
      <span key={i} className="font-infant" style={{ fontVariantNumeric: "lining-nums" }}>
        {part}
      </span>
    ) : (
      <span key={i}>{part}</span>
    )
  );
};

// ===== Animações =====
// Cada item do cabeçalho aparece em sequência (stagger)
const headerContainer = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.15, delayChildren: 0.1 } },
};
const fadeUp = {
  hidden: { opacity: 0, y: 16, z: 0 },
  visible: { opacity: 1, y: 0, z: 0, transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] as const } },
};
// Card sobe depois que o cabeçalho terminou
const cardEnter = {
  hidden: { opacity: 0, y: 12, scale: 0.97 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: 1.1,
      delay: 0.7,
      ease: [0.16, 1, 0.3, 1] as const,
      opacity: { duration: 0.9, delay: 0.7, ease: "easeOut" as const },
    },
  },
};
// Footer dá fade in por último
const footerEnter = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.6, delay: 1.5 } },
};

export default function RSVP() {
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [foiConfirmado, setFoiConfirmado] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    nome: "",
    comparecer: "",
    acompanhantes: "0",
  });
  const [acompanhantesList, setAcompanhantesList] = useState<string[]>([]);
  const [acompOpen, setAcompOpen] = useState(false);
  const acompRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioStartedRef = useRef(false);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.loop = true;
    audio.volume = 0.35;

    // Nome que aparece no controle de mídia (tela de bloqueio / notificação)
    if ("mediaSession" in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        // Único texto que aparece no controle de mídia (tela de bloqueio).
        // artist/album ficam vazios de propósito: nada mais deve ser exibido.
        title: `Painel RSVP ${NOIVOS}`,
        artist: "",
        album: "",
        artwork: [
          { src: "/assets/criarte-desing.png", sizes: "512x512", type: "image/png" },
        ],
      });
    }

    // Quando a música para/termina, some com o controle de mídia
    const clearMediaSession = () => {
      if ("mediaSession" in navigator) {
        navigator.mediaSession.metadata = null;
        try { navigator.mediaSession.playbackState = "none"; } catch {}
      }
    };
    audio.addEventListener("ended", clearMediaSession);
    audio.addEventListener("pause", clearMediaSession);

    const start = () => {
      if (audioStartedRef.current) return;
      if (localStorage.getItem("rsvp-confirmado") === "1") return;
      audioStartedRef.current = true;
      const p = audio.play();
      if (p && typeof p.catch === "function") p.catch(() => {});
      window.removeEventListener("touchstart", start);
      window.removeEventListener("click", start);
      window.removeEventListener("pointerdown", start);
      window.removeEventListener("keydown", start);
    };
    window.addEventListener("touchstart", start, { passive: true });
    window.addEventListener("click", start);
    window.addEventListener("pointerdown", start);
    window.addEventListener("keydown", start);

    return () => {
      window.removeEventListener("touchstart", start);
      window.removeEventListener("click", start);
      window.removeEventListener("pointerdown", start);
      window.removeEventListener("keydown", start);
      audio.removeEventListener("ended", clearMediaSession);
      audio.removeEventListener("pause", clearMediaSession);
    };
  }, []);

  useEffect(() => {
    if (!isConfirmed) return;
    const audio = audioRef.current;
    if (!audio || audio.paused) return;

    const stopAt = 3500; // para ~3,5s depois da confirmação
    const fadeMs = 2000; // fade suave de 2s até silenciar
    const startVol = audio.volume;

    const fadeTimer = window.setTimeout(() => {
      const stepMs = 40;
      const steps = Math.round(fadeMs / stepMs);
      let i = 0;
      const iv = window.setInterval(() => {
        i++;
        const p = i / steps;
        const eased = 1 - Math.pow(1 - p, 3);
        audio.volume = Math.max(0, startVol * (1 - eased));
        if (i >= steps) {
          window.clearInterval(iv);
          audio.pause();
        }
      }, stepMs);
    }, stopAt - fadeMs);

    return () => window.clearTimeout(fadeTimer);
  }, [isConfirmed]);

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
    if (localStorage.getItem("rsvp-confirmado") === "1") {
      setIsConfirmed(true);
      setFoiConfirmado(localStorage.getItem("rsvp-compareceu") === "sim");
    }
  }, []);

  const handleComparecerChange = (value: string) => {
    setFormData((prev) => ({
      ...prev,
      comparecer: value,
      acompanhantes: value === "nao" ? "0" : prev.acompanhantes,
    }));
    if (value === "nao") setAcompanhantesList([]);
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);

    const comparecer =
      formData.comparecer === "sim" ? "Sim, estarei lá!" : "Infelizmente não";
    const acomp = formData.acompanhantes === "1" ? "+1 acompanhante" : "Somente eu";
    const acompNome = acompanhantesList[0] || "";

    const params = new URLSearchParams();
    params.append("entry.717821013", formData.nome);
    params.append("entry.2035339163", comparecer);
    params.append("entry.165080896", acomp);
    if (acompNome) params.append("entry.1583532518", acompNome);

    try {
      await fetch(
        "https://docs.google.com/forms/d/e/1FAIpQLSdt28TZ4ff315UbGPRGm07YO3619SBN2b8L8V-Rox2XjyX1vw/formResponse",
        { method: "POST", mode: "no-cors", body: params }
      );
    } catch (err) {
      console.error("Erro ao enviar confirmação:", err);
    }

    const vai = formData.comparecer === "sim";
    localStorage.setItem("rsvp-confirmado", "1");
    localStorage.setItem("rsvp-compareceu", vai ? "sim" : "nao");
    setFoiConfirmado(vai);
    setIsConfirmed(true);
    if (vai) fireWeddingConfetti();
  };

  const selectedAcompLabel = K.opcoesAcompanhantes.find(
    (o) => o.value === formData.acompanhantes
  )?.label;

  return (
    <main
      className="relative min-h-[100dvh] flex flex-col px-5"
      style={{
        paddingBottom: "clamp(84px, 12vh, 132px)",
        backgroundColor: "var(--p-fundo)",
      }}
    >
      <audio
        ref={audioRef}
        src="/assets/fundo-musical-rsvp-web.mp3"
        preload="auto"
        loop
        playsInline
        style={{ display: "none" }}
      />

      {/* Barras brancas nas áreas seguras do iPhone (notch em cima / home indicator embaixo) */}
      <div
        className="pointer-events-none fixed top-0 left-0 right-0 z-20 bg-white"
        style={{ height: "env(safe-area-inset-top, 0px)" }}
        aria-hidden
      />
      <div
        className="pointer-events-none fixed bottom-0 left-0 right-0 z-20 bg-white"
        style={{ height: "env(safe-area-inset-bottom, 0px)" }}
        aria-hidden
      />

      {/* Molduras decorativas — vêm da prancheta do Studio: cada uma guarda o
          canto onde encosta, a folga até ele, a largura e os espelhos. O molde
          nasce com a mesma dupla de sempre (superior esquerdo e inferior
          direito), então o painel que ninguém mexer abre igual ao que abria. */}
      {molduras.map((moldura, i) => (
        <img
          key={i}
          src={moldura.arquivo}
          alt=""
          aria-hidden
          className="pointer-events-none select-none fixed z-0"
          style={estiloDaMoldura(moldura)}
        />
      ))}

      {/* Área central — cabeçalho + card crescem para preencher e se centralizam */}
      <div className="relative z-10 flex-1 flex flex-col justify-start" style={{ paddingTop: "clamp(84px, 16vh, 150px)" }}>

      {/* Cabeçalho */}
      {!isConfirmed && (
      <header className="text-center max-w-[480px] mx-auto">
        <p
          className="font-garamond tracking-[2px] anim-fade-up anim-stagger-1"
          style={s(H.eyebrow)}
        >
          {H.eyebrow.text}
        </p>
        {H.eyebrow2.text ? (
          <p
            className="font-garamond tracking-[2px] anim-fade-up anim-stagger-2"
            style={{ ...s(H.eyebrow2), marginTop: SP.betweenEyebrowLines }}
          >
            {H.eyebrow2.text}
          </p>
        ) : null}
        <h1
          className="font-manstein leading-[1] whitespace-nowrap anim-fade-up anim-stagger-2"
          style={{
            ...s(H.coupleName),
            // 14.5vw + padding lateral: a Milton One tem floreio no "L" que
            // estoura a caixa do glifo — sem essa folga o começo do nome corta.
            fontSize: `clamp(38px, 14.5vw, ${H.coupleName.size}px)`,
            paddingLeft: 10,
            paddingRight: 10,
            WebkitTextStroke: "0.2px",
            marginTop: SP.betweenEyebrowAndName,
          }}
        >
          {H.coupleName.text}
        </h1>
        <p
          className="font-garamond tracking-[2px] anim-fade-up anim-stagger-3"
          style={{
            ...s(H.date),
            marginTop: SP.betweenNameAndDate,
            marginBottom: H.deadline?.text ? 0 : SP.betweenDividerAndCard,
          }}
        >
          {renderNumbers(H.date.text)}
        </p>
        {H.deadline && H.deadline.text && (
          <p
            className="font-infant italic anim-fade-up anim-stagger-4"
            style={{
              ...s(H.deadline),
              marginTop: 6,
              marginBottom: SP.betweenDividerAndCard + 12,
              opacity: 0.85,
            }}
          >
            {renderNumbers(H.deadline.text)}
          </p>
        )}
      </header>
      )}

      {/* Card */}
      <div
        className="w-full max-w-[380px] mx-auto bg-white rounded-[20px] shadow-lg anim-card-in"
        style={{ padding: SP.cardPadding }}
      >
        {!isConfirmed ? (
          <form className="flex flex-col" onSubmit={handleSubmit}>
            <div
              className="flex flex-col"
              style={{ gap: SP.betweenFields }}
            >
              <label
                className="flex flex-col text-left"
                style={{ gap: SP.labelToInput }}
              >
                <span
                  className="font-garamond tracking-[2px]"
                  style={{ ...s(K.labelNome), WebkitTextStroke: "0.2px" }}
                >
                  {K.labelNome.text}
                </span>
                <input
                  type="text"
                  required
                  placeholder={K.placeholderNome}
                  className="w-full p-[12px_16px] bg-white border border-gold-light rounded-[10px] outline-none focus:border-gold focus:ring-3 focus:ring-gold/15 transition-all"
                  style={s(K.inputNome)}
                  value={formData.nome}
                  onChange={(e) =>
                    setFormData({ ...formData, nome: e.target.value })
                  }
                />
              </label>

              <div
                className="flex flex-col text-left"
                style={{ gap: SP.labelToInput }}
              >
                <span
                  className="font-garamond tracking-[2px]"
                  style={{ ...s(K.labelComparecer), WebkitTextStroke: "0.2px" }}
                >
                  {K.labelComparecer.text}
                </span>
                <div className="flex flex-col gap-2.5">
                  {(["sim", "nao"] as const).map((val) => {
                    const opt = val === "sim" ? K.opcaoSim : K.opcaoNao;
                    return (
                      <label
                        key={val}
                        className={`flex items-center gap-3 w-full p-[12px_16px] bg-white border rounded-[10px] cursor-pointer transition-all ${
                          formData.comparecer === val
                            ? "border-gold ring-3 ring-gold/15"
                            : "border-gold-light"
                        }`}
                        style={s(opt)}
                      >
                        <input
                          type="radio"
                          name="comparecer"
                          value={val}
                          required
                          className="appearance-none w-[18px] h-[18px] border-2 border-[color:var(--p-destaque)]/50 rounded-full relative shrink-0 checked:border-[color:var(--p-destaque)] checked:after:content-[''] checked:after:absolute checked:after:top-1/2 checked:after:left-1/2 checked:after:-translate-x-1/2 checked:after:-translate-y-1/2 checked:after:w-2 checked:after:h-2 checked:after:bg-[color:var(--p-destaque)] checked:after:rounded-full"
                          onChange={() => handleComparecerChange(val)}
                        />
                        {opt.text}
                      </label>
                    );
                  })}
                </div>
              </div>

              <AnimatePresence>
                {formData.comparecer === "sim" && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="flex flex-col"
                    style={{
                      gap: SP.betweenFields,
                      // Mantém overflow hidden só durante animação de fechar/abrir,
                      // libera quando o dropdown está aberto pra mostrar todas as opções
                      overflow: acompOpen ? "visible" : "hidden",
                    }}
                  >
                    <div
                      className="flex flex-col text-left"
                      style={{ gap: SP.labelToInput }}
                    >
                      <span
                        className="font-garamond tracking-[2px]"
                        style={{ ...s(K.labelAcompanhantes), WebkitTextStroke: "0.2px" }}
                      >
                        {K.labelAcompanhantes.text}
                      </span>
                      <div ref={acompRef} className="relative">
                        <button
                          type="button"
                          onClick={() => setAcompOpen((v) => !v)}
                          className={`w-full flex items-center justify-between p-[12px_16px] bg-white border rounded-[10px] outline-none transition-all ${
                            acompOpen
                              ? "border-gold ring-3 ring-gold/15"
                              : "border-gold-light"
                          }`}
                          style={s(K.dropdownAcomp)}
                        >
                          <span>{selectedAcompLabel}</span>
                          <ChevronDown
                            size={18}
                            className={`text-gold-dark transition-transform ${
                              acompOpen ? "rotate-180" : ""
                            }`}
                          />
                        </button>
                        {acompOpen && (
                          <ul className="absolute top-full left-0 right-0 mt-1 bg-white border border-gold-light rounded-[10px] shadow-md z-10 overflow-hidden">
                            {K.opcoesAcompanhantes.map((opt) => (
                              <li key={opt.value}>
                                <button
                                  type="button"
                                  onClick={() => {
                                    handleAcompanhantesChange(opt.value);
                                    setAcompOpen(false);
                                  }}
                                  className={`w-full text-left p-[12px_16px] hover:bg-cream-dark transition-colors ${
                                    formData.acompanhantes === opt.value
                                      ? "bg-cream-dark"
                                      : ""
                                  }`}
                                  style={s(K.dropdownAcomp)}
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
                      <label
                        key={i}
                        className="flex flex-col text-left"
                        style={{ gap: SP.labelToInput }}
                      >
                        <span
                          className="font-garamond tracking-[2px]"
                          style={{ ...s(K.labelAcompanhanteStyle), WebkitTextStroke: "0.2px" }}
                        >
                          {acompanhantesList.length === 1
                            ? rotuloAcompanhante(i + 1, 1)
                            : rotuloAcompanhante(i + 1, 2)}
                        </span>
                        <input
                          type="text"
                          required
                          placeholder={K.placeholderAcompanhante}
                          className="w-full p-[12px_16px] bg-white border border-gold-light rounded-[10px] outline-none focus:border-gold transition-all"
                          style={s(K.inputAcompanhante)}
                          value={acompanhantesList[i]}
                          onChange={(e) =>
                            handleAcompanhanteNameChange(i, e.target.value)
                          }
                        />
                      </label>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>

              <button
                type="submit"
                disabled={isSubmitting}
                className="self-center inline-flex items-center gap-2 py-[13px] px-8 sm:px-12 bg-[color:var(--p-destaque)] border-none rounded-full font-garamond tracking-[1.5px] cursor-pointer shadow-md hover:shadow-xl hover:opacity-95 transition-[box-shadow,opacity] duration-300 ease-out disabled:opacity-60 disabled:cursor-not-allowed whitespace-nowrap"
                style={{
                  ...s(K.botaoEnviar),
                  marginTop: SP.betweenFormAndButton,
                }}
              >
                <Heart
                  size={16}
                  className="fill-current stroke-[1.5] shrink-0 pointer-events-none"
                  style={{ color: K.botaoEnviar.color, transform: "translateZ(0)" }}
                />
                <span
                  className="leading-none pointer-events-none whitespace-nowrap"
                  style={{ WebkitTextStroke: "0.2px", color: K.botaoEnviar.color }}
                >
                  {formData.comparecer === "nao" ? "ENVIAR RESPOSTA" : K.botaoEnviar.text}
                </span>
              </button>
            </div>
          </form>
        ) : (
          <div className="text-center py-4">
            {(() => {
              const msg = foiConfirmado ? K.sucessoSim : K.sucessoNao;
              const accent = foiConfirmado ? conteudo.tema.sucesso : msg.titulo.color;
              return (
                <>
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="w-12 h-12 mx-auto mb-3.5 border-2 rounded-full flex items-center justify-center"
                    style={{ borderColor: accent }}
                  >
                    {foiConfirmado ? (
                      <Check size={28} style={{ color: accent }} />
                    ) : (
                      <X size={28} style={{ color: accent }} />
                    )}
                  </motion.div>
                  <p
                    className="font-cormorant font-medium italic mb-0"
                    style={{ ...s(msg.titulo), color: accent }}
                  >
                    {msg.titulo.text}
                  </p>
                  <p
                    className="font-cormorant font-medium leading-[1.5]"
                    style={{ ...s(msg.subtitulo), opacity: 0.75, marginTop: -2 }}
                  >
                    {msg.subtitulo.text}
                  </p>
                  <Countdown targetISO={DATA_EVENTO_ISO} />
                </>
              );
            })()}
          </div>
        )}
      </div>

      {isConfirmed && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.25, ease: [0.22, 1, 0.36, 1] }}
          className="w-full max-w-[380px] mx-auto text-center mt-11"
        >
          <p className="font-manstein leading-[1]" style={{ fontSize: "48px", color: "var(--p-destaque)", WebkitTextStroke: "0.2px" }}>
            {NOIVOS}
          </p>
          <p
            className="font-cormorant uppercase tracking-[2px] mt-4"
            style={{ fontSize: "12px", color: "#000000" }}
          >
            {renderNumbers(DATA_EVENTO.toUpperCase())}
          </p>
        </motion.div>
      )}

      </div>{/* fim da área central */}

      {/* Rodapé */}
      <footer
        className="text-center relative z-10 anim-footer-in"
        style={{ marginTop: SP.betweenCardAndFooter }}
      >
        <p
          className="font-cormorant font-medium tracking-[1px]"
          style={{ fontSize: `${F.size}px`, color: F.color }}
        >
          {F.prefix}{" "}
          <a
            href={F.creditUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 hover:opacity-70"
          >
            {F.creditName}
          </a>
        </p>
      </footer>
    </main>
  );
}
