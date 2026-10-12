"use client";

import Section from "./Section";
import SectionDivider from "./SectionDivider";
import { Fragment } from "react";
import convite, { casal } from "@/lib/convite";
import { comNumerosETraco } from "@/lib/numeros";

// O ♥ marca o pai ou a mãe já falecido. Vem colado ao nome no convite.json e
// aqui vira um span próprio: menor, levantado e forçado a desenho de texto —
// sem isso o iOS troca por um emoji vermelho no meio do nome.
function FormattedName({ text }: { text: string }) {
  return (
    <>
      {text.split("\n").map((line, lineIdx) => {
        const parts = line.split(/(\([^)]*\)|\s*♥\uFE0E?\s*)/g);
        return (
          <Fragment key={lineIdx}>
            {lineIdx > 0 && <br />}
            {/* Centrado, a coluna encolhe quando o nome nao cabe na tela e o
                nome tem de poder partir numa palavra — com `nowrap` ele saia
                por fora da seccao. O ♥ nao se solta: o split come o espaco de
                ambos os lados, entao nao ha onde partir. */}
            <span className={centrarNomes ? "inline-block" : "inline-block whitespace-nowrap"}>
              {parts.map((part, i) => {
                if (part.includes("♥")) {
                  // O botao "Em memoria" do Studio escreve o coracao no inicio
                  // do nome; convites anteriores tem-no colado no fim. A folga
                  // fica sempre do lado do nome — com a margem de um so lado,
                  // um dos dois casos saia colado.
                  const aoInicio = parts.slice(0, i).every((p) => p.trim() === "");
                  return (
                    <span
                      key={i}
                      className={aoInicio ? "text-[0.78em] mr-[0.28em]" : "text-[0.78em] ml-0.5"}
                      style={{ fontVariantEmoji: "text", verticalAlign: "0.08em" }}
                    >
                      {"♥\uFE0E"}
                    </span>
                  );
                }
                if (part.startsWith("(") && part.endsWith(")")) {
                  return (
                    <span key={i} className="text-[0.72em] opacity-80">
                      {part}
                    </span>
                  );
                }
                return <Fragment key={i}>{part}</Fragment>;
              })}
            </span>
          </Fragment>
        );
      })}
    </>
  );
}

/** Sem a chave no convite.json fica como sempre esteve: divisoria ao centro. */
const centrarNomes =
  (convite.pais as { centrarNomes?: unknown }).centrarNomes === true;

export default function Versiculo() {
  return (
    <Section id="versiculo" className="px-6 text-center relative z-10" topo={32} base={32} topDivider={<SectionDivider side="left" offsetRatio={0.6} ancora="versiculo" />}>
      <div className="max-w-[560px] mx-auto">
        <div
          className="flex justify-center"
          style={{ marginTop: "var(--t-monograma-topo)", marginBottom: "var(--t-monograma-folga)" }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {/* Manda a altura e deixa a largura seguir: monograma redondo e monograma
              estreito e alto cabem no mesmo controlo sem esticar o desenho. */}
          <img
            src={convite.versiculo.monograma}
            alt={`Monograma ${casal}`}
            className="object-contain"
            style={{ height: "var(--t-monograma)", width: "auto" }}
          />
        </div>
        <blockquote
          className="font-medium text-versiculo mb-6 px-2 leading-[1.55]"
          style={{ fontSize: "clamp(min(15px, var(--t-versiculo, 22px)), 3.6vw, var(--t-versiculo, 22px))" }}
        >
          {/* Aspas e traco antes da referencia sao escritos a mao no convite.json:
              cada versiculo pontua a seu jeito e a referencia nem sempre vai no fim. */}
          {convite.versiculo.linhas.map((linha, i) => (
            <Fragment key={i}>
              {i > 0 && <br />}
              {comNumerosETraco(linha)}
            </Fragment>
          ))} {comNumerosETraco(convite.versiculo.referencia)}
        </blockquote>

        <p
          className="font-medium text-[14px] tracking-[1px] uppercase text-bencao mb-3"
          style={{ fontSize: "14px", letterSpacing: "1px" }}
        >
          {convite.pais.titulo}
        </p>

        {/*
          Duas geometrias, e a escolha e sobre qual folga fica igual.

          Por defeito as colunas sao meia largura cada, entao a divisoria cai no
          centro exato da seccao — mas a sobra de fora depende do comprimento de
          cada nome, e um lado fica mais vazio que o outro.

          Com `centrarNomes` as colunas passam a valer o conteudo e o `justify-center`
          centra o conjunto: a folga da esquerda e da direita fica igual e a
          divisoria desloca-se para o lado do nome mais comprido.

          `minmax(0,max-content)` e nao `max-content` porque em tela estreita o
          par nao cabe (medido: 372px de nomes em 342px uteis a 390px de largura).
          Com o minimo a zero as colunas encolhem e o nome parte de linha em vez
          de sair da seccao. Convite sem a chave abre como sempre abriu.
        */}
        <div
          className={
            centrarNomes
              ? "grid grid-cols-[minmax(0,max-content)_1px_minmax(0,max-content)] w-full items-stretch justify-center gap-3 mb-8"
              : "grid grid-cols-[1fr_1px_1fr] items-stretch justify-center gap-3 mb-8 w-full"
          }
        >
          <p
            className="text-right font-medium text-pais leading-[1.2] m-0"
            style={{ fontSize: "var(--t-pais)" }}
          >
            {convite.pais.noiva.map((nome, i) => (
              <Fragment key={i}>
                {i > 0 && <br />}
                <FormattedName text={nome} />
              </Fragment>
            ))}
          </p>
          <div className="w-px bg-pais self-stretch shrink-0" />
          <p
            className="text-left font-medium text-pais leading-[1.2] m-0"
            style={{ fontSize: "var(--t-pais)" }}
          >
            {convite.pais.noivo.map((nome, i) => (
              <Fragment key={i}>
                {i > 0 && <br />}
                <FormattedName text={nome} />
              </Fragment>
            ))}
          </p>
        </div>
      </div>
    </Section>
  );
}
