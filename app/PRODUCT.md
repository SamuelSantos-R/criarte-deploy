# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Dois operadores principais: o Heatz (CTO/CFO da Criarte Design AO) e a esposa. Ambos sabem a
ferramenta de cor e usam-na em sessão longa, muitas vezes ao mesmo tempo, cada um no seu Mac,
no mesmo convite.

Além deles, gente da **equipa da Criarte** entra e sai. Não usam o Studio todos os dias, então
não têm o vocabulário nem os atalhos na ponta da língua.

Clientes (noivos) **não** mexem no Studio. Recebem o convite publicado, não a ferramenta.

## Product Purpose

O Criarte Studio é a fábrica de convites da Criarte Design AO: um app de secretária que pega
num convite de casamento tokenizado e leva-o de matéria-prima até publicado e no ar.

O convite é um site estático Next.js cujo desenho inteiro — cores, fontes, medidas, folgas,
ornamentos, secções — está descrito num `convite.json`. O Studio é o que edita esses tokens
sem ninguém abrir um editor de texto.

Sucesso é um convite sair afinado, publicado e mostrado ao cliente sem passar pelo terminal.

## Positioning

O que um concorrente não copiava de verdade: o preview não é uma maquete: é o **site real** a
correr num `next dev` próprio, com os mesmos tokens que o build de produção vai usar. Mexer numa
régua no Studio e ver o convite verdadeiro mudar é o mecanismo central.

Somado a isso: dois operadores editam o mesmo convite em simultâneo pela rede local, e a
publicação sai para infraestrutura própria da empresa. É fábrica interna, não construtor de
sites genérico.

## Operating Context

- Dois Macs na mesma LAN. A sessão **coop** liga-os por TCP 7412, com farol UDP 7413 a anunciar
  quem está por perto para se entrar num clique.
- Os convites vivem noutro repositório, `sistema-multi-site`, em `sites/casamento/<slug>/`, com
  um único `node_modules` partilhado na raiz.
- O preview ao vivo arranca um `next dev` real por convite. O telemóvel entra pela LAN por QR.
- A publicação sai pelo Criarte-Deploy CLI para VPS própria (Hetzner).
- Seis superfícies: **Convites**, **Preview**, **Publicar**, **Fotos** no fluxo do site; e
  **Envelopador 3000** e **Config** fora dele.
- O app é distribuído **sem assinatura**. Cada reinstalação parte a regra da firewall do macOS e
  a coop deixa de ligar até ser reaprovada.

## Capabilities and Constraints

- Editar tema (cores), medidas (escala tipográfica, entrelinha, espaçamento, folgas por secção),
  ornamentos e a régua de secções, com preview ao vivo ao lado.
- Fotos, envelopador, tokenizar convites que ainda não estão no formato, renomear, gravar como novo.
- Publicar com opções e confirmação, e consola de saída.
- Sessão **coop**: dois a editar o mesmo convite pela LAN, com trancas por campo.
- Terminologia: o que até aqui se chamou **"a dois" passa a chamar-se "coop"** — decidido pelo
  utilizador neste ciclo, e a renomear na interface.
- Interface em português.
- Tem de aguentar **macOS e Windows** — o build de Windows já é produzido, então o desenho não
  pode assumir barra de título do macOS nem semáforos.
- Nenhum dos três trabalhos — montar convite novo, afinar medidas e tema, publicar e mostrar —
  domina os outros. **Pesam igual**, e o desenho tem de manter os três caminhos vivos.

## Brand Commitments

Nome **Criarte Studio**, da **Criarte Design AO** (Angola). Vocabulário em português, com nomes
próprios da casa ("Envelopador 3000", "Convites", "Medidas", "Ornamentos").

O utilizador deu **mão livre no esqueleto e na pele** para este redesenho, desde que nenhuma
funcionalidade se perca. Não fixou nenhuma restrição visual — nem paleta, nem tipo, nem
referência. O mundo visual atual é evidência e anti-referência, não autoridade.

## Evidence on Hand

Trabalho real de clientes: cinco convites tokenizados e a correr —
`cremilde-jose`, `emanuel-oprah`, `isalu-kaiser`, `luisa-vianey`, `tidiane-mauro`, em
`sistema-multi-site/sites/casamento/`. Servem de conteúdo verdadeiro para qualquer ecrã que
precise de mostrar convites.

Não existem testemunhos, números de utilização, preços nem estudos de caso. Trabalho futuro
**não pode inventá-los**.

## Product Principles

1. **O preview é a verdade.** Os controlos respondem ao site real a correr, nunca a uma maquete.
   Nada no desenho pode afastar o operador daquilo que ele está mesmo a produzir.
2. **Os três trabalhos pesam igual.** Montar, afinar e publicar são todos de primeira classe;
   nenhum é empurrado para um canto por ser menos bonito de desenhar.
3. **Duas mãos no mesmo convite.** A coop é modo normal de operação, não caso extremo — o
   estado do outro operador é informação de primeira, não um aviso escondido.
4. **Quem entra de vez em quando não se pode perder.** A equipa mergulha e sai; rótulo legível
   ganha a ícone que só quem usa todos os dias decifra.
5. **Tem de sobreviver ao escritório.** LAN, sem depender da internet, e as duas plataformas.

## Accessibility & Inclusion

Nenhum requisito de produto foi estabelecido pelo utilizador. Observado no código atual (a
confirmar, não é ainda verdade de produto): foco sempre visível com substituto explícito para
`outline`, e rácios de contraste calculados e anotados nos tokens.
