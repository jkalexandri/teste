// Admin da Empresa → Configurações. Por enquanto: janela de envio da empresa (decisões #6 e #65).
// As demais configurações chegam na etapa 12.
import { redirect } from "next/navigation";
import { prisma, minParaHora } from "@filapro/db";
import { obterSessao } from "@/lib/auth/session";
import Cabecalho from "@/components/app/Cabecalho";
import FormJanela from "@/components/envio/FormJanela";
import { protegerTela } from "@/lib/auth/tela";

export const dynamic = "force-dynamic";

export default async function ConfiguracoesPage() {
  await protegerTela(); // trava da tela antes de qualquer dado (decisão #130)
  const s = await obterSessao();
  if (!s?.usuario.empresa) redirect("/dashboard");
  const e = s.usuario.empresa;
  const g = await prisma.configEnvio.upsert({ where: { id: "config" }, update: {}, create: { id: "config" } });
  return (
    <section className="flex-1 flex flex-col">
      <Cabecalho rotulo="Admin • Configurações" titulo="Configurações" descricao={`Regras de envio da ${e.nome}: horário em que os usuários podem disparar campanhas.`} />
      <div className="card p-4 mt-3 max-w-[640px]">
        <h2 className="font-display font-bold text-[14px]">Janela de envio</h2>
        <p className="text-[12px] mt-0.5 mb-2" style={{ color: "var(--muted)" }}>Horário em que as campanhas de todos os usuários da empresa podem enviar.</p>
        <FormJanela inicio={minParaHora(e.janelaInicio)} fim={minParaHora(e.janelaFim)} faixa={`${minParaHora(g.horaMinima)} às ${minParaHora(g.horaMaxima)}`} />
      </div>
    </section>
  );
}
