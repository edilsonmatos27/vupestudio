export const SHOWCASE_IMAGES = [
  {
    slug: "esporte-olympikus",
    title: "Arte publicitária esportiva",
    alt: "Anúncio Olympikus Corre 5 com atleta em cenário urbano verde",
  },
  {
    slug: "sprite",
    title: "Produtos em destaque",
    alt: "Arte de uma lata de Sprite gelada com limões e água",
  },
  {
    slug: "render-sala",
    title: "Renderização de ambientes",
    alt: "Comparação estática de uma sala em modelo 3D e renderização realista",
  },
  {
    slug: "restauro-retrato",
    title: "Restauração de fotografias",
    alt: "Comparação estática de um retrato antigo danificado e restaurado",
  },
  {
    slug: "honda-xre",
    title: "Campanhas comerciais",
    alt: "Arte de consórcio Honda XRE 190 com moto e vendedora",
  },
  {
    slug: "esporte-nike",
    title: "Composições com impacto",
    alt: "Atleta com tênis Nike em destaque em cenário urbano",
  },
  {
    slug: "perfume",
    title: "Luz e acabamento",
    alt: "Frasco de perfume âmbar sobre pedra com luz dourada cinematográfica",
  },
  {
    slug: "moda-neon",
    title: "Novos cenários",
    alt: "Modelo com vestido preto em passarela futurista com luzes neon",
  },
] as const;

export function showcaseSrc(slug: string, width: 640 | 1280) {
  return `/images/showcase/${slug}-${width}.webp`;
}
