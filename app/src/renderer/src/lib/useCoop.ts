import { useCallback, useEffect, useRef, useState } from "react";
import {
  coopAbrir,
  coopEntrar,
  coopEstado,
  coopFechar,
  coopPatch,
  coopTranca,
  onCoopCaiu,
  onCoopCheio,
  onCoopEstado,
  onCoopPatch,
  onCoopTrancas,
  type EstadoCoop,
  type Patch,
  type Tranca,
} from "@/lib/api";

const FORA: EstadoCoop = {
  papel: null,
  siteId: null,
  endereco: null,
  codigo: null,
  pares: [],
  trancas: [],
  aoVivo: null,
  aoVivoLan: null,
  erro: null,
};

type Ganchos = {
  /** Chega um patch do outro lado — aplicar sem reenviar pra rede. */
  aoPatch: (patch: Patch) => void;
  /** O anfitrião mandou o documento inteiro (entrada na sessão ou conflito em disco). */
  aoDocumento: (doc: Record<string, unknown>) => void;
};

/**
 * Uma sessão por app. O estado de verdade vive no main; aqui é só espelho —
 * assim trocar de aba não derruba a sessão nem duplica ligação.
 */
export function useCoop({ aoPatch, aoDocumento }: Ganchos) {
  const [estado, setEstado] = useState<EstadoCoop>(FORA);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const ganchos = useRef({ aoPatch, aoDocumento });
  ganchos.current = { aoPatch, aoDocumento };
  // O anfitrião nunca toma tranca, então toda tranca que ele vê é de outro. O
  // convidado precisa do próprio nome pra separar a dele das alheias.
  const meuNome = useRef<string>("");

  useEffect(() => {
    void coopEstado().then(setEstado).catch(() => {});
    const desligar = [
      onCoopEstado(setEstado),
      onCoopPatch((p) => ganchos.current.aoPatch(p)),
      onCoopCheio(({ doc }) => ganchos.current.aoDocumento(doc)),
      onCoopTrancas(({ trancas }) => setEstado((a) => ({ ...a, trancas }))),
      onCoopCaiu(({ motivo }) => {
        setErro(motivo);
        setEstado(FORA);
      }),
    ];
    return () => desligar.forEach((f) => f());
  }, []);

  const tentar = useCallback(async <T,>(acao: () => Promise<T>): Promise<T | null> => {
    setOcupado(true);
    setErro(null);
    try {
      return await acao();
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
      return null;
    } finally {
      setOcupado(false);
    }
  }, []);

  const abrir = useCallback(
    (siteId: string) => tentar(() => coopAbrir(siteId).then((e) => (setEstado(e), e))),
    [tentar],
  );
  const entrar = useCallback(
    (endereco: string, codigo: string, nome: string) =>
      tentar(() =>
        coopEntrar(endereco, codigo, nome).then((e) => {
          meuNome.current = nome;
          setEstado(e);
          return e;
        }),
      ),
    [tentar],
  );
  const fechar = useCallback(
    () => tentar(() => coopFechar().then((e) => (setEstado(e), e))),
    [tentar],
  );

  /** Publica a edição local. Recusa da rede vira aviso — quem grava é o anfitrião. */
  const publicar = useCallback(async (patch: Patch): Promise<void> => {
    const r = await coopPatch(patch).catch(() => ({ ok: false, erro: "sem ligação" }));
    if (!r.ok) setErro(r.erro ?? "a edição não foi aceite");
  }, []);

  const tomar = useCallback((secao: string) => {
    void coopTranca(secao, false).catch(() => {});
  }, []);
  const soltar = useCallback((secao: string) => {
    void coopTranca(secao, true).catch(() => {});
  }, []);

  const ligado = estado.papel !== null;
  /** Quem está na secção, se não for este Studio. `null` = pode editar. */
  const donoDe = useCallback(
    (secao: string | null): Tranca | null => {
      if (!secao || estado.papel === null) return null;
      const t = estado.trancas.find((x) => x.secao === secao);
      if (!t) return null;
      if (estado.papel === "convidado" && t.nome === meuNome.current) return null;
      return t;
    },
    [estado],
  );

  return { estado, erro, ocupado, ligado, abrir, entrar, fechar, publicar, tomar, soltar, donoDe, setErro };
}
