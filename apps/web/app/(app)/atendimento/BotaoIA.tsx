"use client";

// Assumir a conversa do interessado (a IA para) ou devolver para a IA (decisão #104).
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useToast } from "@/components/app/Toast";

export default function BotaoIA({ id, pausada }: { id: string; pausada: boolean }) {
  const toast = useToast();
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  async function trocar() {
    setOcupado(true);
    const r = await fetch(`/api/interessados/${id}/ia`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pausar: !pausada }) })
      .then((x) => x.json()).catch(() => ({ ok: false, mensagem: "Não foi possível agora." }));
    setOcupado(false);
    toast(r.mensagem, r.ok ? "ok" : "erro");
    router.refresh();
  }
  return <button type="button" className={pausada ? "btn-primary !py-1 !px-2 !text-[11px]" : "btn-ghost !py-1 !px-2 !text-[11px]"} onClick={trocar} disabled={ocupado}>{pausada ? "Devolver para a IA" : "Assumir conversa"}</button>;
}
