/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Pacote compartilhado do banco (TypeScript) dentro do monorepo.
  transpilePackages: ["@filapro/db"],
};
export default nextConfig;
