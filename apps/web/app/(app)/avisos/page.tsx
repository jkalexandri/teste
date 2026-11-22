// Avisos (etapa 10b — decisões #81 e #94): o usuário escolhe o número e quais avisos quer receber.
import { redirect } from "next/navigation";
import { Cargo } from "@filapro/db";
import Cabecalho from "@/components/app/Cabecalho";
import { obterSessao } from "@/lib/auth/session";
import { formatarTelefone } from "@/lib/telefone";
import FormAvisos from "./FormAvisos";

export const dynamic = "force-dynamic";

export default async function AvisosPage() {
  const s = await obterSessao();
  if (!s) redirect("/login");
  const u = s.usuario;
  const admin = u.cargo === Cargo.ADMIN_EMPRESA;
  return (
    <section className="flex-1 flex flex-col">
      <Cabecalho
        rotulo="Configurações • Avisos"
        titulo="Avisos"
        descricao={admin
          ? "Receba no WhatsApp os avisos dos leads de todos os usuários da empresa. Os avisos saem pelo número da plataforma."
          : "Receba no WhatsApp os avisos dos seus leads. Os avisos saem pelo número da plataforma."}
      />
      <FormAvisos
        inicial={{
          numeroAvisos: u.numeroAvisos ? formatarTelefone(u.numeroAvisos) : "",
          whatsapp: u.whatsapp ?? "",
          avisoQuente: u.avisoQuente, avisoAnuncio: u.avisoAnuncio, avisoRespondeu: u.avisoRespondeu, avisoCelular: u.avisoCelular,
        }}
      />
    </section>
  );
}
