// Leitura de um manual (decisão #101), com índice e Baixar PDF / Imprimir no padrão aprovado (decisão #97).
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import Cabecalho from "@/components/app/Cabecalho";
import { AutoImprimir } from "@/components/relatorios/BarraRelatorio";
import { obterSessao } from "@/lib/auth/session";
import { lerManual, manuaisDoPerfil, type IdManual } from "@/lib/ajuda";
import { VERSAO_CURTA, VERSAO_DATA } from "@/lib/versao";
import { protegerTela } from "@/lib/auth/tela";

export const dynamic = "force-dynamic";

export default async function ManualPage({ params, searchParams }: { params: Promise<{ manual: string }>; searchParams: Promise<{ imprimir?: string }> }) {
  await protegerTela(); // trava da tela antes de qualquer dado (decisão #130)
  const s = await obterSessao();
  if (!s) redirect("/login");
  const { manual } = await params;
  const m = manuaisDoPerfil(s.usuario.cargo).find((x) => x.id === manual);
  if (!m) notFound();
  const { html, indice } = await lerManual(m.id as IdManual);
  const imprimir = (await searchParams).imprimir === "1";
  const emitidoEm = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

  if (imprimir) {
    return (
      <section className="impressao">
        <AutoImprimir />
        <table className="folha">
          <thead>
            <tr><td>
              <div className="impressao-cabecalho" data-testid="cabecalho-impressao">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/api/logos/filapro-leads-vazada.svg" alt="FilaPro Leads" className="impressao-logo" />
                <div className="impressao-info">
                  <b>{m.titulo}</b>
                  <span>Emitido por <strong>{s.usuario.nome}</strong></span>
                  <span>em {emitidoEm} • versão {VERSAO_CURTA}</span>
                </div>
              </div>
              <div className="impressao-linha" />
            </td></tr>
          </thead>
          <tbody><tr><td><article className="manual" dangerouslySetInnerHTML={{ __html: html }} /></td></tr></tbody>
        </table>
      </section>
    );
  }

  return (
    <section className="flex-1 flex flex-col">
      <Cabecalho
        rotulo="Sistema • Ajuda"
        titulo={m.titulo}
        descricao={`Versão ${VERSAO_CURTA}${VERSAO_DATA ? ` de ${VERSAO_DATA}` : ""}`}
        direita={
          <div className="flex gap-2">
            <Link className="btn-ghost" href="/ajuda">← Manuais</Link>
            <a className="btn-primary" href={`/ajuda/${m.id}?imprimir=1`} target="_blank" rel="noreferrer" data-testid="imprimir-manual">Baixar PDF / Imprimir</a>
          </div>
        }
      />
      <div className="grid lg:grid-cols-[240px_1fr] gap-3 mt-3 items-start">
        {indice.length > 0 && (
          <nav className="card p-3 lg:sticky lg:top-[64px] text-[12px]" aria-label="Índice do manual" data-testid="indice">
            <b className="text-[11px] uppercase tracking-wide" style={{ color: "var(--muted)" }}>Índice</b>
            <ol className="mt-1.5 space-y-1 list-decimal pl-4">
              {indice.map((i) => <li key={i.id}><a href={`#${i.id}`} className="hover:underline">{i.texto}</a></li>)}
            </ol>
          </nav>
        )}
        <article className="card p-5 manual" dangerouslySetInnerHTML={{ __html: html }} />
      </div>
    </section>
  );
}
