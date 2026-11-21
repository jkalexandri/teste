/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Pacote compartilhado do banco (TypeScript) dentro do monorepo.
  transpilePackages: ["@filapro/db"],
  // Importação de leads por arquivo (até 10 MB) e confirmação de listas grandes (etapa 7).
  experimental: { serverActions: { bodySizeLimit: "12mb" } },
};
export default nextConfig;
