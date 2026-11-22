// Moldura das páginas públicas de Política de Privacidade e Termos de Uso.
import Link from "next/link";
import type { ReactNode } from "react";

export default function PaginaLegal({ titulo, atualizado, children }: { titulo: string; atualizado: string; children: ReactNode }) {
  return (
    <main className="min-h-screen" style={{ background: "var(--bg)", color: "var(--text)" }}>
      <div className="max-w-[820px] mx-auto px-4 py-8">
        <Link href="/login" className="font-display text-[20px] font-extrabold tracking-tight">
          Fila<span style={{ color: "var(--primary)" }}>Pro</span> Leads
        </Link>
        <h1 className="font-display font-extrabold text-[28px] mt-6 leading-tight">{titulo}</h1>
        <p className="text-[12px] mt-1" style={{ color: "var(--muted)" }}>Última atualização: {atualizado}</p>
        <article className="texto-legal mt-6 text-[14px] leading-relaxed space-y-4">{children}</article>
        <nav className="mt-10 pt-4 flex flex-wrap gap-4 text-[13px]" style={{ borderTop: "1px solid var(--border)" }}>
          <Link href="/privacidade" className="underline">Política de Privacidade</Link>
          <Link href="/termos" className="underline">Termos de Uso</Link>
          <Link href="/login" className="underline">Entrar</Link>
        </nav>
      </div>
    </main>
  );
}

export function Secao({ n, titulo, children }: { n: string; titulo: string; children: ReactNode }) {
  return (
    <section className="space-y-2" id={`s${n}`}>
      <h2 className="font-display font-bold text-[17px] mt-4">{n}. {titulo}</h2>
      {children}
    </section>
  );
}
