// Leads de anúncios (etapa 10b — decisões #82, #84, #90 e #94): endereço secreto, instruções e últimos recebidos.
import { redirect } from "next/navigation";
import { prisma, Cargo } from "@filapro/db";
import Cabecalho from "@/components/app/Cabecalho";
import { obterSessao } from "@/lib/auth/session";
import { formatarTelefone } from "@/lib/telefone";
import TelaAnuncios from "./TelaAnuncios";

export const dynamic = "force-dynamic";
const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://filaproleads.com.br";

export default async function LeadsAnunciosPage() {
  const s = await obterSessao();
  if (!s || s.usuario.cargo === Cargo.ADMIN_EMPRESA) redirect("/dashboard");
  const u = s.usuario;
  const incluido = u.cargo === Cargo.SUPERADMIN || !!u.empresa?.leadsAnuncios;
  const recebidos = await prisma.leadAnuncio.findMany({ where: { usuarioId: u.id }, orderBy: { recebidoEm: "desc" }, take: 50 });
  return (
    <section className="flex-1 flex flex-col">
      <Cabecalho
        rotulo="Configurações • Leads de anúncios"
        titulo="Leads de anúncios"
        descricao="Leads do Google Ads e do Facebook/Instagram entram sozinhos na sua lista e a IA já começa o atendimento pelo seu WhatsApp."
      />
      <TelaAnuncios
        incluido={incluido}
        endereco={u.tokenAnuncios ? `${SITE}/api/anuncios/${u.tokenAnuncios}` : null}
        recebidos={recebidos.map((r) => ({
          id: r.id, origem: r.origem, nome: r.nome, telefone: /^\d{10,15}$/.test(r.telefone) ? formatarTelefone(r.telefone) : r.telefone,
          assunto: r.assunto.split("\n")[0] ?? "", status: r.status, erro: r.erro, recebidoEm: r.recebidoEm.toISOString(), leadId: r.leadId,
        }))}
      />
    </section>
  );
}
