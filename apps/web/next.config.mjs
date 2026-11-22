import { readFileSync } from "node:fs";

// Versão do sistema (decisão #100): vem do package.json da raiz; a data é a da montagem do site
const raiz = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
const dataMontagem = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

// Cabeçalhos de segurança (decisão #105, item 3)
const producao = process.env.NODE_ENV === "production" && process.env.NEXT_PUBLIC_APP_ENV === "production";
const csp = [
  "default-src 'self'",
  // Next.js e o script do tema usam scripts embutidos; 'unsafe-eval' só no modo de desenvolvimento
  `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "production" ? "" : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  "media-src 'self' data: blob:",
  "connect-src 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  // Ninguém pode abrir o sistema dentro de outro site (golpe de "clique escondido")
  "frame-ancestors 'none'",
  ...(producao ? ["upgrade-insecure-requests"] : []),
].join("; ");
const cabecalhosSeguranca = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  // Força HTTPS por 1 ano (só no site publicado)
  ...(producao ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }] : []),
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: { NEXT_PUBLIC_VERSAO: raiz.version, NEXT_PUBLIC_VERSAO_DATA: dataMontagem },
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: cabecalhosSeguranca }];
  },
  // Atualização (decisão #103): o deploy monta em ".next-novo" e troca no fim, sem derrubar o site atual
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Pacote compartilhado do banco (TypeScript) dentro do monorepo.
  transpilePackages: ["@filapro/db", "@filapro/ia"],
  // Importação de leads (até 10 MB — etapa 7) e PDF do Empresa | IA (até 20 MB — etapa 9b).
  experimental: { serverActions: { bodySizeLimit: "22mb" } },
  // Logos (decisão #97) ficam fora da pasta pública: garante que vão junto no deploy da Vercel
  outputFileTracingIncludes: { "/api/logos/[arquivo]": ["./assets/logos/**"] },
};
export default nextConfig;
