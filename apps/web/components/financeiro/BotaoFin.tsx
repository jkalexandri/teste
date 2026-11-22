"use client";

// Botão que chama uma ação do servidor por id, com confirmação opcional (decisão #106).
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/app/Toast";

export default function BotaoFin({ acao, id, rotulo, confirmar, perigo }: { acao: (id: string) => Promise<{ ok: boolean; mensagem: string }>; id: string; rotulo: string; confirmar?: string; perigo?: boolean }) {
  const toast = useToast();
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  return (
    <button type="button" className="btn-ghost !py-1 !px-2 !text-[11px]" style={perigo ? { color: "#b42318" } : undefined} disabled={ocupado}
      onClick={async () => {
        if (confirmar && !confirm(confirmar)) return;
        setOcupado(true);
        const r = await acao(id);
        setOcupado(false);
        toast(r.mensagem, r.ok ? "ok" : "erro");
        if (r.ok) router.refresh();
      }}>{ocupado ? "…" : rotulo}</button>
  );
}
