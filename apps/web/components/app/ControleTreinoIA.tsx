"use client";

// Super Admin: treinamento da IA de uma conta (decisão #77) — liga/desliga, limites do Empresa | IA
// e liberação das páginas do mês. Usado em Empresas e em Usuários Individuais.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X } from "@/components/icons";
import { useToast } from "@/components/app/Toast";
import CampoLimite from "@/components/app/CampoLimite";
import { definirTreinoIA } from "@/app/(app)/empresas/actions";

export type TreinoIA = { treinarIA: boolean; limiteMateriais: number | null; limitePaginasMes: number | null; materiais: number; paginasMes: number };

const lim = (v: number | null) => (v == null ? "ilimitado" : v.toLocaleString("pt-BR"));

export default function ControleTreinoIA({ empresaId, nome, t }: { empresaId: string; nome: string; t: TreinoIA }) {
  const router = useRouter();
  const toast = useToast();
  const [aberto, setAberto] = useState(false);
  const [pendente, iniciar] = useTransition();
  return (
    <>
      <button type="button" className="btn-ghost !py-1.5" onClick={() => setAberto(true)}>
        IA: {t.treinarIA ? "treino ligado" : "treino desligado"}
      </button>
      {aberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3" style={{ background: "rgba(10,20,15,.55)" }} role="dialog" aria-modal="true" aria-label="Treinamento da IA">
          <form
            className="card w-full max-w-[480px] p-4"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              iniciar(async () => {
                const r = await definirTreinoIA(empresaId, fd);
                toast(r.mensagem, r.ok ? "ok" : "erro");
                if (r.ok) { setAberto(false); router.refresh(); }
              });
            }}
          >
            <div className="flex justify-between items-start gap-2">
              <h2 className="font-display font-extrabold text-[16px] [overflow-wrap:anywhere]">Treinamento da IA • {nome}</h2>
              <button type="button" className="btn-ghost !p-1.5" onClick={() => setAberto(false)} aria-label="Fechar"><X size={14} /></button>
            </div>
            <p className="help mt-1">
              Uso: {t.materiais.toLocaleString("pt-BR")} / {lim(t.limiteMateriais)} materiais no período do plano • {t.paginasMes.toLocaleString("pt-BR")} / {lim(t.limitePaginasMes)} páginas neste mês
            </p>
            <fieldset disabled={pendente} className="grid gap-3 mt-3">
              <label className="flex items-center gap-2 text-[13px] font-bold cursor-pointer">
                <input type="checkbox" name="treinarIA" defaultChecked={t.treinarIA} className="w-4 h-4 accent-emerald-600" />
                Pode treinar a IA (enviar materiais no Empresa | IA)
              </label>
              <CampoLimite valor={t.limiteMateriais} campo="limiteMateriais" id={`tm-${empresaId}`} rotulo="Máximo de materiais" placeholder="Máximo de materiais" />
              <CampoLimite valor={t.limitePaginasMes} campo="limitePaginasMes" id={`tp-${empresaId}`} rotulo="Páginas lidas por mês" placeholder="Máximo de páginas" />
              <label className="flex items-center gap-2 text-[12px] cursor-pointer">
                <input type="checkbox" name="zerarMes" className="w-4 h-4 accent-emerald-600" />
                Liberar agora: zerar as páginas do mês e os materiais do período
              </label>
            </fieldset>
            <div className="flex justify-end gap-2 mt-3">
              <button type="button" className="btn-ghost" onClick={() => setAberto(false)}>Cancelar</button>
              <button type="submit" className="btn-primary" disabled={pendente}>{pendente ? "Salvando…" : "Salvar"}</button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
