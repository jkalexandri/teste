// Peças dos painéis de disparos (etapa 8c): cartões de total, chip de saúde e avatar.
import type { ReactNode } from "react";
import { COR_SAUDE, type Saude } from "@/lib/metricas";

export function CartoesTotal({ itens }: { itens: { l: string; v: number }[] }) {
  return (
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mt-3 shrink-0">
      {itens.map((c) => (
        <div key={c.l} className="card p-3" data-kpi={c.l}>
          <div className="font-display text-[22px] font-extrabold">{c.v.toLocaleString("pt-BR")}</div>
          <div className="text-[12px] font-bold mt-1">{c.l}</div>
          <span className="chip mt-1" style={{ background: "#0b2f1f", color: "#fff", fontSize: "9px" }}>Total</span>
        </div>
      ))}
    </div>
  );
}

export function ChipSaude({ s }: { s: Saude | null }) {
  if (!s) return <span style={{ color: "var(--muted)" }}>—</span>;
  const c = COR_SAUDE[s.nivel];
  const titulo = `Últimos 7 dias: ${s.enviados7d} enviados • respostas ${s.taxaResposta}% • falhas ${s.taxaFalha}% • pediram para sair ${s.taxaSair}% • sem WhatsApp ${s.taxaSemWhatsapp}%`;
  return <span className="chip" title={titulo} data-saude={s.nivel} style={{ background: c.fundo, color: c.cor }}>{s.rotulo}</span>;
}

export function Pessoa({ nome, detalhe }: { nome: string; detalhe?: ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
      <span style={{ width: 26, height: 26, borderRadius: 999, background: "var(--primary)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 12, flexShrink: 0 }}>
        {(nome || "?")[0]?.toUpperCase()}
      </span>
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        <b>{nome}</b>{detalhe && <span style={{ color: "var(--muted)" }}> • {detalhe}</span>}
      </span>
    </div>
  );
}
