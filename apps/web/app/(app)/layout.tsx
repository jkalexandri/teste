// Layout de todas as telas depois do login.
// Confere: sessão válida, troca de senha pendente, acesso ainda válido
// (pacote/empresa/status) e se o perfil pode abrir a tela atual.
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { prisma, Cargo, StatusPedido } from "@filapro/db";
import { obterSessao } from "@/lib/auth/session";
import { diasRestantes, motivoSemAcesso } from "@/lib/auth/acesso";
import { menuDoCargo, rotaPermitida } from "@/lib/menu";
import AppShell from "@/components/app/AppShell";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const sessao = await obterSessao();
  if (!sessao) redirect("/login");
  if (sessao.precisaTrocar) redirect("/primeiro-acesso");

  const motivo = motivoSemAcesso(sessao);
  if (motivo) redirect(`/api/auth/encerrar?motivo=${motivo}`);

  const u = sessao.usuario;
  const caminho = (await headers()).get("x-pathname") || "/dashboard";
  if (!rotaPermitida(u.cargo, caminho)) redirect("/dashboard");

  // Contador de pedidos aguardando confirmação (Super Admin).
  const contadores: Record<string, number> = {};
  if (u.cargo === Cargo.SUPERADMIN) {
    contadores["/pedidos"] = await prisma.pedido.count({
      where: { status: { in: [StatusPedido.AGUARDANDO] }, expiraEm: { gt: new Date() } },
    });
  }

  return (
    <AppShell
      dados={{
        nome: u.nome,
        email: u.email,
        cargo: u.cargo,
        dias: diasRestantes(sessao),
        expiraEm: u.empresa ? u.empresa.expiraEm.toISOString() : null,
        menu: menuDoCargo(u.cargo),
        contadores,
      }}
    >
      {children}
    </AppShell>
  );
}
