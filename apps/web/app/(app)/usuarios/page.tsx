// Admin da Empresa → Usuários: cadastra os usuários da empresa dentro do limite
// do pacote. Todos vencem junto com o pacote (decisão #46).
import { redirect } from "next/navigation";
import { prisma, Cargo } from "@filapro/db";
import { obterSessao } from "@/lib/auth/session";
import Cabecalho from "@/components/app/Cabecalho";
import GestaoUsuarios from "./GestaoUsuarios";
import { protegerTela } from "@/lib/auth/tela";

export const dynamic = "force-dynamic";

export default async function UsuariosPage() {
  await protegerTela(); // trava da tela antes de qualquer dado (decisão #130)
  const sessao = await obterSessao();
  if (!sessao?.usuario.empresa) redirect("/dashboard");
  const empresa = sessao.usuario.empresa;
  const usuarios = await prisma.usuario.findMany({
    where: { empresaId: empresa.id, cargo: Cargo.USUARIO },
    orderBy: { nome: "asc" },
  });
  // Leads por usuário (para mostrar uso x limite — decisão #58)
  const grupos = await prisma.lead.groupBy({ by: ["usuarioId"], where: { empresaId: empresa.id }, _count: { _all: true } });
  const contagem = new Map(grupos.map((g) => [g.usuarioId, g._count._all]));
  return (
    <section className="flex-1 flex flex-col">
      <Cabecalho
        rotulo="Admin • Gestão de usuários"
        titulo="Usuários"
        descricao={`Cadastre os usuários de ${empresa.nome}. Cada um recebe por e-mail um link para criar a senha e usa o próprio WhatsApp. Todos vencem junto com o pacote (${empresa.expiraEm.toLocaleDateString("pt-BR")}).`}
      />
      <GestaoUsuarios
        limite={empresa.limiteUsuarios}
        usuarios={usuarios.map((u) => ({
          id: u.id,
          codigo: u.codigo ?? "",
          limiteLeads: u.limiteLeads,
          leads: contagem.get(u.id) ?? 0,
          nome: u.nome,
          email: u.email,
          whatsapp: u.whatsapp ?? "",
          ativo: u.status === "ATIVO",
          pendente: !!u.linkSenhaHash || (!!u.senhaTempHash && !u.senhaHash),
          permissoes: u.permissoes,
          ultimoAcesso: u.ultimoAcesso?.toISOString() ?? null,
        }))}
      />
    </section>
  );
}
