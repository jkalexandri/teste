// Saldo de disparos do período (decisão #102): aparece só em planos por quantidade de envio e no teste grátis.
import { prisma, saldoDisparos } from "@filapro/db";
import { formatarReais } from "@/lib/planos";
import ComprarPacote from "./ComprarPacote";

export default async function SaldoDisparos({ empresa, podeComprar }: {
  empresa: { id: string; planoId: string | null; limiteDisparos: number | null; disparosExtras: number; inicioPeriodo: Date; expiraEm: Date } | null;
  podeComprar: boolean;
}) {
  const s = await saldoDisparos(prisma, empresa);
  if (!s || !empresa) return null;
  const plano = empresa.planoId ? await prisma.plano.findUnique({ where: { id: empresa.planoId } }) : null;
  const total = s.limite + s.extras;
  const pct = total ? Math.min(100, Math.round((s.usados / total) * 100)) : 100;
  const acabou = s.restantes <= 0;
  const pacote = plano?.pacoteDisparos && plano.precoPacoteDisparos != null && plano.precoPacoteDisparos > 0 && !plano.gratis ? { qtd: plano.pacoteDisparos, preco: plano.precoPacoteDisparos } : null;
  return (
    <div className="card p-3 mt-3 flex flex-wrap items-center gap-3" data-testid="saldo-disparos">
      <div className="flex-1 min-w-[220px]">
        <p className="text-[12px] font-bold">
          Disparos do período: <span data-testid="saldo-usados">{s.usados.toLocaleString("pt-BR")}</span> de {total.toLocaleString("pt-BR")}
          {s.extras > 0 && <span style={{ color: "var(--muted)" }}> (inclui {s.extras.toLocaleString("pt-BR")} extras)</span>}
          {" • "}<span style={{ color: acabou ? "#b42318" : "var(--primary-dark)" }}>{acabou ? "acabaram" : `restam ${s.restantes.toLocaleString("pt-BR")}`}</span>
        </p>
        <div className="h-2 rounded-full mt-1.5 overflow-hidden" style={{ background: "var(--surface-3)" }}>
          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: acabou ? "#b42318" : pct >= 80 ? "#d4a017" : "var(--primary)" }} />
        </div>
        <p className="help mt-1">
          {acabou ? "As campanhas estão paradas. Elas voltam sozinhas ao comprar um pacote extra ou renovar o plano." : `O saldo zera na renovação (${empresa.expiraEm.toLocaleDateString("pt-BR")}).`}
          {" "}Só as mensagens de campanha contam; as respostas da IA e as suas mensagens nas conversas não.
        </p>
      </div>
      {podeComprar && pacote && <ComprarPacote qtd={pacote.qtd} preco={pacote.preco} precoTexto={formatarReais(pacote.preco)} />}
    </div>
  );
}
