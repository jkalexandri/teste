import type { Config } from "tailwindcss";

// Tailwind 3.4 — mesma versão usada na prévia, para as classes renderizarem igual.
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: { extend: {} },
  plugins: [],
};
export default config;
