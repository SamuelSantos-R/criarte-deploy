/**
 * As frases que se repetem de convite para convite, já em inglês. É o que o
 * botão "Preencher o padrão" do painel Inglês escreve nas caixas vazias: sobra
 * para traduzir à mão só o que é de cada casal (a história, o recado, o
 * versículo). Chave é o texto exato do convite.json — frase reescrita pelo casal
 * não casa e fica por traduzir, que é o certo.
 *
 * Inglês britânico de propósito: é o dos convidados que costumam vir de fora
 * (Reino Unido, África do Sul), e casa com o "honour" da chamada.
 */
export const SUGESTOES: Record<string, string> = {
  // Hero
  "Têm a honra convidar o Exmo Sr.(a)": "Request the honour of your presence",
  "Têm a honra de convidar o Exmo Sr.(a)": "Request the honour of your presence",
  "para celebrar o seu Enlace Matrimonial": "to celebrate their wedding",
  "Venha celebrar o nosso amor!": "Come celebrate our love!",
  // Galeria
  "Querido convidado!": "Dear guest!",
  // Pais
  "Com a benção de Deus e de seus Pais": "With the blessing of God and their parents",
  // História
  "Nossa História": "Our Story",
  "Capítulos do nosso amor": "Chapters of our love",
  "O Primeiro Encontro": "The First Meeting",
  "O Pedido": "The Proposal",
  "Apresentação": "Family Introduction",
  Casamento: "Wedding",
  // Eventos
  "O Grande Dia": "The Big Day",
  "Detalhes do Evento": "Event Details",
  "Cerimônia Religiosa": "Religious Ceremony",
  "Cerimônia Civil": "Civil Ceremony",
  "Copo-d'água": "Reception",
  // Cronograma
  "Nosso Dia": "Our Day",
  "Dança dos Noivos": "First Dance",
  "Corte do Bolo": "Cake Cutting",
  "Abertura da Pista": "Dance Floor Opens",
  "Abertura do Jantar": "Dinner Is Served",
  "Aproveite cada momento": "Enjoy every moment",
  // Manual
  "Manual do Bom Convidado": "Guest Guide",
  "Informações úteis": "Useful information",
  "Sua presença é essencial": "Your presence matters",
  "Por favor, seja pontual": "Please be on time",
  "Convidado não convida": "Please don't bring extra guests",
  "Comemore connosco": "Celebrate with us",
  "Branco é a cor da noiva": "White is reserved for the bride",
  "Registe o nosso dia": "Capture our day",
  "Despeça-se dos noivos": "Say goodbye to the couple",
  "Agradecemos a compreensão\ne o vosso carinho!": "Thank you for your understanding\nand your love!",
  // Dress code
  "Dress Code": "Dress Code",
  "A Elegância das Cores de Verão": "The Elegance of Summer Colours",
  "Num cenário de verão e ao ar livre, os tons pastel serão a escolha perfeita para tornar este dia ainda mais harmonioso e especial.":
    "In an outdoor summer setting, pastel tones will be the perfect choice to make this day even more harmonious and special.",
  Rosa: "Pink",
  "Pêssego": "Peach",
  Amarelo: "Yellow",
  Azul: "Blue",
  "Lilás": "Lilac",
  "Verde Oliva": "Olive Green",
  "Reservado às damas": "Reserved for the bridesmaids",
  "O Verde Oliva é o tom exclusivo das nossas damas.\nPedimos, com carinho, que os demais convidados não usem esta cor.":
    "Olive green is reserved for our bridesmaids.\nWe kindly ask other guests not to wear this colour.",
  // Presentes
  Presentes: "Gifts",
  "Um gesto de carinho": "A gesture of love",
  "Para os familiares e amigos que desejarem\nnos presentear de outra forma,\ndisponibilizamos abaixo os dados bancários:":
    "For family and friends who would like\nto give us a gift in another way,\nour bank details are below:",
  "Com carinho,": "With love,",
  "A vossa presença neste dia tão especial\nserá sempre o nosso maior presente!":
    "Your presence on this special day\nwill always be our greatest gift!",
  // Mural
  Recados: "Messages",
  "Correio do Amor": "Love Letters",
  "Deixe uma mensagem especial para este momento.": "Leave a special message for this moment.",
  "Prometemos ler com muito carinho!": "We promise to read it with love!",
  "Seu nome": "Your name",
  "Mensagem de carinho aos noivos": "A loving note for the couple",
  "Mensagem de carinho aos noivos ♡": "A loving note for the couple ♡",
  // Meta
  "Convite de Casamento": "Wedding Invitation",
};

/** Título do navegador: "Convite de Casamento | Ana & João" → "Wedding Invitation | Ana & João". */
export function sugestao(pt: string): string | null {
  if (SUGESTOES[pt]) return SUGESTOES[pt];
  const meta = /^Convite de Casamento(\s*\|.*)$/.exec(pt);
  if (meta) return `Wedding Invitation${meta[1]}`;
  const mesAno = /^(Janeiro|Fevereiro|Março|Abril|Maio|Junho|Julho|Agosto|Setembro|Outubro|Novembro|Dezembro) de (\d{4})$/.exec(pt);
  if (mesAno) return `${MESES[mesAno[1]]} ${mesAno[2]}`;
  return null;
}

const MESES: Record<string, string> = {
  Janeiro: "January",
  Fevereiro: "February",
  "Março": "March",
  Abril: "April",
  Maio: "May",
  Junho: "June",
  Julho: "July",
  Agosto: "August",
  Setembro: "September",
  Outubro: "October",
  Novembro: "November",
  Dezembro: "December",
};
