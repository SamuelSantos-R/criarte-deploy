import { useEffect, useRef, useState, type ReactElement } from "react";
import {
  atualizarSecao,
  estadoPlantio,
  plantarSecao,
  resolverFormulario,
  type Plantio,
} from "@/lib/api";
import { Button } from "@/components/ui/primitives";
import type { Caminho } from "@/components/JsonForm";

/** O link curto do Google, tal como sai do botão Enviar. */
const CURTO = /^https:\/\/forms\.gle\/[A-Za-z0-9_-]+\/?$/;

function Linha({ children }: { children: React.ReactNode }): ReactElement {
  return <p className="border-l-2 border-cyan pl-3 text-[13px] text-text">{children}</p>;
}

/**
 * As duas maneiras de o RSVP existir no editor e não existir na página, que
 * durante muito tempo não davam sinal nenhum: sem formulário ligado o componente
 * esconde-se sozinho, e sem estar plantado não há componente para esconder.
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

  const [plantio, setPlantio] = useState<Plantio | null>(null);
  const [plantando, setPlantando] = useState(false);

  const verificar = (id: string): void => {
    void estadoPlantio(id, "rsvp")
      .then(setPlantio)
      .catch(() => setPlantio(null));
  };

  useEffect(() => {
    if (!siteId) return;
    verificar(siteId);
  }, [siteId]);

  const plantar = (): void => {
    if (!siteId) return;
    setPlantando(true);
    void plantarSecao(siteId, "rsvp")
      .then(setPlantio)
      .catch(() => undefined)
      .finally(() => setPlantando(false));
  };

  const atualizar = (): void => {
    if (!siteId) return;
    setPlantando(true);
    void atualizarSecao(siteId, "rsvp")
      .then(() => verificar(siteId))
      .catch(() => undefined)
      .finally(() => setPlantando(false));
  };

  const foraDaPagina = plantio !== null && !plantio.ligada;
  const velha = plantio?.desatualizada === true;
  const semFormulario = !longo || !nome || !comparecer;
  if (!foraDaPagina && !velha && !semFormulario && !erroUrl && !resolvendo) return null;

  return (
    <div className="mb-4 space-y-3">
      {foraDaPagina &&
        (plantio.impedimento ? (
          <div className="flex items-start gap-3">
            <Linha>
              Esta secção não está na página, e o Studio não a consegue lá pôr:{" "}
              {plantio.impedimento}.
            </Linha>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (siteId) verificar(siteId);
              }}
            >
              Verificar de novo
            </Button>
          </div>
        ) : (
          <div className="flex items-start gap-3">
            <Linha>
              A secção existe no convite.json mas não está na página — é o que acontece com
              convites feitos antes de o Studio saber plantá-la, ou copiados de um assim.
            </Linha>
            <Button variant="primary" size="sm" disabled={plantando} onClick={plantar}>
              {plantando ? "A pôr…" : "Pôr na página"}
            </Button>
          </div>
        ))}

      {velha && (
        <div className="flex items-start gap-3">
          <Linha>
            Esta secção neste convite está atrás do que este Studio traz — no desenho, ou nas
            dependências que o convite leva para a VPS. Sem elas o deploy compila aqui e morre
            lá. Trocar resolve as duas; se alguém mexeu neste componente à mão, essa mão
            perde-se.
          </Linha>
          <Button variant="outline" size="sm" disabled={plantando} onClick={atualizar}>
            {plantando ? "A trocar…" : "Actualizar desenho"}
          </Button>
        </div>
      )}

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
