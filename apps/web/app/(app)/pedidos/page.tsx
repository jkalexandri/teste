// Super Admin → Pedidos: compras feitas pelo popup "Planos" (PIX com confirmação manual).
import { prisma, StatusPedido } from "@filapro/db";
import Cabecalho from "@/components/app/Cabecalho";
import ListaPedidos from "./ListaPedidos";

export const dynamic = "force-dynamic";

export default async function PedidosPage() {
  // Pedidos aguardando há mais de 24 h passam a "expirado" (decisão #37).
  await prisma.pedido.updateMany({
    where: { status: StatusPedido.AGUARDANDO, expiraEm: { lt: new Date() } },
    data: { status: StatusPedido.EXPIRADO },
  });
  const pedidos = await prisma.pedido.findMany({ orderBy: { criadoEm: "desc" }, take: 500 });
  return (
    <section className="flex-1 flex flex-col">
      <Cabecalho
        rotulo="Super Admin • Vendas"
        titulo="Pedidos"
        descricao="Confira o PIX no seu banco e clique em “Confirmar pagamento”. A conta é criada e o acesso vai por e-mail."
      />
      <ListaPedidos
        pedidos={pedidos.map((p) => ({
          id: p.id,
          codigo: p.codigo,
          renovacao: p.renovacao,
          status: p.status,
          planoNome: p.planoNome,
          modulo: p.modulo,
          usuarios: p.usuarios,
          valor: p.valor,
          nome: p.nome,
          email: p.email,
          whatsapp: p.whatsapp,
          empresaNome: p.empresaNome,
          criadoEm: p.criadoEm.toISOString(),
          expiraEm: p.expiraEm.toISOString(),
          confirmadoEm: p.confirmadoEm?.toISOString() ?? null,
        }))}
      />
    </section>
  );
}
