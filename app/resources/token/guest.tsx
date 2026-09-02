"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type GuestMode = "loading" | "authenticated" | "preview";

type GuestContextValue = {
  guestMode: GuestMode;
  guestName: string | null;
  guestToken: string | null;
};

const GuestContext = createContext<GuestContextValue>({
  guestMode: "loading",
  guestName: null,
  guestToken: null,
});

type GuestsFile = {
  version: number;
  generatedAt?: string;
  site?: string;
  guests: Record<string, string>;
};

export function GuestProvider({ children }: { children: ReactNode }) {
  const [guestMode, setGuestMode] = useState<GuestMode>("loading");
  const [guestName, setGuestName] = useState<string | null>(null);
  const [guestToken, setGuestToken] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const params = new URLSearchParams(window.location.search);
      const token = params.get("t");

      if (!token) {
        if (!cancelled) setGuestMode("preview");
        return;
      }

      try {
        // Resolve o caminho do guests.json a partir da URL atual, funcionando
        // tanto em dev (raiz) quanto em produção sob /<categoria>/<slug>/.
        // Tenta o caminho relativo à pasta do convite primeiro; se falhar,
        // cai pros caminhos absolutos como fallback.
        let dir = window.location.pathname.replace(/\/index\.html?$/i, "/");
        if (!dir.endsWith("/")) dir += "/";
        const candidates = [dir + "guests.json", "/guests.json", "./guests.json"];

        let res: Response | null = null;
        for (const url of candidates) {
          try {
            const r = await fetch(url, { cache: "no-store" });
            if (r.ok) {
              res = r;
              break;
            }
          } catch {
            /* tenta o próximo candidato */
          }
        }

        if (!res || !res.ok) {
          if (process.env.NODE_ENV !== "production") {
            console.warn("[guest] guests.json not found in", candidates);
          }
          if (!cancelled) setGuestMode("preview");
          return;
        }

        const data: GuestsFile = await res.json();

        if (data.version !== 1) {
          if (process.env.NODE_ENV !== "production") {
            console.warn("[guest] unsupported guests.json version:", data.version);
          }
          if (!cancelled) setGuestMode("preview");
          return;
        }

        const name = data.guests?.[token];
        if (!name) {
          if (!cancelled) setGuestMode("preview");
          return;
        }

        if (cancelled) return;
        setGuestToken(token);
        setGuestName(name);
        setGuestMode("authenticated");
      } catch (err) {
        if (process.env.NODE_ENV !== "production") {
          console.warn("[guest] failed to load guests.json:", err);
        }
        if (!cancelled) setGuestMode("preview");
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo(
    () => ({ guestMode, guestName, guestToken }),
    [guestMode, guestName, guestToken],
  );

  return <GuestContext.Provider value={value}>{children}</GuestContext.Provider>;
}

export function useGuest() {
  return useContext(GuestContext);
}
