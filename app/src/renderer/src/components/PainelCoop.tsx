import { useEffect, useState, type ReactElement } from "react";
import { Laptop, Lock, Radio, Unplug, Users } from "lucide-react";
import { Button, Input } from "@/components/ui/primitives";
import {
  coopVizinhos,
  onCoopVizinhos,
  type EstadoCoop,
  type Perto,
  type Tranca,
  type Vizinho,
} from "@/lib/api";

/** O código é feito pra ser lido em voz alta atravessando a sala. Daí o tamanho. */
function Codigo({ valor }: { valor: string }): ReactElement {
  return (
    <div>
      <span className="mb-2 block font-mono text-label uppercase text-muted">código</span>
      <span className="block font-mono text-[42px] leading-none tracking-[0.22em] text-accent">
        {valor}
      </span>
    </div>
  );
}

function Pares({ pares, trancas }: { pares: string[]; trancas: Tranca[] }): ReactElement {
  return (
    <div className="mt-7">
      <div className="mb-3 flex items-baseline gap-3">
        <span className="font-mono text-label uppercase text-text">na mesa</span>
        <span className="font-mono text-serial text-muted/60">
          {String(pares.length + 1).padStart(2, "0")}
        </span>
        <span className="h-px flex-1 bg-rule" />
      </div>
      <ul className="space-y-1.5">
        <li className="flex items-center gap-2 text-[13px] text-text">
          <Users size={13} className="text-muted" aria-hidden />
          tu <span className="font-mono text-[11px] text-muted">(anfitrião)</span>
        </li>
        {pares.map((nome) => {
          const onde = trancas.find((t) => t.nome === nome);
          return (
            <li key={nome} className="flex items-center gap-2 text-[13px] text-text">
              <Radio size={13} className="text-ok" aria-hidden />
              {nome}
              {onde && (
                <span className="flex items-center gap-1 font-mono text-[11px] text-muted">
                  <Lock size={10} aria-hidden />
                  {onde.secao}
                </span>
              )}
            </li>
          );
        })}
        {pares.length === 0 && (
          <li className="text-[12px] text-muted">ninguém entrou ainda — passa o código.</li>
        )}
      </ul>
    </div>
  );
}

/**
 * Quem está a servir agora, ouvido pelo farol UDP. Clicar só preenche o
 * endereço: o código continua a ser dito em voz alta, porque estar na mesma rede
 * não é o mesmo que ter sido convidado.
 */
function PertoDaqui({
  lista,
  vivo,
  escolhido,
  escolher,
}: {
  lista: Vizinho[];
  vivo: boolean;
  escolhido: string;
  escolher: (endereco: string) => void;
}): ReactElement {
  // Lista vazia tem duas causas opostas e o remédio de cada uma é o contrário do
  // outro: ou ninguém abriu sessão, ou o macOS está a engolir a difusão e nunca
  // vai aparecer nada por mais que se espere.
  if (lista.length === 0 && !vivo) {
    return (
      <p className="mb-3 border-l-2 border-bad bg-bad/5 py-2 pl-3 text-[12px] leading-[1.5] text-bad">
        A rede local está bloqueada para o Studio — nada é ouvido nem anunciado. Abre
        Ajustes do Sistema › Privacidade e Segurança › Rede Local e liga o Criarte
        Studio. Até lá, dá para entrar escrevendo o endereço à mão.
      </p>
    );
  }
  if (lista.length === 0) {
    return (
      <p className="mb-3 text-[12px] text-muted">
        Ninguém a servir por aqui — escreve o endereço, ou pede pra abrirem a sessão.
      </p>
    );
  }
  return (
    <ul className="mb-3 space-y-1">
      {lista.map((v) => (
        <li key={v.endereco}>
          <button
            type="button"
            onClick={() => escolher(v.endereco)}
            className={`no-drag flex w-full items-center gap-2 border-l-2 py-1.5 pl-2.5 pr-2 text-left transition-colors ${
              escolhido === v.endereco
                ? "border-accent bg-surface-2 text-text"
                : "border-transparent text-muted hover:border-rule-strong hover:bg-surface"
            }`}
          >
            <Laptop size={13} className="shrink-0 text-accent" aria-hidden />
            <span className="truncate text-[13px] text-text">{v.nome}</span>
            <span className="ml-auto truncate font-mono text-[11px] text-muted">{v.siteId}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

export function PainelCoop({
  estado,
  erro,
  ocupado,
  siteId,
  abrir,
  entrar,
  fechar,
}: {
  estado: EstadoCoop;
  erro: string | null;
  ocupado: boolean;
  siteId: string | null;
  abrir: (siteId: string) => void;
  entrar: (endereco: string, codigo: string, nome: string) => void;
  fechar: () => void;
}): ReactElement {
  const [endereco, setEndereco] = useState("");
  const [codigo, setCodigo] = useState("");
  const [nome, setNome] = useState("");
  const [perto, setPerto] = useState<Perto>({ lista: [], vivo: true });

  // Só quando não há sessão: dentro de uma, a lista não leva a lado nenhum.
  const livre = estado.papel === null;
  useEffect(() => {
    if (!livre) return;
    const puxar = (): void => {
      void coopVizinhos().then(setPerto).catch(() => undefined);
    };
    puxar();
    // O empurrão do main só sai quando a lista muda, e ficar bloqueado é
    // justamente o caso em que ela nunca muda. Daí perguntar de vez em quando.
    const relogio = setInterval(puxar, 3_000);
    const largar = onCoopVizinhos(setPerto);
    return () => {
      clearInterval(relogio);
      largar();
    };
  }, [livre]);

  return (
    <div className="max-w-[520px]">
      <p className="mb-7 max-w-[46ch] text-[13px] leading-[1.6] text-muted">
        Dois Studios no mesmo convite, pela rede de casa. Um abre a sessão e diz o
        código; o outro entra. Quem está a mexer numa secção tranca só aquela — o
        resto do convite continua livre.
      </p>

      {erro && (
        <p className="mb-5 border-l-2 border-bad bg-bad/5 py-2 pl-3 font-mono text-[12px] text-bad">
          {erro}
        </p>
      )}

      {estado.papel === "anfitriao" && (
        <section>
          <div className="flex items-end justify-between gap-6 border-l-2 border-accent bg-surface/60 py-5 pl-5 pr-4">
            <Codigo valor={estado.codigo ?? ""} />
            <div className="text-right">
              <span className="mb-1 block font-mono text-label uppercase text-muted">endereço</span>
              <span className="block font-mono text-[13px] text-text">{estado.endereco}</span>
            </div>
          </div>
          <Pares pares={estado.pares} trancas={estado.trancas} />
          <Button variant="danger" className="mt-7" onClick={fechar} disabled={ocupado}>
            <Unplug size={13} /> Encerrar sessão
          </Button>
        </section>
      )}

      {estado.papel === "convidado" && (
        <section>
          <p className="border-l-2 border-ok bg-surface/60 py-4 pl-5 text-[13px] text-text">
            Ligada a <span className="font-mono">{estado.endereco}</span> — a editar{" "}
            <span className="font-mono">{estado.siteId || "…"}</span>.
          </p>
          <Button variant="danger" className="mt-7" onClick={fechar} disabled={ocupado}>
            <Unplug size={13} /> Sair da sessão
          </Button>
        </section>
      )}

      {estado.papel === null && (
        <div className="grid grid-cols-2 gap-x-8">
          <section>
            <div className="mb-4 flex items-baseline gap-3">
              <span className="font-mono text-label uppercase text-text">abrir</span>
              <span className="font-mono text-serial text-muted/60">01</span>
              <span className="h-px flex-1 bg-rule" />
            </div>
            <p className="mb-4 text-[12px] leading-[1.5] text-muted">
              Serve o convite aberto. Só esta máquina grava em disco.
            </p>
            <Button
              variant="primary"
              size="md"
              disabled={!siteId || ocupado}
              onClick={() => siteId && abrir(siteId)}
            >
              <Radio size={13} /> Abrir sessão
            </Button>
          </section>

          <section>
            <div className="mb-4 flex items-baseline gap-3">
              <span className="font-mono text-label uppercase text-text">entrar</span>
              <span className="font-mono text-serial text-muted/60">02</span>
              <span className="h-px flex-1 bg-rule" />
            </div>
            <PertoDaqui
              lista={perto.lista}
              vivo={perto.vivo}
              escolhido={endereco}
              escolher={setEndereco}
            />
            <div className="space-y-3">
              <Input
                placeholder="192.168.1.20:7412"
                value={endereco}
                onChange={(e) => setEndereco(e.target.value.trim())}
                aria-label="Endereço do anfitrião"
              />
              <Input
                placeholder="000000"
                inputMode="numeric"
                maxLength={6}
                value={codigo}
                onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ""))}
                aria-label="Código de 6 dígitos"
                className="font-mono tracking-[0.2em]"
              />
              <Input
                placeholder="o teu nome"
                maxLength={40}
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                aria-label="O teu nome"
              />
              <Button
                size="md"
                disabled={ocupado || codigo.length !== 6 || !endereco || !nome.trim()}
                onClick={() => entrar(endereco, codigo, nome.trim())}
              >
                Entrar
              </Button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
