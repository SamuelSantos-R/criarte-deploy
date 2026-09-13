import { useCallback, useEffect, useState } from "react";

export type Tema = "pb" | "rosa" | "noturno";

export const TEMAS: { id: Tema; nome: string; amostra: [string, string] }[] = [
  { id: "pb", nome: "Preto e branco", amostra: ["#ffffff", "#111113"] },
  { id: "rosa", nome: "Rosa claro", amostra: ["#faeef2", "#b0426a"] },
  { id: "noturno", nome: "Noturno", amostra: ["#282a36", "#bd93f9"] },
];

const CHAVE = "criarte-studio:tema";

function lerSalvo(): Tema {
  try {
    const v = localStorage.getItem(CHAVE);
    return v === "rosa" || v === "noturno" || v === "pb" ? v : "pb";
  } catch {
    return "pb";
  }
}

/** Chamado antes do React montar: sem isto a janela abre um frame no tema errado. */
export function aplicarTemaSalvo(): void {
  document.documentElement.dataset.tema = lerSalvo();
}

/** O tema é de cada máquina — cada um no seu Mac escolhe o seu. */
export function useTema(): [Tema, (t: Tema) => void] {
  const [tema, setTema] = useState<Tema>(lerSalvo);

  useEffect(() => {
    document.documentElement.dataset.tema = tema;
  }, [tema]);

  const trocar = useCallback((t: Tema) => {
    setTema(t);
    try {
      localStorage.setItem(CHAVE, t);
    } catch {
      /* armazenamento indisponível: vale só nesta sessão */
    }
  }, []);

  return [tema, trocar];
}
