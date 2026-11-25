// Arquivos (etapa 8a — decisões #67 e #68): anexos do usuário para as campanhas. Os arquivos ficam na VPS.
import { redirect } from "next/navigation";
import { prisma, Cargo, ANEXOS } from "@filapro/db";
import { obterSessao } from "@/lib/auth/session";
import Cabecalho from "@/components/app/Cabecalho";
import GestaoArquivos from "./GestaoArquivos";
import { protegerTela } from "@/lib/auth/tela";

export const dynamic = "force-dynamic";

export default async function ArquivosPage() {
  await protegerTela(); // trava da tela antes de qualquer dado (decisão #130)
  const s = await obterSessao();
  if (!s || s.usuario.cargo === Cargo.ADMIN_EMPRESA) redirect("/dashboard");
  const arquivos = await prisma.arquivo.findMany({
    where: { usuarioId: s.usuario.id },
    orderBy: { criadoEm: "desc" },
    include: { campanhas: { select: { assunto: true, status: true } } },
  });
  return (
    <section className="flex-1 flex flex-col">
      <Cabecalho rotulo="Vendas • Arquivos" titulo="Arquivos" descricao={`Anexos para as campanhas: ${ANEXOS.map((a) => `${a.rotulo} até ${a.maxMB} MB`).join(" • ")}.`} />
      <GestaoArquivos
        arquivos={arquivos.map((a) => ({
          id: a.id, nome: a.nome, tipo: a.tipo, tamanho: a.tamanho, criadoEm: a.criadoEm.toISOString(),
          campanhas: a.campanhas.map((c) => c.assunto || "(sem assunto)"),
        }))}
      />
    </section>
  );
}
