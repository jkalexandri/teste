// Conversas IA (etapa 10 — decisão #92): lista de conversas à esquerda e a conversa à direita.
import { redirect } from "next/navigation";
import { prisma, Cargo, type Prisma } from "@filapro/db";
import Cabecalho from "@/components/app/Cabecalho";
import { atorConversas } from "@/lib/conversas";
import { formatarTelefone } from "@/lib/telefone";
import { numerosParaCampanha } from "@/lib/campanhas";
import { LISTA_STATUS } from "@/lib/leads-status";
import TelaConversas from "./TelaConversas";

export const dynamic = "force-dynamic";

type Busca = { lead?: string; status?: string; temp?: string; q?: string };

export default async function ConversasPage({ searchParams }: { searchParams: Promise<Busca> }) {
  const a = await atorConversas().catch(() => null);
  if (!a) redirect("/dashboard");
  const sp = await searchParams;
  const status = LISTA_STATUS.includes(sp.status as never) ? sp.status : "";
  const temp = ["QUENTE", "MORNO", "FRIO"].includes(sp.temp ?? "") ? sp.temp! : "";
  const q = (sp.q ?? "").trim().slice(0, 60);
  const digitos = q.replace(/\D/g, "");

  const onde: Prisma.LeadWhereInput = {
    ...a.escopo,
    ultimaMensagemEm: { not: null },
    ...(status ? { status: status as never } : {}),
    ...(temp ? { qualificacao: temp } : {}),
    ...(q ? { OR: [{ nome: { contains: q, mode: "insensitive" } }, ...(digitos ? [{ telefone: { contains: digitos } }] : []), { codigo: { contains: q.toUpperCase() } }] } : {}),
  };
  const lista = await prisma.lead.findMany({
    where: onde,
    orderBy: { ultimaMensagemEm: "desc" },
    take: 150,
    include: {
      usuario: { select: { nome: true } },
      mensagens: { orderBy: { criadoEm: "desc" }, take: 1, select: { texto: true, tipo: true, autor: true } },
    },
  });

  const aberto = sp.lead ? await prisma.lead.findFirst({ where: { ...a.escopo, id: sp.lead }, include: { usuario: { select: { nome: true } } } }) : null;
  const mensagens = aberto
    ? (await prisma.mensagem.findMany({ where: { leadId: aberto.id }, orderBy: { criadoEm: "desc" }, take: 300 })).reverse()
    : [];
  const arquivos = aberto && a.podeResponder(aberto)
    ? await prisma.arquivo.findMany({ where: { usuarioId: a.u.id }, orderBy: { criadoEm: "desc" }, select: { id: true, nome: true, tipo: true } })
    : [];
  const verDono = a.u.cargo !== Cargo.USUARIO;
  // Vários WhatsApps (decisão #95, item 7): mostra por qual número é a conversa
  const numeros = aberto ? await numerosParaCampanha(aberto.usuarioId) : [];
  const numeroDaConversa = numeros.length > 1 ? numeros.find((n) => n.id === (aberto?.sessaoId ?? aberto?.usuarioId))?.rotulo ?? null : null;

  return (
    <section className="flex-1 flex flex-col min-h-0">
      <Cabecalho
        rotulo="Vendas • Conversas IA"
        titulo="Conversas IA"
        descricao={a.temIA
          ? "A IA atende quem responde, qualifica (Quente, Morno, Frio) e trata objeções. Assuma a conversa quando quiser."
          : "Conversas dos usuários da empresa (somente leitura)."}
      />
      <TelaConversas
        temIA={a.temIA}
        iaLigada={a.u.iaConversas}
        filtros={{ status: status ?? "", temp, q }}
        lista={lista.map((l) => ({
          id: l.id, nome: l.nome, telefone: formatarTelefone(l.telefone), codigo: l.codigo, status: l.status, temperatura: l.qualificacao,
          naoLidas: l.naoLidas, iaPausada: l.iaPausada, quando: l.ultimaMensagemEm!.toISOString(), dono: verDono ? l.usuario.nome : null,
          ultima: l.mensagens[0] ? { texto: l.mensagens[0].texto, tipo: l.mensagens[0].tipo, autor: l.mensagens[0].autor } : null,
        }))}
        aberto={aberto ? {
          id: aberto.id, nome: aberto.nome, telefone: formatarTelefone(aberto.telefone), codigo: aberto.codigo, status: aberto.status,
          temperatura: aberto.qualificacao, motivo: aberto.qualificacaoMotivo, iaPausada: aberto.iaPausada, iaPausaMotivo: aberto.iaPausaMotivo,
          dono: aberto.usuario.nome, podeResponder: a.podeResponder(aberto), naoLidas: aberto.naoLidas, numero: numeroDaConversa,
        } : null}
        mensagens={mensagens.map((m) => ({ id: m.id, autor: m.autor, texto: m.texto, tipo: m.tipo, arquivoId: m.arquivoId, arquivoNome: m.arquivoNome, criadoEm: m.criadoEm.toISOString() }))}
        arquivos={arquivos}
      />
    </section>
  );
}
