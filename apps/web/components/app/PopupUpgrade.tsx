"use client";

// Popup "Fazer upgrade" dentro do sistema (decisão #125): os planos iguais ou maiores do módulo da conta,
// com o mesmo visual e os mesmos passos do link de renovação (componente RenovarCliente no modo "upgrade").
import { useEffect, useState } from "react";
import { X } from "@/components/icons";
import RenovarCliente from "@/app/renovar/[token]/RenovarCliente";
import type { PlanoPublico } from "@/lib/planos";

type Dados = { conta: Parameters<typeof RenovarCliente>[0]["conta"]; planos: PlanoPublico[] };

export default function PopupUpgrade({ onFechar }: { onFechar: () => void }) {
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState("");

  useEffect(() => {
    fetch("/api/upgrade")
      .then(async (r) => { const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.erro || "Não foi possível abrir os planos."); return d; })
      .then(setDados)
      .catch((e) => setErro(e instanceof Error ? e.message : "Não foi possível abrir os planos."));
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && onFechar();
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [onFechar]);

  return (
    <div className="login-future fixed inset-0 z-50 overflow-y-auto p-3 py-6" role="dialog" aria-modal="true" aria-label="Fazer upgrade" data-testid="popup-upgrade">
      <div className="relative z-[1] w-full max-w-[1320px] mx-auto">
        <div className="flex justify-end mb-2">
          <button type="button" onClick={onFechar} className="login-ghost-btn !p-2" aria-label="Fechar"><X size={16} /></button>
        </div>
        {erro ? (
          <div className="login-glass rounded-[18px] p-5 max-w-[480px] mx-auto text-[13px] text-slate-300">{erro}</div>
        ) : !dados ? (
          <p className="text-[13px] text-slate-400 text-center">Carregando planos…</p>
        ) : (
          <RenovarCliente modo="upgrade" conta={dados.conta} planos={dados.planos} />
        )}
      </div>
    </div>
  );
}
