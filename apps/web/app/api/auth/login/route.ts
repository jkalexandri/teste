// POST /api/auth/login — entrada no sistema.
import { NextResponse, after } from "next/server";
import { limitarPorIp, ipDoPedido } from "@/lib/limite-acesso";
import { Modulo } from "@filapro/db";
import { tentarLogin, destinoPorCargo } from "@/lib/auth/login";
import { criarSessao } from "@/lib/auth/session";
import { isPasswordValid } from "@/lib/password-policy";
import { prisma } from "@filapro/db";
import { registrarLog } from "@/lib/logs";
import { MSG_MANUTENCAO, emManutencao } from "@/lib/manutencao";
import { alertarBloqueio, alertarEntradaSuperAdmin } from "@/lib/alertas-seguranca";
import { Cargo } from "@filapro/db";
import { podeAvisarDono } from "@/lib/auth/tentativas";
import { enviarEmail, emailContaProtegida } from "@/lib/email";

export async function POST(req: Request) {
  // Limite por endereço de internet (decisão #105): 20 tentativas a cada 10 minutos
  const limite = await limitarPorIp("login", 20, 10 * 60_000);
  if (limite) return limite;
  const corpo = await req.json().catch(() => ({}));
  const email = String(corpo.email || "");
  const senha = String(corpo.senha || "");
  const modulo = corpo.modulo === "empresarial" ? Modulo.EMPRESARIAL : Modulo.INDIVIDUAL;

  if (!email.includes("@") || !isPasswordValid(senha)) {
    return NextResponse.json({ erro: "Confira o e-mail e todos os requisitos da senha antes de entrar." }, { status: 400 });
  }

  const r = await tentarLogin(email, senha, modulo, await ipDoPedido());
  // Logs (decisão #99): entradas e senhas erradas/bloqueios de quem tem conta
  const quem = await prisma.usuario.findUnique({ where: { email: email.trim().toLowerCase() }, select: { id: true, nome: true, email: true, empresaId: true, cargo: true } });
  if (!r.ok) {
    if (quem) await registrarLog(quem, "SENHA", `Entrada recusada: ${r.erro}`);
    // Alerta de segurança (decisão #105): bloqueio por senha errada
    if (quem && /bloqueado por/.test(r.erro)) await alertarBloqueio(quem).catch(() => undefined);
    // Conta em proteção (30 erros de vários endereços): avisa o dono por e-mail, no máximo 1 por hora (decisão #160)
    if (r.avisarDono) {
      const d = r.avisarDono;
      after(async () => {
        if (!(await podeAvisarDono(d.email))) return;
        const { texto, html } = emailContaProtegida(d.nome);
        await enviarEmail({ para: d.email, assunto: "Muitas tentativas de entrar na sua conta — FilaPro Leads", texto, html });
      });
    }
    return NextResponse.json({ erro: r.erro }, { status: 401 });
  }
  // Atualização em andamento (decisão #103): só o Super Admin entra
  if (r.cargo !== Cargo.SUPERADMIN && (await emManutencao())) return NextResponse.json({ erro: MSG_MANUTENCAO, manutencao: true }, { status: 503 });
  // Verificação em duas etapas (decisão #105): o Super Admin com ela ativa ainda precisa do código
  const doisFatores = r.cargo === Cargo.SUPERADMIN && !!(await prisma.usuario.findUnique({ where: { id: r.usuarioId }, select: { doisFatoresAtivo: true } }))?.doisFatoresAtivo;
  if (doisFatores) {
    await criarSessao(r.usuarioId, r.precisaTrocar, true);
    return NextResponse.json({ destino: "/verificacao" });
  }
  if (quem) await registrarLog(quem, "ENTRADA", "Entrou no sistema");
  await alertarEntradaSuperAdmin(r.usuarioId, r.cargo).catch(() => undefined);

  await criarSessao(r.usuarioId, r.precisaTrocar);
  return NextResponse.json({ destino: r.precisaTrocar ? "/primeiro-acesso" : destinoPorCargo(r.cargo) });
}
