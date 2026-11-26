"use client";

// Chave geral da IA no suporte dos clientes (decisão #146): começa desligada; o Super Admin liga depois de testar.
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useToast } from "@/components/app/Toast";

export default function ChaveIASuporte({ ligada }: { ligada: boolean }) {
  const toast = useToast();
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  async function trocar() {
    setOcupado(true);
    const r = await fetch("/api/suporte/ia", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ligada: !ligada }) })
      .then((x) => x.json()).catch(() => ({ ok: false, mensagem: "Não foi possível agora." }));
    setOcupado(false);
    toast(r.mensagem, r.ok ? "ok" : "erro");
    router.refresh();
  }
  return (
    <div className="card p-3 mt-3 flex flex-wrap items-center gap-3" data-testid="chave-ia-suporte">
      <div className="flex-1 min-w-[240px]">
        <b className="text-[13px]">IA no suporte dos clientes: <span data-testid="ia-suporte-estado" style={{ color: ligada ? "#087a44" : "var(--muted)" }}>{ligada ? "ligada" : "desligada"}</span></b>
        <p className="help">
          {ligada
            ? "A IA responde primeiro quem escreve pelo botão Suporte. Ao você escrever, ela para naquela conversa. Pagamento, cobrança, cancelamento, bloqueio, reclamação, arquivos, pedido de atendente e dúvidas que ela não souber passam para você, com aviso."
            : "Desligada: só você responde o suporte. Ligue para a IA responder primeiro (usa a sua chave de IA; limite de 20 respostas por conversa por dia)."}
        </p>
      </div>
      <button type="button" className={ligada ? "btn-ghost" : "btn-primary"} onClick={trocar} disabled={ocupado} data-testid="ia-suporte-alternar">{ligada ? "Desligar a IA" : "Ligar a IA"}</button>
    </div>
  );
}
