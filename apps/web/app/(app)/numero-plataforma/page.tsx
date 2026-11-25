// Super Admin → Número da plataforma (decisão #51): conecta por QR Code o WhatsApp
// que envia os avisos do sistema e define o WhatsApp do Super Admin que recebe
// os avisos de novo pedido (decisão #38).
import { prisma, Cargo } from "@filapro/db";
import { redirect } from "next/navigation";
import Cabecalho from "@/components/app/Cabecalho";
import ConexaoWhatsapp from "@/components/app/ConexaoWhatsapp";
import { lerEstado, SESSAO_PLATAFORMA } from "@/lib/whatsapp";
import FormAvisos from "./FormAvisos";
import { protegerTela } from "@/lib/auth/tela";

export const dynamic = "force-dynamic";

export default async function NumeroPlataformaPage() {
  const sessao = await protegerTela(); // trava da tela antes de qualquer dado (decisão #130)
  // Tela mais sensível (mostra o QR do número oficial): exige Super Admin de forma explícita
  if (sessao.usuario.cargo !== Cargo.SUPERADMIN) redirect("/dashboard");
  const c = await prisma.configVenda.upsert({ where: { id: "config" }, update: {}, create: { id: "config" } });
  return (
    <section className="flex-1 flex flex-col">
      <Cabecalho
        rotulo="Super Admin • Configurações"
        titulo="Número da plataforma"
        descricao="WhatsApp que envia os avisos do sistema: novos pedidos e links de renovação."
      />
      <ConexaoWhatsapp alvo="plataforma" inicial={await lerEstado(SESSAO_PLATAFORMA)} />
      <FormAvisos numeroAvisos={c.numeroAvisos} />
    </section>
  );
}
