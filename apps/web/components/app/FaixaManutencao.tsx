"use client";

// Faixa do Super Admin durante a manutenção (decisão #103): os clientes estão bloqueados.
// "Liberar o sistema" desliga a manutenção (use quando a atualização terminou com erro e você já conferiu).
import { useState } from "react";
import { useToast } from "@/components/app/Toast";
import { desligarManutencao } from "@/app/(app)/manutencao-actions";

export default function FaixaManutencao() {
  const toast = useToast();
  const [ocupado, setOcupado] = useState(false);
  return (
    <div className="rounded-xl px-3 py-2 mb-3 flex flex-wrap items-center gap-2 text-[12px]" style={{ background: "#fff4e5", color: "#7a4a00", border: "1px solid #f5c37a" }} data-testid="faixa-manutencao">
      <b>Modo manutenção ligado:</b> os clientes veem &quot;Sistema em atualização&quot; e nenhuma ação é aceita; campanhas e IA estão em espera.
      <button type="button" className="btn-ghost !py-1 !text-[11px] ml-auto" disabled={ocupado}
        onClick={async () => {
          if (!confirm("Liberar o sistema para os clientes agora?")) return;
          setOcupado(true);
          const r = await desligarManutencao();
          toast(r.mensagem, r.ok ? "ok" : "erro");
          if (r.ok) window.location.reload();
          setOcupado(false);
        }}>Liberar o sistema</button>
    </div>
  );
}
