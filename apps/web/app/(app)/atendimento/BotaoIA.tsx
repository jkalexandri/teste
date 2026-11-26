"use client";

// Assumir a conversa (a IA para) ou devolver para a IA — interessados (decisão #104) e suporte dos clientes (decisão #146).
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useToast } from "@/components/app/Toast";

export default function BotaoIA({ id, pausada, tipo = "interessados" }: { id: string; pausada: boolean; tipo?: "interessados" | "suporte" }) {
  const toast = useToast();
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  async function trocar() {
    setOcupado(true);
    const r = await fetch(`/api/${tipo === "suporte" ? "suporte" : "interessados"}/${id}/ia`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pausar: !pausada }) })
      .then((x) => x.json()).catch(() => ({ ok: false, mensagem: "Não foi possível agora." }));
    setOcupado(false);
    toast(r.mensagem, r.ok ? "ok" : "erro");
    router.refresh();
  }
  return <button type="button" className={pausada ? "btn-primary !py-1 !px-2 !text-[11px]" : "btn-ghost !py-1 !px-2 !text-[11px]"} onClick={trocar} disabled={ocupado}>{pausada ? "Devolver para a IA" : "Assumir conversa"}</button>;
}
