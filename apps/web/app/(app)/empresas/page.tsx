// Empresas — Super Admin: cria e gerencia empresas e pacotes.
// Admin da Empresa: vê só a própria empresa (somente leitura).
import { redirect } from "next/navigation";
import { prisma, Cargo, Modulo } from "@filapro/db";
import { obterSessao } from "@/lib/auth/session";
import Cabecalho from "@/components/app/Cabecalho";
import GestaoEmpresas, { type EmpresaLinha } from "./GestaoEmpresas";
import { INCLUIR_FICHA, treinoDaConta } from "@/lib/treino-ia";

export const dynamic = "force-dynamic";

function dias(d: Date) {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const fim = new Date(d);
  fim.setHours(0, 0, 0, 0);
  return Math.round((fim.getTime() - hoje.getTime()) / 86400000);
}

export default async function EmpresasPage() {
  const sessao = await obterSessao();
  if (!sessao) redirect("/login");
  const souSuper = sessao.usuario.cargo === Cargo.SUPERADMIN;

  const empresas = await prisma.empresa.findMany({
    where: souSuper ? { modulo: Modulo.EMPRESARIAL } : { id: sessao.usuario.empresaId ?? "-" },
    include: {
      usuarios: { select: { id: true, codigo: true, nome: true, email: true, cargo: true, status: true }, orderBy: { nome: "asc" } },
      _count: { select: { leads: true } },
      ...INCLUIR_FICHA,
    },
    orderBy: { nome: "asc" },
  });
  const linhas: EmpresaLinha[] = empresas.map((e) => ({
    id: e.id,
    codigo: e.codigo ?? "",
    leads: e._count.leads,
    limiteLeads: e.limiteLeads,
    treino: treinoDaConta(e),
    nome: e.nome,
    pacote: e.pacote,
    planoId: e.planoId,
    limite: e.limiteUsuarios,
    ativa: e.ativa,
    expiraEm: e.expiraEm.toISOString(),
    dias: dias(e.expiraEm),
    // O Admin da Empresa não conta no limite (decisão #23).
    usados: e.usuarios.filter((u) => u.cargo === Cargo.USUARIO).length,
    usuarios: e.usuarios.map((u) => ({ id: u.id, codigo: u.codigo ?? "", nome: u.nome, email: u.email, admin: u.cargo === Cargo.ADMIN_EMPRESA, ativo: u.status === "ATIVO" })),
  }));

  const planos = souSuper
    ? (await prisma.plano.findMany({ where: { modulo: Modulo.EMPRESARIAL }, orderBy: { ordem: "asc" } })).map((p) => ({
        id: p.id, nome: p.nome, usuarios: p.usuarios, personalizado: p.personalizado, prazoDias: p.prazoDias,
      }))
    : [];

  return (
    <section className="flex-1 flex flex-col">
      <Cabecalho
        rotulo={souSuper ? "Super Admin • Empresas" : "Admin da Empresa • Minha empresa"}
        titulo={souSuper ? "Empresas e pacotes" : "Minha empresa"}
        descricao={
          souSuper
            ? "Crie empresas com o Admin, defina o pacote e o prazo, prorrogue e ative/inative. O Admin da Empresa não conta no limite de usuários."
            : "Pacote, limite de usuários e vencimento da sua empresa. Para mudar o pacote, fale com o suporte."
        }
      />
      <GestaoEmpresas empresas={linhas} planos={planos} podeEditar={souSuper} />
    </section>
  );
}
