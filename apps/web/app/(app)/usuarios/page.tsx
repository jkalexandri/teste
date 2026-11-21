// Admin da Empresa → Usuários: cadastra os usuários da empresa dentro do limite
// do pacote. Todos vencem junto com o pacote (decisão #46).
import { redirect } from "next/navigation";
import { prisma, Cargo } from "@filapro/db";
import { obterSessao } from "@/lib/auth/session";
import Cabecalho from "@/components/app/Cabecalho";
import GestaoUsuarios from "./GestaoUsuarios";

export const dynamic = "force-dynamic";

export default async function UsuariosPage() {
  const sessao = await obterSessao();
  if (!sessao?.usuario.empresa) redirect("/dashboard");
  const empresa = sessao.usuario.empresa;
  const usuarios = await prisma.usuario.findMany({
    where: { empresaId: empresa.id, cargo: Cargo.USUARIO },
    orderBy: { nome: "asc" },
  });
  return (
    <section className="flex-1 flex flex-col">
      <Cabecalho
        rotulo="Admin • Gestão de usuários"
        titulo="Usuários"
        descricao={`Cadastre os usuários de ${empresa.nome}. Cada um recebe uma senha temporária por e-mail e usa o próprio WhatsApp. Todos vencem junto com o pacote (${empresa.expiraEm.toLocaleDateString("pt-BR")}).`}
      />
      <GestaoUsuarios
        limite={empresa.limiteUsuarios}
        usuarios={usuarios.map((u) => ({
          id: u.id,
          nome: u.nome,
          email: u.email,
          whatsapp: u.whatsapp ?? "",
          ativo: u.status === "ATIVO",
          pendente: !!u.senhaTempHash && !u.senhaHash,
          permissoes: u.permissoes,
          ultimoAcesso: u.ultimoAcesso?.toISOString() ?? null,
        }))}
      />
    </section>
  );
}
