"use client";

// Selo do topo com o vencimento da conta (decisões #124 e #125). Ao tocar, abre um quadrinho:
// - "Expira em X dias": a data e, para o dono da conta, "Fazer upgrade" (os outros: falar com o administrador);
// - "Renova em X dias" (cobrança automática no cartão): a data da renovação e, para o dono, "Fazer upgrade" e
//   "Desligar cobrança automática".
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Clock3 } from "@/components/icons";
import { useToast } from "./Toast";
import { desligarMinhaCobrancaAutomatica } from "@/app/(app)/conta/actions";

export default function ChipRenovacao({ dias, expiraEm, automatica, dono, onUpgrade }: {
  dias: number; expiraEm: string; automatica: boolean; dono: boolean; onUpgrade: () => void;
}) {
  const [aberto, setAberto] = useState(false);
  const raiz = useRef<HTMLSpanElement>(null);
  const [pendente, iniciar] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const data = new Date(expiraEm).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });

  // O quadrinho fecha ao clicar/tocar fora dele e com a tecla Esc (antes só fechava tocando de novo no selo)
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: PointerEvent) => { if (raiz.current && !raiz.current.contains(e.target as Node)) setAberto(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setAberto(false); };
    document.addEventListener("pointerdown", fora);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", fora); document.removeEventListener("keydown", esc); };
  }, [aberto]);

  function desligar() {
    if (!window.confirm(`Desligar a cobrança automática? Seu acesso continua até ${data}; depois, a renovação volta a ser pelo link.`)) return;
    iniciar(async () => {
      const r = await desligarMinhaCobrancaAutomatica();
      toast(r.mensagem, r.ok ? "ok" : "erro");
      if (r.ok) { setAberto(false); router.refresh(); }
    });
  }

  // Mesmas cores de antes: "Renova" em verde; "Expira" conforme os dias que faltam
  const cor = automatica
    ? { background: "var(--primary-soft)", color: "var(--primary-dark)" }
    : dias <= 3 ? { background: "#ffeef0", color: "#9e1d2f" } : dias <= 10 ? { background: "#fff7e0", color: "#8a5a00" } : { background: "var(--surface-3)", color: "var(--muted)" };
  const texto = automatica
    ? (dias === 0 ? "Renova hoje" : `Renova em ${dias} ${dias === 1 ? "dia" : "dias"}`)
    : (dias === 0 ? "Expira hoje" : `Expira em ${dias} ${dias === 1 ? "dia" : "dias"}`);

  return (
    <span className="relative" ref={raiz}>
      <button type="button" className="chip" style={cor} onClick={() => setAberto((a) => !a)} aria-expanded={aberto}
        data-testid={automatica ? "chip-renovacao" : "chip-expira"}>
        <Clock3 size={12} /> {texto}
      </button>
      {aberto && (
        <span className="card absolute right-0 top-full mt-1.5 z-40 w-[260px] p-3 block text-left" role="dialog" aria-label="Seu plano" data-testid="quadro-renovacao">
          <span className="block text-[12px] font-bold leading-snug">
            {automatica ? `Renovação automática no cartão em ${data}.` : `Seu acesso vence em ${data}.`}
          </span>
          {dono ? (
            <>
              <button type="button" className="btn-primary !py-1.5 !text-[12px] mt-2 w-full justify-center" onClick={() => { setAberto(false); onUpgrade(); }} data-testid="botao-upgrade">
                Fazer upgrade
              </button>
              {automatica && (
                <button type="button" className="btn-ghost !py-1.5 !text-[12px] mt-1.5 w-full justify-center" disabled={pendente} onClick={desligar} data-testid="desligar-minha-automatica">
                  Desligar cobrança automática
                </button>
              )}
            </>
          ) : (
            <span className="block text-[11px] mt-1" style={{ color: "var(--muted)" }}>Fale com o administrador para mudar de plano.</span>
          )}
        </span>
      )}
    </span>
  );
}
