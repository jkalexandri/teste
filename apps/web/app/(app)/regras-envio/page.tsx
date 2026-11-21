// Super Admin → Regras de envio (decisão #65): faixa global de horário, feriados e a janela do próprio Super Admin.
import { prisma, minParaHora } from "@filapro/db";
import Cabecalho from "@/components/app/Cabecalho";
import FormRegras from "./FormRegras";

export const dynamic = "force-dynamic";

/** "11-20" → "20/11"; "2026-12-24" → "24/12/2026"; "SEXTA-SANTA" → "Sexta-feira Santa" */
function feriadoTexto(f: string) {
  if (f === "SEXTA-SANTA") return "Sexta-feira Santa";
  const [a, b, c] = f.split("-");
  return c ? `${c}/${b}/${a}` : `${b}/${a}`;
}

export default async function RegrasEnvioPage() {
  const g = await prisma.configEnvio.upsert({ where: { id: "config" }, update: {}, create: { id: "config" } });
  return (
    <section className="flex-1 flex flex-col">
      <Cabecalho rotulo="Super Admin • Configurações" titulo="Regras de envio" descricao="Limites que valem para todas as contas. Cada conta ajusta a própria janela dentro desta faixa." />
      <FormRegras
        horaMinima={minParaHora(g.horaMinima)}
        horaMaxima={minParaHora(g.horaMaxima)}
        feriados={g.feriados.map(feriadoTexto).join("\n")}
        inicio={minParaHora(g.janelaInicioSuperAdmin)}
        fim={minParaHora(g.janelaFimSuperAdmin)}
      />
    </section>
  );
}
