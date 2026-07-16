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
  valid: boolean;
  loading: boolean;
}

export function useGuest(): Guest {
  const [state, setState] = useState<Guest>({
    token: null,
    name: null,
    valid: false,
    loading: true,
  });

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("t");
    if (!token) {
      setState({ token: null, name: null, valid: false, loading: false });
      return;
    }
    let alive = true;
    fetch("/guests.json", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!alive) return;
        const name: string | null = data?.guests?.[token] ?? null;
        setState({ token, name, valid: Boolean(name), loading: false });
      })
      .catch(() => {
        if (alive) setState({ token, name: null, valid: false, loading: false });
      });
    return () => {
      alive = false;
    };
  }, []);

  return state;
}
