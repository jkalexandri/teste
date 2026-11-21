"use client";

// Listas das abas Em andamento, Pausada, Rascunho, Concluída e Cancelada (prompt seção 8):
// - Em andamento: só Pausar ou Cancelar.  - Rascunho: Editar/Excluir (não inicia direto daqui).
// - Concluída: pode duplicar.  - Cancelada: NÃO duplica; mostra o motivo.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/app/Toast";
import { Pencil, ShieldCheck } from "@/components/icons";
import { MODOS, type Modo } from "@filapro/db/src/envio";
import { cancelarCampanha, duplicarCampanha, excluirRascunho, pausarCampanha, retomarCampanha } from "./actions";

export type CampanhaLinha = {
  id: string; assunto: string; status: string; modo: Modo; bloqueio24h: boolean; mensagem: string;
  total: number; enviados: number; fila: number; falhas: number; criadoEm: string; agendadaPara: string | null; motivo: string | null;
};

const data = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
const pct = (c: CampanhaLinha) => (c.total ? Math.round(((c.enviados + c.falhas) / c.total) * 100) : 0);
const VAZIO: Record<string, string> = {
  "em-andamento": "Nenhuma campanha em andamento. Crie uma na aba Nova.",
  pausada: "Nenhuma campanha pausada.",
  rascunho: "Nenhum rascunho salvo. Use a aba Nova para salvar um.",
  concluida: "Nenhuma campanha concluída.",
  cancelada: "Nenhuma campanha cancelada.",
};

function Chips({ c }: { c: CampanhaLinha }) {
  const m = MODOS[c.modo];
  return (
    <div className="flex flex-wrap gap-1.5 mt-1.5">
      <span className="chip" style={{ background: m.fundo, color: m.cor }}><ShieldCheck size={12} /> Antibloqueio: {m.rotulo}</span>
      {c.bloqueio24h && <span className="chip" style={{ background: "var(--surface-3)", color: "var(--muted)" }}>Bloqueio 24h</span>}
    </div>
  );
}

export default function ListaCampanhas({ aba, campanhas }: { aba: string; campanhas: CampanhaLinha[] }) {
  const router = useRouter();
  const toast = useToast();
  const [pendente, iniciar] = useTransition();
  const [aberta, setAberta] = useState<string | null>(null);
  const agir = (fn: () => Promise<{ ok: boolean; mensagem: string; id?: string }>, depois?: (id?: string) => void) =>
    iniciar(async () => {
      const r = await fn();
      toast(r.mensagem, r.ok ? "ok" : "erro");
      if (r.ok) depois?.(r.id);
      router.refresh();
    });
  const cancelar = (c: CampanhaLinha) => {
    const motivo = window.prompt(`Cancelar "${c.assunto}"? Informe o motivo (opcional):`, "");
    if (motivo !== null) agir(() => cancelarCampanha(c.id, motivo));
  };

  if (campanhas.length === 0) return <div className="card p-3 mt-3 text-[12px]" style={{ color: "var(--muted)" }}>{VAZIO[aba]}</div>;

  if (aba === "em-andamento") {
    return (
      <div className="card p-3 mt-3">
        <div className="table-wrap">
          <table style={{ minWidth: 820, fontSize: 12 }}>
            <thead><tr><th>Campanha</th><th>Antibloqueio</th><th>Progresso</th><th>Enviados / Fila</th><th>Ações</th></tr></thead>
            <tbody>
              {campanhas.map((c) => (
                <tr key={c.id}>
                  <td>
                    <b>{c.assunto}</b>
                    <span className="block text-[11px]" style={{ color: "var(--muted)" }}>
                      {c.status === "AGENDADA" && c.agendadaPara ? `Agendada para ${data(c.agendadaPara)}` : `Criada em ${data(c.criadoEm)}`}
                    </span>
                  </td>
                  <td><span className="chip" style={{ background: MODOS[c.modo].fundo, color: MODOS[c.modo].cor }}>{MODOS[c.modo].rotulo}</span></td>
                  <td style={{ minWidth: 140 }}>
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--border)" }}>
                      <div className="h-full rounded-full" style={{ width: `${pct(c)}%`, background: "var(--primary)" }} />
                    </div>
                    <span className="text-[11px]">{pct(c)}%{c.status === "AGENDADA" ? " • agendada" : ""}</span>
                  </td>
                  <td>{c.enviados} / {c.fila}</td>
                  <td>
                    <div className="flex gap-1">
                      <button className="btn-ghost !py-1 !px-2 !text-[11px]" disabled={pendente} onClick={() => agir(() => pausarCampanha(c.id))}>Pausar</button>
                      <button className="btn-ghost !py-1 !px-2 !text-[11px]" style={{ color: "#b42318" }} disabled={pendente} onClick={() => cancelar(c)}>Cancelar</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="help mt-2">O envio acontece no servidor 24/7, seguindo o Antibloqueio — mesmo com o site fechado.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-3 mt-3">
      {campanhas.map((c) => (
        <article key={c.id} className="card p-3" data-campanha={c.assunto}>
          <div className="flex flex-wrap justify-between gap-2">
            <div className="min-w-0">
              <b className="text-[13px] [overflow-wrap:anywhere]">{c.assunto}</b>
              <Chips c={c} />
            </div>
            {aba === "pausada" && <span className="chip self-start" style={{ background: "#fff7e0", color: "#8a5a00" }}>Em pausa • {pct(c)}%</span>}
            {aba === "rascunho" && <span className="chip self-start" style={{ background: "var(--surface-3)", color: "var(--muted)" }}>Rascunho</span>}
            {aba === "concluida" && <span className="chip self-start" style={{ background: "var(--primary-soft)", color: "#087a44" }}>Concluída • 100%</span>}
            {aba === "cancelada" && <span className="chip self-start" style={{ background: "#ffeef0", color: "#9e1d2f" }}>Cancelada</span>}
          </div>

          {aba === "pausada" && (
            <>
              <p className="text-[12px] mt-1" style={{ color: "var(--muted)" }}>Enviados: <b style={{ color: "var(--text)" }}>{c.enviados}</b> • Na fila: <b style={{ color: "var(--text)" }}>{c.fila}</b>{c.motivo ? ` • ${c.motivo}` : ""}</p>
              <div className="flex gap-2 mt-2">
                <button className="btn-primary" disabled={pendente} onClick={() => agir(() => retomarCampanha(c.id))}>Retomar</button>
                <button className="btn-ghost" style={{ color: "#b42318" }} disabled={pendente} onClick={() => cancelar(c)}>Cancelar</button>
              </div>
            </>
          )}
          {aba === "rascunho" && (
            <>
              <p className="text-[11px] mt-1" style={{ color: "var(--muted)" }}>Criado em {data(c.criadoEm)}</p>
              <div className="flex gap-2 mt-2">
                <button className="btn-ghost" onClick={() => router.push(`/campanhas?aba=nova&editar=${c.id}`)}><Pencil size={13} /> Editar</button>
                <button className="btn-ghost" style={{ color: "#b42318" }} disabled={pendente} onClick={() => window.confirm(`Excluir o rascunho "${c.assunto}"?`) && agir(() => excluirRascunho(c.id))}>Excluir</button>
              </div>
            </>
          )}
          {aba === "concluida" && (
            <>
              <p className="text-[12px] mt-1" style={{ color: "var(--muted)" }}>Resultado final — Enviados: <b style={{ color: "var(--text)" }}>{c.enviados}</b> • Não enviados: <b style={{ color: "var(--text)" }}>{c.falhas}</b> • Criada em {data(c.criadoEm)}</p>
              <button className="btn-ghost mt-2" disabled={pendente} onClick={() => agir(() => duplicarCampanha(c.id), (id) => id && router.push(`/campanhas?aba=nova&editar=${id}`))}>Duplicar</button>
            </>
          )}
          {aba === "cancelada" && (
            <>
              <p className="text-[12px] mt-1 leading-relaxed" style={{ color: "var(--muted)" }}><b style={{ color: "var(--text)" }}>Motivo:</b> {c.motivo || "Cancelada pelo usuário."}</p>
              <p className="text-[11px] mt-1" style={{ color: "var(--muted)" }}>Enviados: {c.enviados} • Criada em {data(c.criadoEm)}</p>
              {aberta === c.id && (
                <div className="rounded-lg p-2.5 mt-2 text-[12px] leading-relaxed" style={{ background: "var(--surface-3)" }}>
                  <b>Mensagem:</b> <span className="[overflow-wrap:anywhere]">{c.mensagem.replaceAll("{nome}", "Maria")}</span><br />
                  <b>Motivo:</b> {c.motivo || "Cancelada pelo usuário."}
                </div>
              )}
              <button className="btn-ghost mt-2" onClick={() => setAberta(aberta === c.id ? null : c.id)}>{aberta === c.id ? "Ocultar detalhes" : "Ver detalhes / Ver motivo"}</button>
            </>
          )}
        </article>
      ))}
    </div>
  );
}
