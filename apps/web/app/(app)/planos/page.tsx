// Super Admin → Planos: edita o conteúdo dos cartões, escolhe quais aparecem
// no popup do login, o plano em destaque e a ordem (decisão #27).
import { prisma } from "@filapro/db";
import Cabecalho from "@/components/app/Cabecalho";
import EditorPlanos from "./EditorPlanos";

export const dynamic = "force-dynamic";

export default async function PlanosPage() {
  const planos = await prisma.plano.findMany({ orderBy: { ordem: "asc" } });
  return (
    <section className="flex-1 flex flex-col">
      <Cabecalho
        rotulo="Super Admin • Configurações"
        titulo="Planos"
        descricao="Edite os cartões do popup “Planos” da tela de login. Só os planos marcados como visíveis aparecem para o cliente."
      />
      <EditorPlanos planos={planos.map(({ criadoEm, atualizadoEm, ...p }) => p)} />
    </section>
  );
}
