import { useEffect, useState, type ReactElement, type ReactNode } from "react";
import { atualizarSecao, estadoPlantio, plantarSecao, type Plantio } from "@/lib/api";
import { Button } from "@/components/ui/primitives";

export function Linha({ children }: { children: ReactNode }): ReactElement {
  return <p className="rounded-lg bg-cyan/10 px-3 py-2 text-[13px] text-text">{children}</p>;
}

/**
 * As duas maneiras de uma secção existir no editor e não existir na página — ou
 * existir com um desenho mais velho do que o que este Studio traz. Vive fora do
 * aviso do RSVP porque o mecanismo não é dele: qualquer secção com molde
 * registado no `plantar.ts` precisa da mesma saída.
 *
 * `secao` é a chave do `PLANTAS`, que nem sempre é a chave do painel onde isto
 * aparece: os Pais e o versículo são o mesmo componente na página.
 */
export function AvisoPlantio({
  siteId,
  secao,
}: {
  siteId: string | null;
  secao: string;
}): ReactElement | null {
  const [plantio, setPlantio] = useState<Plantio | null>(null);
  const [plantando, setPlantando] = useState(false);

  const verificar = (id: string): void => {
    void estadoPlantio(id, secao)
      .then(setPlantio)
      .catch(() => setPlantio(null));
  };

  useEffect(() => {
    if (!siteId) return;
    verificar(siteId);
  }, [siteId, secao]);

  const plantar = (): void => {
    if (!siteId) return;
    setPlantando(true);
    void plantarSecao(siteId, secao)
      .then(setPlantio)
      .catch(() => undefined)
      .finally(() => setPlantando(false));
  };

  const atualizar = (): void => {
    if (!siteId) return;
    setPlantando(true);
    void atualizarSecao(siteId, secao)
      .then(() => verificar(siteId))
      .catch(() => undefined)
      .finally(() => setPlantando(false));
  };

  const foraDaPagina = plantio !== null && !plantio.ligada;
  const velha = plantio?.desatualizada === true;
  if (!foraDaPagina && !velha) return null;

  return (
    <>
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
    </>
  );
}
