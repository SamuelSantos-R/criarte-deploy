// O pacote não traz tipos. Só se usa uma chamada, então declara-se só ela.
declare module "subset-font" {
  export default function subsetFont(
    fonte: Buffer,
    texto: string,
    opcoes?: { targetFormat?: "sfnt" | "woff" | "woff2" | "truetype" },
  ): Promise<Buffer>;
}
