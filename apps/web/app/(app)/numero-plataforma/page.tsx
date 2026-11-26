// Super Admin → Número da plataforma (decisão #51): conecta por QR Code o WhatsApp
// que envia os avisos do sistema e define o WhatsApp do Super Admin que recebe
// os avisos de novo pedido (decisão #38).
import { prisma, Cargo } from "@filapro/db";
import { redirect } from "next/navigation";
import Cabecalho from "@/components/app/Cabecalho";
import ConexaoWhatsapp from "@/components/app/ConexaoWhatsapp";
import { lerEstado, SESSAO_PLATAFORMA } from "@/lib/whatsapp";
import FormAvisos from "./FormAvisos";
import { lerFilaPlataforma, VALIDADE_HORAS } from "@/lib/fila-plataforma";
import { protegerTela } from "@/lib/auth/tela";

export const dynamic = "force-dynamic";

export default async function NumeroPlataformaPage() {
  const sessao = await protegerTela(); // trava da tela antes de qualquer dado (decisão #130)
  // Tela mais sensível (mostra o QR do número oficial): exige Super Admin de forma explícita
  if (sessao.usuario.cargo !== Cargo.SUPERADMIN) redirect("/dashboard");
  const c = await prisma.configVenda.upsert({ where: { id: "config" }, update: {}, create: { id: "config" } });
  const fila = await lerFilaPlataforma();
  return (
    <section className="flex-1 flex flex-col">
      <Cabecalho
        rotulo="Super Admin • Configurações"
        titulo="Número da plataforma"
        descricao="WhatsApp que envia os avisos do sistema: novos pedidos e links de renovação."
      />
      <ConexaoWhatsapp alvo="plataforma" inicial={await lerEstado(SESSAO_PLATAFORMA)} />
      {/* Fila de saída (decisão #143): cadência de 5–10 s, limite por dia e validade */}
      <div className="card p-4 mt-3" data-testid="fila-plataforma">
        <h3 className="font-display font-bold text-[13px]">Fila de envio</h3>
        <p className="text-[13px] mt-1">
          Enviadas hoje: <b data-testid="fila-enviadas">{fila.enviadasHoje}</b> de {fila.limite} · Na fila: <b data-testid="fila-pendentes">{fila.naFila}</b>
          {fila.expiradasHoje > 0 && <> · Expiradas hoje: <b>{fila.expiradasHoje}</b></>}
        </p>
        <p className="help">
          As mensagens saem com 5 a 10 segundos de intervalo, para proteger o número. Pedidos, suporte e segurança nunca esperam o limite;
          avisos aos usuários e links de renovação esperam o dia seguinte se o limite acabar. Com o número fora do ar, as mensagens ficam
          guardadas e saem na volta; passadas {VALIDADE_HORAS} horas, expiram.
        </p>
      </div>
      <FormAvisos numeroAvisos={c.numeroAvisos} />
    </section>
  );
}
