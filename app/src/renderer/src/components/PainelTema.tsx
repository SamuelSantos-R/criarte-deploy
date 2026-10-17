import { useEffect, useState, type ReactElement } from "react";
import { Save, X } from "lucide-react";
import { paletasApagar, paletasListar, paletasSalvar, type PaletaSalva } from "@/lib/api";
import { Button, Input } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import { SeletorCor, hexValido } from "@/components/SeletorCor";

type Papel = { chave: string; rotulo: string; onde: string };
type Grupo = { titulo: string; nota: string; papeis: Papel[] };

/**
 * Um papel por lugar da página, na ordem em que se lê o convite. O nome da cor
 * (`realce-escuro`, `ouro-claro`) deixou de aparecer aqui de propósito: quem
 * escolhe quer saber o que muda no ecrã, não como o token se chama.
 */
/**
 * O noivado tem outro desenho e só três cores: o tema dele tem `texto` e não tem
 * `fundo-1`. É por aí que o painel sabe qual dos dois está a editar — o convite
 * não precisa de dizer.
 */
export function ehNoivado(tema: Record<string, string>): boolean {
  return "texto" in tema && !("fundo-1" in tema);
}

export const PAPEIS_NOIVADO: Grupo[] = [
  {
    titulo: "as três cores do noivado",
    nota: "O convite de noivado pinta-se todo com estas três.",
    papeis: [
      {
        chave: "destaque",
        rotulo: "Destaque",
        onde: "Nome do casal, data, ícones dos botões, números da contagem, linhas da data.",
      },
      {
        chave: "texto",
        rotulo: "Texto",
        onde: "Versículo, bênção, frase do convite, local, botões, contagem e o fundo do rodapé.",
      },
      {
        chave: "fundo",
        rotulo: "Fundo",
        onde: "O fundo da página e as letras do rodapé.",
      },
    ],
  },
];

export const PAPEIS: Grupo[] = [
  {
    titulo: "a cor principal",
    nota: "Uma só cor manda em quase tudo o que salta à vista.",
    papeis: [
      {
        chave: "destaque",
        rotulo: "Destaque",
        onde: "Botão da música, contagem, título de cada secção, corações e linha do meio da Nossa História e do Nosso Dia, título dos eventos, botão do mapa, botão de copiar IBAN, ícones do Nosso Dia, do Manual e dos eventos, botão do Correio do Amor, o “com carinho” dos presentes e o rodapé.",
      },
    ],
  },
  {
    titulo: "a capa",
    nota: "O nome do casal é branco por desenho; o que dá para trocar é o símbolo entre os dois.",
    papeis: [
      {
        chave: "e",
        rotulo: "O & do meio",
        onde: "Só o & entre o nome da noiva e o do noivo, na capa. Vazio deixa o creme de sempre.",
      },
    ],
  },
  {
    titulo: "fundo das secções",
    nota: "As duas alternam de cima a baixo — é o que dá o contraste entre um bloco e o seguinte.",
    papeis: [
      {
        chave: "fundo-1",
        rotulo: "Cor 1",
        onde: "Contagem, versículo, eventos, presentes, dress code.",
      },
      {
        chave: "fundo-2",
        rotulo: "Cor 2",
        onde: "Galeria, Nossa História, Nosso Dia, manual, Correio do Amor.",
      },
    ],
  },
  {
    titulo: "repete em toda a página",
    nota: "Aparece no topo de cada secção, sempre igual.",
    papeis: [
      { chave: "chapeu", rotulo: "Chapéu", onde: "A frase pequena por cima do título." },
      { chave: "filete", rotulo: "Filete", onde: "O fio com o coraçãozinho por baixo do título." },
      {
        chave: "card-borda",
        rotulo: "Contorno dos cartões",
        onde: "Todos os cartões do convite e o botão de silenciar.",
      },
    ],
  },
  {
    titulo: "secção a secção",
    nota: "Pela ordem em que aparecem ao descer a página.",
    papeis: [
      {
        chave: "countdown-texto",
        rotulo: "Contagem — dizeres",
        onde: "“Save the date”, a data grande, os números e as legendas.",
      },
      {
        chave: "countdown-borda",
        rotulo: "Contagem — contorno",
        onde: "A moldura à volta dos números.",
      },
      {
        chave: "realce-escuro",
        rotulo: "Galeria",
        onde: "O texto por baixo do título, entre o chapéu e as fotos.",
      },
      { chave: "versiculo", rotulo: "Versículo", onde: "O versículo e a referência." },
      { chave: "bencao", rotulo: "Bênção", onde: "A frase da bênção, por cima dos nomes dos pais." },
      { chave: "pais", rotulo: "Pais", onde: "Nome dos pais e a linha que os separa." },
      {
        chave: "historia",
        rotulo: "Nossa História",
        onde: "Datas e acontecimentos — e o pedido de recado do Correio do Amor.",
      },
      { chave: "evento", rotulo: "Eventos", onde: "Tipo de evento e a morada escrita." },
      { chave: "nosso-dia", rotulo: "Nosso Dia", onde: "Hora e acontecimento." },
      { chave: "presentes", rotulo: "Presentes", onde: "Frase sobre os presentes e o IBAN." },
      {
        chave: "iban-fundo",
        rotulo: "Presentes — caixa do IBAN",
        onde: "Só o fundo da caixa onde o IBAN aparece. Vazio deixa o creme de sempre.",
      },
      {
        chave: "recado-fundo",
        rotulo: "Correio do Amor — cartão",
        onde: "Só o fundo do cartão onde cada recado aparece. Vazio deixa o branco de sempre.",
      },
      {
        chave: "manual",
        rotulo: "Manual",
        onde: "As orientações dos cartões e o agradecimento no fim.",
      },
      {
        chave: "rsvp",
        rotulo: "RSVP",
        onde: "A frase por cima do botão e os rótulos do cartão. O botão e o «sim» seguem o Destaque.",
      },
      {
        chave: "rsvp-fundo",
        rotulo: "RSVP — cartão de confirmação",
        onde: "Só o fundo do cartão que abre ao confirmar. Vazio deixa o branco de sempre.",
      },
      {
        chave: "rsvp-opcao-texto",
        rotulo: "RSVP — letra das opções",
        onde: "«Sim, estarei lá!», «Não poderei ir», «Somente eu» e «+1 acompanhante». Vazio deixa a cor de texto de sempre.",
      },
    ],
  },
];

function Linha({
  papel,
  valor,
  onChange,
}: {
  papel: Papel;
  valor: string;
  onChange: (novo: string) => void;
}): ReactElement {
  const valido = hexValido(valor);

  return (
    <div className="flex items-stretch border-b border-rule last:border-b-0">
      {/* A amostra sangra até à borda esquerda: as cores formam uma coluna
          contínua e lê-se a paleta do convite de uma vez, não chip a chip. */}
      <SeletorCor valor={valor} rotulo={papel.rotulo} onChange={onChange} />

      <div className="min-w-0 flex-1 py-2.5 pl-4 pr-3">
        <div className="flex items-baseline gap-2.5">
          <span className="text-[13px] text-text">{papel.rotulo}</span>
          {!valido && (
            <span className="shrink-0 font-narrow font-semibold text-gauge text-pencil">hex inválido</span>
          )}
        </div>
        {papel.onde && (
          <p className="mt-0.5 text-[12px] leading-normal text-muted">{papel.onde}</p>
        )}
      </div>

      <input
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        aria-label={`Hex de ${papel.rotulo}`}
        className={cn(
          "no-drag w-[92px] shrink-0 self-start bg-transparent py-2.5 pr-3 text-right font-mono text-[12px] uppercase",
          "focus:bg-surface-2 focus:outline-hidden",
          valido ? "text-muted" : "text-pencil",
        )}
      />
    </div>
  );
}

/** Uma paleta está posta quando todas as cores que ela define batem certo. */
function estaPosta(paleta: Paleta, tema: Record<string, string>): boolean {
  return Object.entries(paleta.cores).every(
    ([k, v]) => (tema[k] ?? "").trim().toLowerCase() === v.toLowerCase(),
  );
}

// As quatro que se leem à distância: o destaque manda na página, o par de fundos
// dá o tom, e o filete diz se a paleta é quente ou fria.
const AMOSTRA = ["destaque", "fundo-2", "fundo-1", "filete"];
const AMOSTRA_NOIVADO = ["destaque", "texto", "fundo"];

function Cartao({
  p,
  posta,
  onAplicar,
  onApagar,
}: {
  p: Paleta;
  posta: boolean;
  onAplicar: () => void;
  onApagar?: () => void;
}): ReactElement {
  return (
    <div className="group relative">
      <button
        type="button"
        onClick={onAplicar}
        title={p.nota}
        aria-pressed={posta}
        className={cn(
          "no-drag flex w-[152px] flex-col border text-left transition-colors",
          posta ? "border-text" : "border-rule hover:border-muted",
        )}
      >
        <span className="flex h-9">
          {(ehNoivado(p.cores) ? AMOSTRA_NOIVADO : AMOSTRA).map((c) => (
            <span key={c} className="flex-1" style={{ background: p.cores[c] }} />
          ))}
        </span>
        <span className="flex items-baseline justify-between border-t border-rule px-2 py-1.5">
          <span className="truncate text-[12px] text-text">{p.nome}</span>
          {posta && <span className="font-narrow font-semibold text-gauge text-muted">posta</span>}
        </span>
      </button>
      {onApagar && (
        <button
          type="button"
          onClick={onApagar}
          aria-label={`Apagar a paleta ${p.nome} da biblioteca`}
          title="Apagar da biblioteca (some em todas as máquinas)"
          className="no-drag absolute -right-2 -top-2 hidden h-5 w-5 items-center justify-center rounded-full border border-rule bg-surface text-muted hover:text-pencil group-hover:flex focus-visible:flex"
        >
          <X size={11} />
        </button>
      )}
    </div>
  );
}

/**
 * As prontas viajam no app; as da biblioteca vivem no R2 e aparecem em todas as
 * máquinas, como os monogramas. Sem rede a biblioteca some e as prontas ficam.
 */
function Paletas({
  tema,
  onAplicar,
}: {
  tema: Record<string, string>;
  onAplicar: (cores: Record<string, string>) => void;
}): ReactElement {
  const noivado = ehNoivado(tema);
  const prontas = noivado ? PALETAS_NOIVADO : PALETAS;
  const [salvas, setSalvas] = useState<PaletaSalva[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [nome, setNome] = useState("");
  const [gravando, setGravando] = useState(false);

  useEffect(() => {
    paletasListar()
      .then(setSalvas)
      .catch(() => setSalvas([]));
  }, []);

  // Paleta de casamento num noivado (ou o contrário) trazia cores que a página nem usa.
  const daBiblioteca = (salvas ?? []).filter((p) => ehNoivado(p.cores) === noivado);

  const salvar = (): void => {
    const cores = Object.fromEntries(Object.entries(tema).filter(([, v]) => hexValido(v)));
    setGravando(true);
    setErro(null);
    paletasSalvar({ nome, cores })
      .then((nova) => {
        setSalvas((atual) => [nova, ...(atual ?? [])]);
        setNome("");
      })
      .catch((e: unknown) => setErro(e instanceof Error ? e.message : String(e)))
      .finally(() => setGravando(false));
  };

  const apagar = (p: PaletaSalva): void => {
    if (!window.confirm(`Apagar "${p.nome}" da biblioteca? Some em todas as máquinas.`)) return;
    paletasApagar(p.id)
      .then(() => setSalvas((atual) => (atual ?? []).filter((x) => x.id !== p.id)))
      .catch((e: unknown) => setErro(e instanceof Error ? e.message : String(e)));
  };

  const jaSalva = daBiblioteca.some((p) => estaPosta(p, tema)) || prontas.some((p) => estaPosta(p, tema));

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {prontas.map((p) => (
          <Cartao key={p.id} p={p} posta={estaPosta(p, tema)} onAplicar={() => onAplicar(p.cores)} />
        ))}
        {daBiblioteca.map((p) => (
          <Cartao
            key={p.id}
            p={{ ...p, nota: p.nota || (p.autor ? `Da biblioteca — ${p.autor}` : "Da biblioteca") }}
            posta={estaPosta(p, tema)}
            onAplicar={() => onAplicar(p.cores)}
            onApagar={() => apagar(p)}
          />
        ))}
      </div>
      {salvas === null && <p className="mt-2 text-[12px] text-muted">Lendo a biblioteca…</p>}
      <div className="mt-4 flex items-center gap-2">
        <Input
          value={nome}
          placeholder={jaSalva ? "esta paleta já está guardada" : "nome da paleta deste convite"}
          onChange={(e) => setNome(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && nome.trim() && !gravando) salvar();
          }}
          className="h-[30px] w-[220px] text-[12px]"
        />
        <Button variant="outline" size="sm" disabled={!nome.trim() || gravando} onClick={salvar}>
          <Save size={13} /> {gravando ? "Guardando…" : "Guardar na biblioteca"}
        </Button>
      </div>
      {erro && <p className="mt-2 text-[12px] text-pencil">{erro}</p>}
    </>
  );
}

export function PainelTema({
  tema,
  onChange,
  onAplicarPaleta,
}: {
  tema: Record<string, string>;
  onChange: (token: string, valor: string) => void;
  /** Troca a paleta toda num patch só, em vez de 19 — o co-op recebe uma mensagem. */
  onAplicarPaleta: (cores: Record<string, string>) => void;
}): ReactElement {
  // Papel que existe no convite.json mas o Studio não conhece continua editável:
  // um convite antigo abre sem perder cor nenhuma.
  const base = ehNoivado(tema) ? PAPEIS_NOIVADO : PAPEIS;
  const conhecidos = new Set(base.flatMap((g) => g.papeis.map((p) => p.chave)));
  const sobra = Object.keys(tema).filter((k) => !conhecidos.has(k));

  const grupos: Grupo[] = sobra.length
    ? [
        ...base,
        {
          titulo: "fora do padrão",
          nota: "Estava no convite.json e o Studio não reconhece — deve vir de uma versão antiga do modelo.",
          papeis: sobra.map((k) => ({ chave: k, rotulo: k, onde: "" })),
        },
      ]
    : base;

  return (
    <div className="max-w-[560px]">
      <p className="mb-8 max-w-[52ch] text-[13px] leading-[1.6] text-muted">
        Cada linha é um lugar do convite, não um nome de cor. Clica na amostra para abrir a
        paleta, ou escreve o hex à direita.
      </p>

      <section className="mb-9">
        <div className="mb-2 flex items-baseline gap-3">
          <span className="font-narrow font-semibold text-gauge text-muted">01</span>
          <span className="font-narrow font-semibold text-label text-text">paletas prontas</span>
          <span className="h-px flex-1 bg-rule" />
        </div>
        <p className="mb-3 max-w-[52ch] text-[12px] leading-normal text-muted">
          Põe a paleta inteira de uma vez. Depois dá para mexer linha a linha — e o que ficar
          diferente já não conta como paleta posta. A paleta deste convite pode ir para a
          biblioteca e aparece em todas as máquinas.
        </p>
        <Paletas tema={tema} onAplicar={onAplicarPaleta} />
      </section>

      {grupos.map((grupo, i) => (
        <section key={grupo.titulo} className="mb-9 last:mb-0">
          <div className="mb-2 flex items-baseline gap-3">
            <span className="font-narrow font-semibold text-gauge text-muted">
              {String(i + 2).padStart(2, "0")}
            </span>
            <span className="font-narrow font-semibold text-label text-text">{grupo.titulo}</span>
            <span className="h-px flex-1 bg-rule" />
          </div>
          <p className="mb-3 max-w-[52ch] text-[12px] leading-normal text-muted">{grupo.nota}</p>
          <div className="border-t border-rule">
            {grupo.papeis.map((papel) => (
              <Linha
                key={papel.chave}
                papel={papel}
                valor={tema[papel.chave] ?? ""}
                onChange={(novo) => onChange(papel.chave, novo)}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/** O que o Studio grava quando o convite.json ainda não tem tema nenhum. */
export const TEMA_PADRAO: Record<string, string> = {
  destaque: "#7A7F4B",
  // O creme da capa: é a cor que o & sempre teve cravada no componente.
  e: "#FDFAF4",
  // O mesmo creme, que era o `bg-cream` cravado na caixa do IBAN.
  "iban-fundo": "#FDFAF4",
  // O branco que estava cravado no cartão de cada recado.
  "recado-fundo": "#FFFFFF",
  "fundo-1": "#FDFAF4",
  "fundo-2": "#F8F0E0",
  chapeu: "#B08A4A",
  filete: "#D0B479",
  "countdown-texto": "#FDFAF4",
  "countdown-borda": "#B08A4A",
  versiculo: "#A87C28",
  bencao: "#7A7F4B",
  pais: "#7A7F4B",
  historia: "#A8843F",
  evento: "#A87C28",
  "nosso-dia": "#A87C28",
  presentes: "#745A1A",
  manual: "#B08A4A",
  rsvp: "#A87C28",
  "rsvp-fundo": "#FFFFFF",
  // A marca da escolha no cartão de confirmação: a bolinha do "Sim, estarei lá" e
  // o realce da opção de acompanhante. Nascem iguais ao que estava cravado no
  // componente, para o convite que já existe abrir exactamente como abria.
  "rsvp-opcao": "#7A7F4B",
  "rsvp-selecao": "#F8F0E0",
  "card-borda": "#D6BB8D",
};

export type Paleta = { id: string; nome: string; nota: string; cores: Record<string, string> };

/**
 * As duas paletas novas foram medidas contra os fundos que elas próprias trazem:
 * todo o texto fica em 4.5:1 ou acima, e o `countdown-texto` acima de 5.5:1 sobre
 * o `destaque` — que é o fundo do cartão da contagem, não um fundo de secção.
 *
 * A dourada fica como está (o pior par é 2.82:1, no chapéu) porque é a que já
 * está publicada em todos os convites; mexer nela repintava o que já foi enviado.
 */
export const PALETAS: Paleta[] = [
  {
    id: "dourado",
    nome: "Dourado",
    nota: "A de sempre.",
    cores: TEMA_PADRAO,
  },
  {
    id: "oliva-claro",
    nome: "Oliva claro",
    nota: "Fundos em verde muito lavado, letra em oliva fechado.",
    cores: {
      destaque: "#5B6340",
      e: "#F7F8F0",
      "iban-fundo": "#F4F5EC",
      "recado-fundo": "#FFFFFF",
      "fundo-1": "#F4F5EC",
      "fundo-2": "#EBEEE1",
      chapeu: "#646E46",
      filete: "#9AA575",
      "countdown-texto": "#F7F8F0",
      "countdown-borda": "#8A9463",
      versiculo: "#4E5638",
      bencao: "#5B6340",
      pais: "#5B6340",
      historia: "#5A6239",
      evento: "#4E5638",
      "nosso-dia": "#4E5638",
      presentes: "#414830",
      manual: "#5A6239",
      rsvp: "#4E5638",
      "rsvp-fundo": "#FFFFFF",
      "card-borda": "#C7CFAE",
    },
  },
  {
    id: "terracota",
    nome: "Terracota",
    nota: "Areia quente e barro cozido, sem nada de dourado.",
    cores: {
      destaque: "#93513C",
      e: "#FCF7F2",
      "iban-fundo": "#FBF6F1",
      "recado-fundo": "#FFFFFF",
      "fundo-1": "#FBF6F1",
      "fundo-2": "#F4E7DD",
      chapeu: "#8C5240",
      filete: "#CE9C80",
      "countdown-texto": "#FCF7F2",
      "countdown-borda": "#C4886B",
      versiculo: "#8A4E39",
      bencao: "#93513C",
      pais: "#93513C",
      historia: "#8C5240",
      evento: "#8A4E39",
      "nosso-dia": "#8A4E39",
      presentes: "#74402E",
      manual: "#8C5240",
      rsvp: "#8A4E39",
      "rsvp-fundo": "#FFFFFF",
      "card-borda": "#E2C4AF",
    },
  },
];

/** As do noivado: a dourada é a da Jandira & Mauro; a preto e branco, a da Carolina & Daniel. */
export const PALETAS_NOIVADO: Paleta[] = [
  {
    id: "noivado-dourado",
    nome: "Dourado",
    nota: "Dourado com verde-oliva — a do convite com flores.",
    cores: { destaque: "#B99A5B", texto: "#636427", fundo: "#FFFFFF" },
  },
  {
    id: "noivado-pb",
    nome: "Preto e branco",
    nota: "Para a capa com foto a preto e branco.",
    cores: { destaque: "#1A1A1A", texto: "#000000", fundo: "#FFFFFF" },
  },
];
