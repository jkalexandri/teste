// Usuário → WhatsApp: conecta o próprio número por QR Code (decisões #1 e #18).
// O Admin da Empresa não usa WhatsApp (o menu dele não tem esta tela).
import { redirect } from "next/navigation";
import Cabecalho from "@/components/app/Cabecalho";
import ConexaoWhatsapp from "@/components/app/ConexaoWhatsapp";
import { lerEstado, sessaoDoAlvo } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

export default async function WhatsappPage() {
  const s = await sessaoDoAlvo("proprio");
  if (!s) redirect("/dashboard");
  return (
    <section className="flex-1 flex flex-col">
      <Cabecalho rotulo="Configurações • WhatsApp" titulo="WhatsApp" descricao="Conecte o seu WhatsApp lendo o QR Code com o celular." />
      <ConexaoWhatsapp alvo="proprio" inicial={await lerEstado(s.sessaoId)} />
    </section>
  );
}
