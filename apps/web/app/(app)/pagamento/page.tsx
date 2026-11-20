// Super Admin → Pagamento: forma de pagamento (por enquanto só PIX — decisão #29),
// dados do PIX e contato do plano Personalizado (decisão #35).
import { prisma } from "@filapro/db";
import Cabecalho from "@/components/app/Cabecalho";
import FormPagamento from "./FormPagamento";

export const dynamic = "force-dynamic";

export default async function PagamentoPage() {
  const c = await prisma.configVenda.upsert({ where: { id: "config" }, update: {}, create: { id: "config" } });
  return (
    <section className="flex-1 flex flex-col">
      <Cabecalho
        rotulo="Super Admin • Configurações"
        titulo="Pagamento"
        descricao="Dados usados no pagamento dos planos comprados pelo popup “Planos”."
      />
      <FormPagamento
        inicial={{
          chavePix: c.chavePix,
          nomeRecebedor: c.nomeRecebedor,
          cidadeRecebedor: c.cidadeRecebedor,
          contatoPersonalizado: c.contatoPersonalizado,
        }}
      />
    </section>
  );
}
