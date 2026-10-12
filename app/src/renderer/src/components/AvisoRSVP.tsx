import { useEffect, useRef, useState, type ReactElement } from "react";
import { resolverFormulario } from "@/lib/api";
import { AvisoPlantio, Linha } from "@/components/AvisoPlantio";
import type { Caminho } from "@/components/JsonForm";

/** O link curto do Google, tal como sai do botão Enviar. */
const CURTO = /^https:\/\/forms\.gle\/[A-Za-z0-9_-]+\/?$/;

/**
 * O que é só do RSVP: sem formulário ligado o componente esconde-se sozinho na
 * página, e nada no editor o dizia. O aviso de estar fora da página ou com o
 * desenho velho é do `AvisoPlantio`, que serve todas as secções com molde.
 */
export function AvisoRSVP({
  siteId,
  rsvp,
  onChange,
}: {
  siteId: string | null;
  rsvp: Record<string, unknown>;
  onChange: (caminho: Caminho, valor: unknown) => void;
}): ReactElement | null {
  const form = (rsvp.form ?? {}) as Record<string, unknown>;
  const url = typeof form.url === "string" ? form.url.trim() : "";
  const nome = typeof form.nome === "string" ? form.nome.trim() : "";
  const comparecer = typeof form.comparecer === "string" ? form.comparecer.trim() : "";
  const longo = url.includes("docs.google.com/forms/");

  const [erroUrl, setErroUrl] = useState<string | null>(null);
  const [resolvendo, setResolvendo] = useState(false);
  // Guarda o link já tentado: sem isto, gravar o resultado voltava a disparar o
  // efeito e o Studio ficava a pedir o mesmo endereço ao Google em roda livre.
  const tentado = useRef("");

  useEffect(() => {
    if (!CURTO.test(url) || tentado.current === url) return;
    tentado.current = url;
    setResolvendo(true);
    setErroUrl(null);
    resolverFormulario(url)
      .then((destino) => onChange(["rsvp", "form", "url"], destino))
      .catch((e: Error) => setErroUrl(e.message))
      .finally(() => setResolvendo(false));
  }, [url, onChange]);

  const semFormulario = !longo || !nome || !comparecer;

  return (
    // `empty:hidden` porque o aviso do plantio esconde-se sozinho: sem ele e sem
    // nada do formulário para dizer, o que sobrava aqui era uma folga de 16px.
    <div className="mb-4 space-y-3 empty:hidden">
      <AvisoPlantio siteId={siteId} secao="rsvp" />

      {resolvendo && <Linha>A seguir o link curto até ao formulário…</Linha>}

      {erroUrl && <Linha>Não deu para seguir esse link: {erroUrl}.</Linha>}

      {!resolvendo && !erroUrl && semFormulario && (
        <Linha>
          Sem formulário ligado a secção não aparece no convite: o botão engolia a resposta.
          Cola aqui o link do Google Form deste casal — curto ou longo, o Studio trata do
          resto.
        </Linha>
      )}
    </div>
  );
}
