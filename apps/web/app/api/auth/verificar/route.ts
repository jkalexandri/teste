// POST /api/auth/verificar — segunda etapa da entrada do Super Admin (decisão #105): código do app autenticador
// ou um código de recuperação. 5 erros: a tentativa é cancelada e é preciso entrar de novo com a senha.
import { NextResponse } from "next/server";
import { prisma } from "@filapro/db";
import { obterSessaoPendente2fa, encerrarSessao, SESSAO_PRIMEIRO_ACESSO_MIN } from "@/lib/auth/session";
import { conferirTotp, lerSegredo, usarCodigoRecuperacao } from "@/lib/auth/dois-fatores";
import { registrarLog } from "@/lib/logs";
import { alertarEntradaSuperAdmin } from "@/lib/alertas-seguranca";
import { limitarPorIp } from "@/lib/limite-acesso";

const MAX_TENTATIVAS_2FA = 5;

export async function POST(req: Request) {
  const limite = await limitarPorIp("verificar", 20, 10 * 60_000);
  if (limite) return limite;
  const s = await obterSessaoPendente2fa();
  if (!s) return NextResponse.json({ erro: "A verificação expirou. Entre de novo com a senha." }, { status: 401 });
  const u = s.usuario;
  const { codigo = "", recuperacao = false } = (await req.json().catch(() => ({}))) as { codigo?: string; recuperacao?: boolean };

  let ok = false;
  let restantes: number | null = null;
  if (recuperacao) {
    const nova = usarCodigoRecuperacao(u.doisFatoresCodigos, String(codigo));
    if (nova) {
      ok = true;
      restantes = nova.length;
      await prisma.usuario.update({ where: { id: u.id }, data: { doisFatoresCodigos: nova } });
    }
  } else if (u.doisFatoresSegredo) {
    try { ok = conferirTotp(lerSegredo(u.doisFatoresSegredo), String(codigo)); } catch { ok = false; }
  }

  if (!ok) {
    const t = s.tentativas2fa + 1;
    await registrarLog(u, "SENHA", "Código da verificação em duas etapas errado");
    if (t >= MAX_TENTATIVAS_2FA) {
      await encerrarSessao();
      return NextResponse.json({ erro: "Muitos códigos errados. Entre de novo com a senha.", voltar: true }, { status: 401 });
    }
    await prisma.sessao.update({ where: { id: s.id }, data: { tentativas2fa: t } });
    return NextResponse.json({ erro: `Código incorreto. Restam ${MAX_TENTATIVAS_2FA - t} tentativas.` }, { status: 401 });
  }

  // Liberou: a sessão passa a valer o tempo normal
  await prisma.sessao.update({ where: { id: s.id }, data: { pendente2fa: false, tentativas2fa: 0, expiraEm: new Date(Date.now() + (s.precisaTrocar ? SESSAO_PRIMEIRO_ACESSO_MIN * 60 * 1000 : 24 * 3600 * 1000)) } });
  await registrarLog(u, "ENTRADA", recuperacao ? `Entrou no sistema (código de recuperação; restam ${restantes})` : "Entrou no sistema (verificação em duas etapas)");
  await alertarEntradaSuperAdmin(u.id, u.cargo).catch(() => undefined);
  return NextResponse.json({ destino: s.precisaTrocar ? "/primeiro-acesso" : "/dashboard", restantes });
}
