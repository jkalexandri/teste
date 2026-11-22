/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Pacote compartilhado do banco (TypeScript) dentro do monorepo.
  transpilePackages: ["@filapro/db", "@filapro/ia"],
  // Importação de leads (até 10 MB — etapa 7) e PDF do Empresa | IA (até 20 MB — etapa 9b).
  experimental: { serverActions: { bodySizeLimit: "22mb" } },
  // Logos (decisão #97) ficam fora da pasta pública: garante que vão junto no deploy da Vercel
  outputFileTracingIncludes: { "/api/logos/[arquivo]": ["./assets/logos/**"] },
};
export default nextConfig;
