// Layout de todas as telas depois do login.
// Confere: sessão válida, troca de senha pendente, acesso ainda válido
// (pacote/empresa/status) e se o perfil pode abrir a tela atual.
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { prisma, Cargo, Modulo, StatusPedido } from "@filapro/db";
import { obterSessao } from "@/lib/auth/session";
import { diasRestantes, motivoSemAcesso } from "@/lib/auth/acesso";
import { menuDoCargo, rotaPermitida } from "@/lib/menu";
import AppShell from "@/components/app/AppShell";
import Presenca from "@/components/app/Presenca";
import { Suspense } from "react";
import { emManutencao } from "@/lib/manutencao";
import FaixaManutencao from "@/components/app/FaixaManutencao";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const sessao = await obterSessao();
  if (!sessao) redirect("/login");
  if (sessao.precisaTrocar) redirect("/primeiro-acesso");

  const motivo = motivoSemAcesso(sessao);
  if (motivo) redirect(`/api/auth/encerrar?motivo=${motivo}`);

  const u = sessao.usuario;
  const caminho = (await headers()).get("x-pathname") || "/dashboard";
  // Permissões só se aplicam ao Usuário (decisão #47).
  const permissoes = u.cargo === Cargo.USUARIO ? u.permissoes : undefined;
  if (!rotaPermitida(u.cargo, caminho, permissoes)) redirect("/dashboard");

  // Atualização em andamento (decisão #103): o cliente vê só a tela de atualização (a página nem é carregada);
  // o Super Admin continua usando e vê uma faixa para desligar a manutenção se precisar.
  const manutencao = await emManutencao();
  const bloqueado = manutencao && u.cargo !== Cargo.SUPERADMIN;

  // Contador de pedidos aguardando confirmação (Super Admin).
  const contadores: Record<string, number> = {};
  if (u.cargo === Cargo.SUPERADMIN) {
    contadores["/pedidos"] = await prisma.pedido.count({
      where: { status: { in: [StatusPedido.AGUARDANDO] }, expiraEm: { gt: new Date() } },
    });
    // Suporte: conversas com mensagens novas (decisão #102)
    // e interessados com mensagens novas (decisão #104)
    contadores["/atendimento"] = (await prisma.suporteConversa.count({ where: { naoLidasSuporte: { gt: 0 } } })) + (await prisma.interessado.count({ where: { naoLidasSuporte: { gt: 0 } } }));
  }

  return (
    <AppShell
      dados={{
        nome: u.nome,
        email: u.email,
        cargo: u.cargo,
        dias: diasRestantes(sessao),
        expiraEm: u.empresa ? u.empresa.expiraEm.toISOString() : null,
        // Cobrança automática no cartão (decisão #124, item h): só o dono da conta desliga
        renovacaoAutomatica: u.empresa?.asaasAssinaturaId
          ? { podeDesligar: (u.empresa.modulo === Modulo.INDIVIDUAL && u.cargo === Cargo.USUARIO) || (u.empresa.modulo === Modulo.EMPRESARIAL && u.cargo === Cargo.ADMIN_EMPRESA) }
          : null,
        menu: menuDoCargo(u.cargo, permissoes),
        contadores,
      }}
    >
      {manutencao && !bloqueado && <FaixaManutencao />}
      {bloqueado ? null : children}
      {/* Online, mensagens do Super Admin e Suporte (decisão #102) */}
      <Suspense fallback={null}><Presenca cliente={u.cargo !== Cargo.SUPERADMIN} manutencaoInicial={bloqueado} /></Suspense>
    </AppShell>
  );
}
