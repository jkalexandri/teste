"use server";

// Ações de Campanhas (etapa 8a). O envio em si acontece no serviço 24/7 (etapa 8b):
// aqui a campanha é montada, salva como rascunho, agendada ou iniciada (fila criada no banco).
import { revalidatePath } from "next/cache";
import { prisma, StatusCampanha, StatusEnvio, StatusWhatsapp, regraAnexo, type Prisma } from "@filapro/db";
import { atorCampanhas, disparosRestantes, limparDados, resolverLeads, type DadosCampanha } from "@/lib/campanhas";
import { apagarArquivoDoWorker, guardarArquivoNoWorker } from "@/lib/worker";
import { formatarTelefone } from "@/lib/telefone";

type R = { ok: boolean; mensagem: string; id?: string };

async function minhaCampanha(id: string) {
  const u = await atorCampanhas();
  const c = await prisma.campanha.findUnique({ where: { id } });
  return c && c.usuarioId === u.id ? { u, c } : null;
}

async function arquivoValido(usuarioId: string, arquivoId: string | null) {
  if (!arquivoId) return null;
  const a = await prisma.arquivo.findUnique({ where: { id: arquivoId } });
  return a && a.usuarioId === usuarioId ? a.id : null;
}

/** Salvar rascunho (abas Mensagem, Leads e Antibloqueio — prompt seção 8). */
export async function salvarRascunho(d: DadosCampanha): Promise<R> {
  const u = await atorCampanhas();
  const dados = limparDados(d);
  dados.arquivoId = await arquivoValido(u.id, dados.arquivoId);
  if (d.id) {
    const x = await minhaCampanha(d.id);
    if (!x || x.c.status !== StatusCampanha.RASCUNHO) return { ok: false, mensagem: "Rascunho não encontrado." };
    await prisma.campanha.update({ where: { id: d.id }, data: dados });
    revalidatePath("/campanhas");
    return { ok: true, mensagem: "Rascunho salvo com as alterações atuais.", id: d.id };
  }
  const c = await prisma.campanha.create({ data: { ...dados, usuarioId: u.id, empresaId: u.empresaId } });
  revalidatePath("/campanhas");
  return { ok: true, mensagem: "Rascunho salvo com as alterações atuais.", id: c.id };
}

export async function excluirRascunho(id: string): Promise<R> {
  const x = await minhaCampanha(id);
  if (!x || x.c.status !== StatusCampanha.RASCUNHO) return { ok: false, mensagem: "Rascunho não encontrado." };
  await prisma.campanha.delete({ where: { id } });
  revalidatePath("/campanhas");
  return { ok: true, mensagem: "Rascunho excluído." };
}

/** Prévia da aba Leads: quantos vão receber e quem pediu para sair (decisão #57). */
export async function previaLeads(d: Pick<DadosCampanha, "selecaoTodos" | "selecaoStatus" | "leadsEscolhidos" | "manterQuemSaiu">) {
  const u = await atorCampanhas();
  const r = await resolverLeads(u.id, limparDados({ ...(d as DadosCampanha) }));
  const fmt = (l: { id: string; codigo: string; nome: string; telefone: string; pediuSairEm: Date | null }) => ({
    id: l.id, codigo: l.codigo, nome: l.nome, telefone: formatarTelefone(l.telefone), pediuSairEm: l.pediuSairEm?.toISOString() ?? null,
  });
  return { total: r.enviar.length, bloqueados: r.bloqueados.length, antigosSair: r.antigosSair.map(fmt), restantesTeste: await disparosRestantes(u.empresa) };
}

/** Busca para "Escolher leads" (só ativos do próprio usuário). */
export async function buscarLeads(q: string) {
  const u = await atorCampanhas();
  const dig = q.replace(/\D/g, "");
  const leads = await prisma.lead.findMany({
    where: {
      usuarioId: u.id,
      ativo: true,
      ...(q.trim() ? { OR: [{ nome: { contains: q.trim(), mode: "insensitive" } }, { codigo: q.trim().toUpperCase() }, ...(dig.length >= 4 ? [{ telefone: { contains: dig } }] : [])] } : {}),
    },
    orderBy: { criadoEm: "desc" },
    take: 200,
    select: { id: true, codigo: true, nome: true, telefone: true, status: true },
  });
  return leads.map((l) => ({ ...l, telefone: formatarTelefone(l.telefone) }));
}

/**
 * Iniciar ou agendar (aba Prévia|envio). Cria a fila (um envio por lead) — o serviço 24/7
 * envia respeitando o Antibloqueio (etapa 8b). Depois disso a tela "Nova" é limpa.
 */
export async function iniciarCampanha(d: DadosCampanha, agendarPara: string | null, avisarSempre = false): Promise<R> {
  const u = await atorCampanhas();
  const dados = limparDados(d);
  dados.arquivoId = await arquivoValido(u.id, dados.arquivoId);
  if (!dados.assunto) return { ok: false, mensagem: "Informe o assunto da campanha (aba Mensagem)." };
  if (!dados.mensagem.trim()) return { ok: false, mensagem: "Escreva a mensagem principal (aba Mensagem)." };

  let quando: Date | null = null;
  if (agendarPara) {
    quando = new Date(agendarPara);
    if (Number.isNaN(quando.getTime()) || quando.getTime() < Date.now() + 60_000) return { ok: false, mensagem: "Escolha uma data e hora no futuro para agendar." };
  } else {
    const wa = await prisma.whatsappSessao.findUnique({ where: { id: u.id } });
    if (wa?.status !== StatusWhatsapp.CONECTADO) return { ok: false, mensagem: "Conecte o seu WhatsApp (menu WhatsApp) antes de iniciar." };
  }

  const { enviar } = await resolverLeads(u.id, dados);
  if (!enviar.length) return { ok: false, mensagem: "Nenhum lead para esta campanha (aba Leads)." };

  // Eliminação de duplicados: o mesmo telefone uma vez só (o banco também garante).
  const vistos = new Set<string>();
  const unicos = enviar.filter((l) => (vistos.has(l.telefone) ? false : (vistos.add(l.telefone), true)));
  // Ordem embaralhada quando "Randomização" está ligada.
  const ordem = unicos.map((_, i) => i);
  if (dados.randomizar) for (let i = ordem.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [ordem[i], ordem[j]] = [ordem[j]!, ordem[i]!]; }

  const id = await prisma.$transaction(async (tx) => {
    let campanhaId = d.id ?? null;
    if (campanhaId) {
      const c = await tx.campanha.findUnique({ where: { id: campanhaId } });
      if (!c || c.usuarioId !== u.id || c.status !== StatusCampanha.RASCUNHO) campanhaId = null;
    }
    const comum: Prisma.CampanhaUncheckedUpdateInput = {
      ...dados,
      status: quando ? StatusCampanha.AGENDADA : StatusCampanha.EM_ANDAMENTO,
      agendadaPara: quando,
      iniciadaEm: quando ? null : new Date(),
      totalLeads: unicos.length,
      // Resposta à pergunta feita ao iniciar/agendar (decisão #71)
      avisarSempre: !!avisarSempre,
      ultimoAviso: null,
    };
    const c = campanhaId
      ? await tx.campanha.update({ where: { id: campanhaId }, data: comum })
      : await tx.campanha.create({ data: { ...(comum as Prisma.CampanhaUncheckedCreateInput), usuarioId: u.id, empresaId: u.empresaId } });
    for (let i = 0; i < unicos.length; i += 1000) {
      await tx.envio.createMany({
        data: unicos.slice(i, i + 1000).map((l, j) => ({ campanhaId: c.id, leadId: l.id, telefone: l.telefone, nome: l.nome, ordem: ordem[i + j]!, status: StatusEnvio.PENDENTE })),
        skipDuplicates: true,
      });
    }
    return c.id;
  }, { timeout: 60_000 });

  revalidatePath("/campanhas");
  return {
    ok: true,
    id,
    mensagem: quando
      ? `Campanha agendada para ${quando.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })} com ${unicos.length} leads.`
      : `Campanha iniciada com ${unicos.length} leads. O envio segue o Antibloqueio.`,
  };
}

/** Em andamento: só pausar ou cancelar (prompt seção 8). */
export async function pausarCampanha(id: string): Promise<R> {
  const x = await minhaCampanha(id);
  if (!x || (x.c.status !== StatusCampanha.EM_ANDAMENTO && x.c.status !== StatusCampanha.AGENDADA)) return { ok: false, mensagem: "Campanha não está em andamento." };
  await prisma.campanha.update({ where: { id }, data: { status: StatusCampanha.PAUSADA, motivo: "Pausada pelo usuário." } });
  revalidatePath("/campanhas");
  return { ok: true, mensagem: "Campanha pausada." };
}

export async function retomarCampanha(id: string): Promise<R> {
  const x = await minhaCampanha(id);
  if (!x || x.c.status !== StatusCampanha.PAUSADA) return { ok: false, mensagem: "Campanha não está pausada." };
  const wa = await prisma.whatsappSessao.findUnique({ where: { id: x.u.id } });
  if (wa?.status !== StatusWhatsapp.CONECTADO) return { ok: false, mensagem: "Conecte o seu WhatsApp antes de retomar." };
  await prisma.campanha.update({ where: { id }, data: { status: StatusCampanha.EM_ANDAMENTO, motivo: null, iniciadaEm: x.c.iniciadaEm ?? new Date() } });
  revalidatePath("/campanhas");
  return { ok: true, mensagem: "Campanha retomada." };
}

export async function cancelarCampanha(id: string, motivo: string): Promise<R> {
  const x = await minhaCampanha(id);
  const ativos: StatusCampanha[] = [StatusCampanha.EM_ANDAMENTO, StatusCampanha.AGENDADA, StatusCampanha.PAUSADA];
  if (!x || !ativos.includes(x.c.status)) return { ok: false, mensagem: "Esta campanha não pode ser cancelada." };
  await prisma.$transaction([
    prisma.campanha.update({ where: { id }, data: { status: StatusCampanha.CANCELADA, canceladaEm: new Date(), motivo: motivo.trim().slice(0, 300) || "Cancelada pelo usuário." } }),
    prisma.envio.updateMany({ where: { campanhaId: id, status: StatusEnvio.PENDENTE }, data: { status: StatusEnvio.PULADO, motivo: "Campanha cancelada" } }),
  ]);
  revalidatePath("/campanhas");
  return { ok: true, mensagem: "Campanha cancelada." };
}

/** Duplicar: só concluída (não permitido quando cancelada — prompt seção 8). Vira rascunho. */
export async function duplicarCampanha(id: string): Promise<R> {
  const x = await minhaCampanha(id);
  if (!x || x.c.status !== StatusCampanha.CONCLUIDA) return { ok: false, mensagem: "Só campanhas concluídas podem ser duplicadas." };
  const c = x.c;
  const nova = await prisma.campanha.create({
    data: {
      usuarioId: c.usuarioId, empresaId: c.empresaId, assunto: `${c.assunto} (cópia)`, referencia: c.referencia, mensagem: c.mensagem, variacoes: c.variacoes,
      modo: c.modo, bloqueio24h: c.bloqueio24h, descadastro: c.descadastro, textoDescadastro: c.textoDescadastro, incluirDataHora: c.incluirDataHora,
      eliminarDuplicados: c.eliminarDuplicados, randomizar: c.randomizar, selecaoTodos: c.selecaoTodos, selecaoStatus: c.selecaoStatus,
      leadsEscolhidos: c.leadsEscolhidos, arquivoId: c.arquivoId,
    },
  });
  revalidatePath("/campanhas");
  return { ok: true, mensagem: "Campanha duplicada como rascunho.", id: nova.id };
}

// ===== Anexos (decisões #67 e #68) =====

export async function enviarArquivo(form: FormData): Promise<R & { arquivo?: { id: string; nome: string; tipo: string; tamanho: number } }> {
  const u = await atorCampanhas();
  const f = form.get("arquivo");
  if (!(f instanceof File) || f.size === 0) return { ok: false, mensagem: "Escolha um arquivo." };
  const regra = regraAnexo(f.type);
  if (!regra) return { ok: false, mensagem: "Tipo não aceito. Use imagem JPG/PNG, PDF, vídeo MP4 ou áudio MP3/OGG/M4A." };
  if (f.size > regra.maxMB * 1024 * 1024) return { ok: false, mensagem: `${regra.rotulo}: máximo de ${regra.maxMB} MB.` };
  const a = await prisma.arquivo.create({ data: { usuarioId: u.id, nome: f.name.slice(0, 120), tipo: f.type, tamanho: f.size } });
  const r = await guardarArquivoNoWorker(a.id, await f.arrayBuffer());
  if (!r.ok) {
    await prisma.arquivo.delete({ where: { id: a.id } });
    return { ok: false, mensagem: r.mensagem };
  }
  revalidatePath("/arquivos");
  return { ok: true, mensagem: "Arquivo enviado.", arquivo: { id: a.id, nome: a.nome, tipo: a.tipo, tamanho: a.tamanho } };
}

/** Exclui um arquivo que não está em campanha ativa. */
export async function excluirArquivo(id: string): Promise<R> {
  const u = await atorCampanhas();
  const a = await prisma.arquivo.findUnique({ where: { id }, include: { campanhas: { select: { status: true } } } });
  if (!a || a.usuarioId !== u.id) return { ok: false, mensagem: "Arquivo não encontrado." };
  const emUso = a.campanhas.some((c) => c.status === StatusCampanha.EM_ANDAMENTO || c.status === StatusCampanha.AGENDADA || c.status === StatusCampanha.PAUSADA);
  if (emUso) return { ok: false, mensagem: "Este arquivo está em uma campanha em andamento, agendada ou pausada." };
  await prisma.arquivo.delete({ where: { id } });
  await apagarArquivoDoWorker(id);
  revalidatePath("/arquivos");
  return { ok: true, mensagem: "Arquivo excluído." };
}
