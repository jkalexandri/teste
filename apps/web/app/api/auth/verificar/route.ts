// POST /api/auth/verificar — segunda etapa da entrada do Super Admin (decisão #105): código do app autenticador
// ou um código de recuperação. 5 erros: a tentativa é cancelada e é preciso entrar de novo com a senha.
import { NextResponse } from "next/server";
import { prisma } from "@filapro/db";
import { obterSessaoPendente2fa, encerrarSessao, SESSAO_PRIMEIRO_ACESSO_MIN } from "@/lib/auth/session";
import { consumirPassoTotp, lerSegredo, passoDoCodigo, usarCodigoRecuperacao } from "@/lib/auth/dois-fatores";
import { chaveDois, erroDeCodigo, limparErrosDeCodigo, minutosCongelado } from "@/lib/auth/tentativas";
import { registrarLog } from "@/lib/logs";
import { alertarEntradaSuperAdmin, avisarSuperAdmins } from "@/lib/alertas-seguranca";
import { limitarPorIp, ipDoPedido } from "@/lib/limite-acesso";

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
  let erroTexto: string | null = null;
  if (recuperacao) {
    // Código de recuperação: vale uma vez, remoção atômica no banco (decisão #161). Funciona mesmo com o código de 6 dígitos congelado.
    const sobraram = await usarCodigoRecuperacao(u.id, String(codigo));
    if (sobraram !== null) { ok = true; restantes = sobraram; }
  } else if (u.doisFatoresSegredo) {
    const congelado = await minutosCongelado(u.id);
    if (congelado > 0) {
      erroTexto = `Muitos códigos errados. A verificação por código ficou bloqueada por ${congelado} ${congelado === 1 ? "minuto" : "minutos"}. Use um código de recuperação (“Perdi o celular”).`;
    } else {
      let passo: number | null = null;
      try { passo = passoDoCodigo(lerSegredo(u.doisFatoresSegredo), String(codigo)); } catch { passo = null; }
      if (passo !== null) {
        // Cada código vale uma vez (RFC 6238): o mesmo código, ou um mais antigo que o último aceito, é recusado
        ok = await consumirPassoTotp(u.id, passo);
        if (!ok) await registrarLog(u, "SENHA", "Código de verificação reutilizado recusado");
      }
      if (ok) await limparErrosDeCodigo(u.id);
      else if (await erroDeCodigo(u.id)) {
        // 10 códigos errados em 15 minutos (somando todas as entradas): congela o código de 6 dígitos e avisa o Super Admin
        const ip = await ipDoPedido();
        await registrarLog(u, "SENHA", "Verificação por código bloqueada por 15 minutos (10 códigos errados)");
        await avisarSuperAdmins(`🔐 Alerta de segurança: 10 códigos errados da verificação em duas etapas na conta do Super Admin ${u.email} em 15 minutos (último endereço ${ip}). A verificação por código ficou bloqueada por 15 minutos; os códigos de recuperação continuam valendo. Se não foi você, troque a senha.`).catch(() => undefined);
      }
    }
  }

  if (!ok) {
    const t = s.tentativas2fa + 1;
    await registrarLog(u, "SENHA", "Código da verificação em duas etapas errado");
    if (t >= MAX_TENTATIVAS_2FA) {
      await encerrarSessao();
      return NextResponse.json({ erro: "Muitos códigos errados. Entre de novo com a senha.", voltar: true }, { status: 401 });
    }
    await prisma.sessao.update({ where: { id: s.id }, data: { tentativas2fa: t } });
    return NextResponse.json({ erro: erroTexto ?? `Código incorreto. Restam ${MAX_TENTATIVAS_2FA - t} tentativas.` }, { status: 401 });
  }

  // Liberou: a sessão passa a valer o tempo normal
  await prisma.sessao.update({ where: { id: s.id }, data: { pendente2fa: false, tentativas2fa: 0, expiraEm: new Date(Date.now() + (s.precisaTrocar ? SESSAO_PRIMEIRO_ACESSO_MIN * 60 * 1000 : 24 * 3600 * 1000)) } });
  await registrarLog(u, "ENTRADA", recuperacao ? `Entrou no sistema (código de recuperação; restam ${restantes})` : "Entrou no sistema (verificação em duas etapas)");
  await alertarEntradaSuperAdmin(u.id, u.cargo).catch(() => undefined);
  return NextResponse.json({ destino: s.precisaTrocar ? "/primeiro-acesso" : "/dashboard", restantes });
}
