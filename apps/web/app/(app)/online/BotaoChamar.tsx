"use client";

// Chamar o cliente para o suporte: o chat abre sozinho na tela dele (decisão #102).
import { useState } from "react";
import { useToast } from "@/components/app/Toast";

export default function BotaoChamar({ usuarioId, rotulo = "Chamar" }: { usuarioId: string; rotulo?: string }) {
  const toast = useToast();
  const [ocupado, setOcupado] = useState(false);
  async function chamar() {
    setOcupado(true);
    const r = await fetch(`/api/suporte/${usuarioId}/chamar`, { method: "POST" }).then((x) => x.json()).catch(() => ({ ok: false, mensagem: "Não foi possível chamar." }));
    setOcupado(false);
    toast(r.mensagem, r.ok ? "ok" : "erro");
  }
  return <button type="button" className="btn-primary !py-1 !px-2 !text-[11px]" onClick={chamar} disabled={ocupado}>{ocupado ? "…" : rotulo}</button>;
}
