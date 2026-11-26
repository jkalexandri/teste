// Semáforo do atendimento por IA (decisão #149): os 4 pontos com a bolinha verde (ligado), amarela (atenção) ou vermelha (desligado).
// Usado no Dashboard do Super Admin (link para o controle) e no cartão do menu Inteligência Artificial.
import Link from "next/link";
import type { StatusPonto } from "@filapro/ia";

export const COR_IA = { VERDE: "#16a34a", AMARELO: "#f59e0b", VERMELHO: "#e5484d" } as const;

export function Bolinha({ cor, tamanho = 14 }: { cor: keyof typeof COR_IA; tamanho?: number }) {
  return <span className="inline-block rounded-full shrink-0" style={{ width: tamanho, height: tamanho, background: COR_IA[cor], boxShadow: `0 0 0 3px ${COR_IA[cor]}22` }} aria-hidden />;
}

/** Quadro "Inteligência Artificial" do Dashboard: só mostra (as chaves ficam no menu Inteligência Artificial). */
export default function StatusIA({ status }: { status: StatusPonto[] }) {
  return (
    <div className="card p-3 mt-3 shrink-0" data-testid="status-ia">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display font-bold text-[14px]">Inteligência Artificial</h2>
        <Link href="/inteligencia-artificial" className="text-[12px] font-bold underline" style={{ color: "var(--primary)" }}>Ligar / desligar</Link>
      </div>
      <ul className="grid sm:grid-cols-2 xl:grid-cols-4 gap-x-4 gap-y-2 mt-2">
        {status.map((s) => (
          <li key={s.ponto}>
            <Link href="/inteligencia-artificial" className="flex items-center gap-2 text-[13px]" data-testid={`ia-status-${s.ponto}`} data-cor={s.cor}>
              <Bolinha cor={s.cor} />
              <span><b>{s.rotulo}</b><br /><span className="text-[11px]" style={{ color: "var(--muted)" }}>{s.texto}</span></span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
