"use server";

// Comprar pacote extra de disparos (decisão #102): só o dono da conta (Individual ou Admin da Empresa). PIX → Pedidos.
import { prisma, Cargo, Modulo, StatusPedido } from "@filapro/db";
import { obterSessao } from "@/lib/auth/session";
import { motivoSemAcesso } from "@/lib/auth/acesso";
import { criarPedidoPix, type RespostaPix } from "@/lib/pedidos";
import { avisarNovoPedido } from "@/lib/avisos-whatsapp";

export async function comprarPacoteDisparos(pacotes: number): Promise<{ ok: false; mensagem: string } | ({ ok: true } & RespostaPix)> {
  const s = await obterSessao();
  if (!s || s.precisaTrocar || motivoSemAcesso(s)) return { ok: false, mensagem: "Acesso negado." };
  const u = s.usuario;
  const dono = u.cargo === Cargo.ADMIN_EMPRESA || (u.cargo === Cargo.USUARIO && u.empresa?.modulo === Modulo.INDIVIDUAL);
  if (!dono || !u.empresa?.planoId) return { ok: false, mensagem: "Só o responsável pela conta compra disparos extras." };
  const plano = await prisma.plano.findUnique({ where: { id: u.empresa.planoId } });
  if (!plano?.pacoteDisparos || plano.precoPacoteDisparos == null) return { ok: false, mensagem: "O seu plano não tem pacote extra de disparos." };
  const n = Math.min(20, Math.max(1, Math.floor(Number(pacotes) || 1)));
  const abertos = await prisma.pedido.count({ where: { empresaId: u.empresa.id, pacotesDisparos: { gt: 0 }, status: StatusPedido.AGUARDANDO, expiraEm: { gt: new Date() } } });
  if (abertos > 0) return { ok: false, mensagem: "Você já tem um pedido de disparos extras aguardando pagamento." };
  const r = await criarPedidoPix({
    plano,
    comprador: { nome: u.nome, email: u.email, whatsapp: u.whatsapp ?? "", empresaNome: u.empresa.nome },
    somenteExtras: { empresaId: u.empresa.id, valor: n * plano.precoPacoteDisparos },
    pacotesDisparos: n,
  });
  if ("erro" in r) return { ok: false, mensagem: r.erro };
  await avisarNovoPedido({ codigo: r.codigo, planoNome: r.plano, valor: r.valor, renovacao: false, nome: u.nome, email: u.email, whatsapp: u.whatsapp ?? "", empresaNome: u.empresa.nome }).catch(() => undefined);
  return { ok: true, ...r };
}
