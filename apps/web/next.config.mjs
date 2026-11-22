import { readFileSync } from "node:fs";

// Versão do sistema (decisão #100): vem do package.json da raiz; a data é a da montagem do site
const raiz = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
const dataMontagem = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: { NEXT_PUBLIC_VERSAO: raiz.version, NEXT_PUBLIC_VERSAO_DATA: dataMontagem },
  reactStrictMode: true,
  // Pacote compartilhado do banco (TypeScript) dentro do monorepo.
  transpilePackages: ["@filapro/db", "@filapro/ia"],
  // Importação de leads (até 10 MB — etapa 7) e PDF do Empresa | IA (até 20 MB — etapa 9b).
  experimental: { serverActions: { bodySizeLimit: "22mb" } },
  // Logos (decisão #97) ficam fora da pasta pública: garante que vão junto no deploy da Vercel
  outputFileTracingIncludes: { "/api/logos/[arquivo]": ["./assets/logos/**"] },
};
export default nextConfig;
