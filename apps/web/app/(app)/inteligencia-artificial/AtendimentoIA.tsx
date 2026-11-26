"use client";

// Atendimento por IA em 4 pontos (decisão #149): estado de cada um e a chave liga/desliga. Só o Super Admin.
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useToast } from "@/components/app/Toast";
import { Bolinha } from "@/components/app/StatusIA";
import type { StatusPonto } from "@filapro/ia";

const DESCRICAO: Record<StatusPonto["ponto"], string> = {
  LEADS: "A IA responde os leads que respondem às campanhas (tela Conversas IA), de todos os usuários. Desligada, cada usuário atende na mão; ao religar, a IA responde quem ficou esperando (últimas 48 h).",
  CAMPANHAS: "O botão “Gerar com IA” da criação de campanhas. Desligado, o usuário escreve a mensagem manualmente.",
  SUPORTE: "A IA responde primeiro quem escreve pelo botão Suporte. Ao você escrever, ela para naquela conversa. Ao religar, responde quem ficou esperando (últimas 48 h).",
  VISITANTE: "O vendedor do chat da tela de Planos (quem ainda não é cliente). Desligado, só você responde. Ao religar, a IA responde quem ficou esperando (últimas 48 h).",
};

export default function AtendimentoIA({ status }: { status: StatusPonto[] }) {
  const toast = useToast();
  const router = useRouter();
  const [ocupado, setOcupado] = useState<string | null>(null);
  async function trocar(s: StatusPonto) {
    setOcupado(s.ponto);
    const r = await fetch("/api/ia/pontos", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ponto: s.ponto, ligada: !s.ligado }) })
      .then((x) => x.json()).catch(() => ({ ok: false, mensagem: "Não foi possível agora." }));
    setOcupado(null);
    toast(r.mensagem, r.ok ? "ok" : "erro");
    router.refresh();
  }
  return (
    <div className="card p-4 mt-3" data-testid="atendimento-ia" id="atendimento">
      <h2 className="font-display font-extrabold text-[16px]">Atendimento por IA</h2>
      <p className="help">
        Liga e desliga cada ponto para a plataforma toda. <b>Verde</b>: ligado e funcionando. <b>Amarelo</b>: ligado, mas com atenção (manutenção, falta de chave ou falhas da IA).
        {" "}<b>Vermelho</b>: desligado. Você recebe um aviso quando um ponto muda de cor. Leads, Suporte e Visitante usam a mesma IA (“Conversar e tratar objeções”).
      </p>
      <ul className="divide-y mt-2" style={{ borderColor: "var(--border)" }}>
        {status.map((s) => (
          <li key={s.ponto} className="py-2.5 flex flex-wrap items-center gap-3" data-testid={`ia-ponto-${s.ponto}`} data-cor={s.cor}>
            <Bolinha cor={s.cor} tamanho={16} />
            <div className="flex-1 min-w-[260px]">
              <div className="text-[14px] font-bold">{s.rotulo} <span className="text-[12px] font-normal" data-testid={`ia-ponto-texto-${s.ponto}`} style={{ color: s.cor === "VERDE" ? "#087a44" : s.cor === "AMARELO" ? "#8a5a00" : "#9e1d2f" }}>— {s.texto}</span></div>
              <p className="help">{DESCRICAO[s.ponto]}</p>
            </div>
            <button type="button" className={s.ligado ? "btn-ghost" : "btn-primary"} disabled={ocupado === s.ponto} onClick={() => trocar(s)} data-testid={`ia-ponto-alternar-${s.ponto}`}>
              {s.ligado ? "Desligar" : "Ligar"}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
