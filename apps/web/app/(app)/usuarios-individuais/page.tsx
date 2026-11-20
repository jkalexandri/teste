// Super Admin → Usuários Individuais.
import { prisma, Cargo, Modulo } from "@filapro/db";
import Cabecalho from "@/components/app/Cabecalho";
import GestaoIndividuais from "./GestaoIndividuais";

export const dynamic = "force-dynamic";

function dias(d: Date) {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const fim = new Date(d);
  fim.setHours(0, 0, 0, 0);
  return Math.round((fim.getTime() - hoje.getTime()) / 86400000);
}

export default async function IndividuaisPage() {
  const [usuarios, planos] = await Promise.all([
    prisma.usuario.findMany({
      where: { cargo: Cargo.USUARIO, empresa: { modulo: Modulo.INDIVIDUAL } },
      include: { empresa: true },
      orderBy: { nome: "asc" },
    }),
    prisma.plano.findMany({ where: { modulo: Modulo.INDIVIDUAL }, orderBy: { ordem: "asc" } }),
  ]);
  return (
    <section className="flex-1 flex flex-col">
      <Cabecalho
        rotulo="Super Admin • Usuários Individuais"
        titulo="Usuários Individuais"
        descricao="Cada usuário individual tem a própria conta e o próprio prazo. Separado do grupo “Empresas”."
      />
      <GestaoIndividuais
        planos={planos.map((p) => ({ id: p.id, nome: p.nome, gratis: p.gratis, prazoDias: p.gratis ? p.testeDias ?? 7 : p.prazoDias }))}
        usuarios={usuarios.map((u) => ({
          id: u.id,
          empresaId: u.empresaId!,
          nome: u.nome,
          email: u.email,
          whatsapp: u.whatsapp ?? "",
          pacote: u.empresa?.pacote ?? "",
          expiraEm: u.empresa?.expiraEm.toISOString() ?? "",
          dias: u.empresa ? dias(u.empresa.expiraEm) : 0,
          ativo: u.status === "ATIVO",
          primeiroAcesso: !u.senhaHash,
        }))}
      />
    </section>
  );
}
