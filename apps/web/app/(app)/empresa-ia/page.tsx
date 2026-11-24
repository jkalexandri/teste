// Empresa | IA (etapa 9b — decisões #74, #75 e #77): o que a IA sabe sobre a empresa.
import { redirect } from "next/navigation";
import { prisma } from "@filapro/db";
import Cabecalho from "@/components/app/Cabecalho";
import { atorEmpresaIA, mesAtual } from "@/lib/empresa-ia";
import { workerConfigurado } from "@/lib/worker";
import TelaEmpresaIA from "./TelaEmpresaIA";
import { MAX_COMO_QUALIFICAR, sugestaoQualificar } from "@/lib/sugestao-qualificar";

export const dynamic = "force-dynamic";

export default async function EmpresaIAPage() {
  const a = await atorEmpresaIA().catch(() => null);
  if (!a) redirect("/dashboard");
  const materiais = await prisma.materialIA.findMany({ where: { fichaId: a.ficha.id }, orderBy: { criadoEm: "desc" } });
  const f = a.ficha;
  return (
    <section className="flex-1 flex flex-col">
      <Cabecalho
        rotulo="Configurações • Empresa | IA"
        titulo="Empresa | IA"
        descricao={a.podeEditar
          ? "Ensine a IA sobre a sua empresa. Ela monta uma ficha resumida, usada nas mensagens das campanhas e nas conversas."
          : "O que a IA sabe sobre a empresa. Só o administrador pode alterar."}
      />
      <TelaEmpresaIA
        podeEditar={a.podeEditar}
        treinarIA={a.treinarIA}
        servicoConfigurado={workerConfigurado()}
        campos={{ nome: f.nome, endereco: f.endereco, telefone: f.telefone, whatsapp: f.whatsapp, atividade: f.atividade, comoQualificar: f.comoQualificar }}
        sugestaoQualificar={a.podeEditar ? await sugestaoQualificar() : ""}
        maxQualificar={MAX_COMO_QUALIFICAR}
        resumo={f.resumo}
        resumoEm={f.resumoEm?.toISOString() ?? null}
        montando={f.montando}
        uso={{
          materiais: f.materiaisPeriodo,
          limiteMateriais: a.limiteMateriais,
          paginasMes: f.mesRef === mesAtual() ? f.paginasMes : 0,
          limitePaginasMes: a.limitePaginasMes,
        }}
        materiais={materiais.map((m) => ({
          id: m.id, tipo: m.tipo, origem: m.origem, status: m.status, resumo: m.resumo, paginas: m.paginas, erro: m.erro,
          criadoEm: m.criadoEm.toISOString(), lidoEm: m.lidoEm?.toISOString() ?? null,
        }))}
      />
    </section>
  );
}
