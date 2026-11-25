"use client";

// Selo do topo para quem tem cobrança automática no cartão (decisão #124, item h):
// "Renova em X dias"; ao tocar, mostra a data da renovação e, para o dono da conta, o botão de desligar.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Clock3 } from "@/components/icons";
import { useToast } from "./Toast";
import { desligarMinhaCobrancaAutomatica } from "@/app/(app)/conta/actions";

export default function ChipRenovacao({ dias, expiraEm, podeDesligar }: { dias: number; expiraEm: string; podeDesligar: boolean }) {
  const [aberto, setAberto] = useState(false);
  const [pendente, iniciar] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const data = new Date(expiraEm).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });

  function desligar() {
    if (!window.confirm(`Desligar a cobrança automática? Seu acesso continua até ${data}; depois, a renovação volta a ser pelo link.`)) return;
    iniciar(async () => {
      const r = await desligarMinhaCobrancaAutomatica();
      toast(r.mensagem, r.ok ? "ok" : "erro");
      if (r.ok) { setAberto(false); router.refresh(); }
    });
  }

  return (
    <span className="relative">
      <button type="button" className="chip" style={{ background: "var(--primary-soft)", color: "var(--primary-dark)" }}
        onClick={() => setAberto((a) => !a)} aria-expanded={aberto} data-testid="chip-renovacao">
        <Clock3 size={12} /> {dias === 0 ? "Renova hoje" : `Renova em ${dias} ${dias === 1 ? "dia" : "dias"}`}
      </button>
      {aberto && (
        <span className="card absolute right-0 top-full mt-1.5 z-40 w-[260px] p-3 block text-left" role="dialog" aria-label="Renovação automática" data-testid="quadro-renovacao">
          <span className="block text-[12px] font-bold leading-snug">Renovação automática no cartão em {data}.</span>
          {podeDesligar ? (
            <button type="button" className="btn-ghost !py-1.5 !text-[12px] mt-2 w-full" disabled={pendente} onClick={desligar} data-testid="desligar-minha-automatica">
              Desligar cobrança automática
            </button>
          ) : (
            <span className="block text-[11px] mt-1" style={{ color: "var(--muted)" }}>Só o dono da conta pode mudar a forma de pagamento.</span>
          )}
        </span>
      )}
    </span>
  );
}
