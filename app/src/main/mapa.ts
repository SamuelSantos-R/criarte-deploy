// ============================================================================
// MAPA — busca de lugares para o campo "Mapa" dos eventos. Photon (dados do
// OpenStreetMap): sem chave, sem custo. O link que se grava é do Google Maps,
// pelas coordenadas, que é o que os convidados abrem no telemóvel.
// ============================================================================

export type Lugar = {
  nome: string;
  morada: string;
  lat: number;
  lon: number;
  link: string;
};

type Feature = {
  geometry?: { coordinates?: [number, number] };
  properties?: Record<string, string | undefined>;
};

// Puxa os resultados para perto de Luanda sem excluir o resto (há casais no Brasil).
const VIES = { lat: -8.8383, lon: 13.2344 };

export function linkGoogleMaps(lat: number, lon: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat.toFixed(6)},${lon.toFixed(6)}`;
}

export function lugarDe(f: Feature): Lugar | null {
  const [lon, lat] = f.geometry?.coordinates ?? [];
  if (typeof lat !== "number" || typeof lon !== "number") return null;
  const p = f.properties ?? {};
  const rua = [p.street, p.housenumber].filter(Boolean).join(" ");
  const nome = p.name || rua || p.city || "";
  if (!nome) return null;
  const morada = [p.name ? rua : "", p.district || p.locality, p.city || p.county, p.country]
    .filter((v): v is string => Boolean(v) && v !== nome)
    .filter((v, i, a) => a.indexOf(v) === i)
    .join(", ");
  return { nome, morada, lat, lon, link: linkGoogleMaps(lat, lon) };
}

export async function buscarLugares(consulta: unknown): Promise<Lugar[]> {
  const q = typeof consulta === "string" ? consulta.trim().slice(0, 200) : "";
  if (q.length < 3) return [];
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=6&lat=${VIES.lat}&lon=${VIES.lon}`;
  const resposta = await fetch(url, {
    headers: { "User-Agent": "CriarteStudio/1.0 (convites)" },
    signal: AbortSignal.timeout(8000),
  });
  if (!resposta.ok) throw new Error(`Busca de endereço falhou (${resposta.status}).`);
  const corpo = (await resposta.json()) as { features?: Feature[] };
  return (corpo.features ?? []).map(lugarDe).filter((l): l is Lugar => l !== null);
}
