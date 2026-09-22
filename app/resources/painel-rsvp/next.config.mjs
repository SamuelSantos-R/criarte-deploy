/** @type {import('next').NextConfig} */
// Export estático como o resto da Criarte: o painel é uma página só e manda o
// RSVP pro Google Forms, então não há nada pra correr no servidor.
const nextConfig = {
  output: "export",
  images: { unoptimized: true },
  devIndicators: false,
};

export default nextConfig;
