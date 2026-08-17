"use client";

// ============================================================================
// guest.tsx — Tokenização por convidado (base convite-token)
// ============================================================================
// Cada convidado abre o convite por /<cat>/<slug>?t=<TOKEN>. Este hook lê o
// token da URL, busca em /guests.json (mapa token→nome) e diz se o convite é
// válido. A identidade vem do TOKEN, nunca de input do usuário — quem tem o
// link não consegue se passar por outro convidado nem inventar um nome.
//
// O criarte-deploy CLI gera o guests.json (a partir do seu .txt de convidados)
// e reescreve "/guests.json" pro basePath do site no deploy. Não mexa nisso.
// ============================================================================
import { useEffect, useState } from "react";

export interface Guest {
  token: string | null;
  name: string | null;
  /** Quantas pessoas esse convite cobre (1 quando o .txt não traz "|N"). */
  pax: number;
  valid: boolean;
  loading: boolean;
}

// O valor de cada token no guests.json vem em dois formatos: string simples
// (convite pra 1) ou { name, pax } (convite pra N). Os dois convivem — listas
// geradas antes do pax continuam válidas.
type GuestEntry = string | { name?: string; pax?: number };

function parseEntry(entry: GuestEntry | undefined | null): { name: string | null; pax: number } {
  if (typeof entry === "string") return { name: entry, pax: 1 };
  const name = typeof entry?.name === "string" ? entry.name : null;
  const pax = Number(entry?.pax);
  return { name, pax: Number.isFinite(pax) && pax > 1 ? Math.floor(pax) : 1 };
}

export function useGuest(): Guest {
  const [state, setState] = useState<Guest>({
    token: null,
    name: null,
    pax: 1,
    valid: false,
    loading: true,
  });

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("t");
    if (!token) {
      setState({ token: null, name: null, pax: 1, valid: false, loading: false });
      return;
    }
    let alive = true;
    fetch("/guests.json", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!alive) return;
        const { name, pax } = parseEntry(data?.guests?.[token]);
        setState({ token, name, pax, valid: Boolean(name), loading: false });
      })
      .catch(() => {
        if (alive) setState({ token, name: null, pax: 1, valid: false, loading: false });
      });
    return () => {
      alive = false;
    };
  }, []);

  return state;
}
