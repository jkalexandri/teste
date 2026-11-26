// Atendimento (decisão #102): o Super Admin conversa em tempo real com os clientes (Usuários e Admins da Empresa).
// Lista das conversas (com não lidas) à esquerda e o chat à direita. Histórico de 365 dias.
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma, Cargo, Modulo } from "@filapro/db";
import Cabecalho from "@/components/app/Cabecalho";
import AtualizarSozinho from "@/components/app/AtualizarSozinho";
import ChatSuporte from "@/components/app/ChatSuporte";
import { obterSessao } from "@/lib/auth/session";
import { ONLINE_MS } from "@/lib/suporte";
import BotaoChamar from "../online/BotaoChamar";
import NovoAtendimento from "./NovoAtendimento";
import BotaoIA from "./BotaoIA";
import { protegerTela } from "@/lib/auth/tela";

/**
 * Painel do chat (pedido do dono, mesmo cálculo da decisão #136): a página rola só até o painel encostar no topo fixo;
 * daí em diante ele ocupa a altura da tela e só as mensagens rolam — cabeçalho da conversa e caixa de escrever ficam fixos.
 * Topo fixo: 52 px (abaixo de 1024 px soma a fileira do menu, 44 px). No computador a altura deixa 170 px para o topo e o
 * cabeçalho da página; ao abrir a conversa a página se posiciona no painel (ChatSuporte), com a caixa de escrever à vista.
 */
const PAINEL_CHAT = "card overflow-hidden flex flex-col self-start sticky z-10 min-h-[360px] scroll-mt-[108px] lg:scroll-mt-[64px] top-[calc(var(--safe-area-inset-top)+108px)] lg:top-[calc(var(--safe-area-inset-top)+64px)] h-[calc(100dvh-var(--safe-area-inset-top)-124px)] lg:h-[calc(100dvh-var(--safe-area-inset-top)-170px)]";

export const dynamic = "force-dynamic";
const CARGOS: Record<string, string> = { ADMIN_EMPRESA: "Admin da Empresa", USUARIO: "Usuário" };

const TEMP: Record<string, string> = { QUENTE: "🔥 Quente", MORNO: "Morno", FRIO: "Frio" };

export default async function AtendimentoPage({ searchParams }: { searchParams: Promise<{ cliente?: string; aba?: string; interessado?: string }> }) {
  await protegerTela(); // trava da tela antes de qualquer dado (decisão #130)
  const s = await obterSessao();
  if (!s) redirect("/login");
  if (s.usuario.cargo !== Cargo.SUPERADMIN) redirect("/dashboard");
  const p = await searchParams;
  const [naoLidasClientes, naoLidasInteressados] = await Promise.all([
    prisma.suporteConversa.count({ where: { naoLidasSuporte: { gt: 0 } } }),
    prisma.interessado.count({ where: { naoLidasSuporte: { gt: 0 } } }),
  ]);
  const abas = (
    <nav className="flex gap-1.5 mt-3" aria-label="Abas do Atendimento">
      {[{ id: "clientes", rotulo: "Clientes", n: naoLidasClientes }, { id: "interessados", rotulo: "Interessados", n: naoLidasInteressados }].map((a) => (
        <Link key={a.id} href={`/atendimento?aba=${a.id}`} className={(p.aba === "interessados") === (a.id === "interessados") ? "btn-primary !py-1.5" : "btn-ghost !py-1.5"} data-testid={`aba-${a.id}`}>
          {a.rotulo}{a.n > 0 && <span className="ml-1 rounded-full px-1.5 text-[11px] font-extrabold" style={{ background: "#e5484d", color: "#fff" }}>{a.n}</span>}
        </Link>
      ))}
    </nav>
  );

  // ===== Aba Interessados (decisão #104): quem ainda não é cliente, pelo chat da tela de Planos =====
  if (p.aba === "interessados") {
    if (p.interessado) await prisma.interessado.updateMany({ where: { id: p.interessado, naoLidasSuporte: { gt: 0 } }, data: { naoLidasSuporte: 0 } });
    const lista = await prisma.interessado.findMany({ orderBy: { ultimaMensagemEm: "desc" }, take: 200 });
    const atualI = lista.find((x) => x.id === p.interessado);
    const onI = (x: { vistoEm: Date | null }) => !!x.vistoEm && Date.now() - x.vistoEm.getTime() < ONLINE_MS;
    return (
      <section className="flex-1 flex flex-col">
        <AtualizarSozinho segundos={10} />
        <Cabecalho rotulo="Principal • Atendimento" titulo="Atendimento" descricao="Interessados: visitantes que ainda não são clientes, pelo chat da tela de Planos. A IA responde primeiro; você assume quando quiser. Guardado 180 dias." />
        {abas}
        <div className="grid gap-3 mt-3 lg:grid-cols-[300px_1fr]">
          <div className="card p-2 max-h-[560px] overflow-y-auto" data-testid="lista-interessados">
            {lista.length === 0 && <p className="text-[12px] p-2" style={{ color: "var(--muted)" }}>Nenhum interessado ainda.</p>}
            {lista.map((x) => (
              <Link key={x.id} href={`/atendimento?aba=interessados&interessado=${x.id}`} className="block rounded-lg px-2 py-2 text-[12px]" data-testid="item-interessado"
                style={{ background: x.id === p.interessado ? "var(--surface-2, rgba(0,0,0,.05))" : undefined }}>
                <div className="flex items-center justify-between gap-1">
                  <b className="truncate"><span className="inline-block w-2 h-2 rounded-full mr-1" style={{ background: onI(x) ? "#16a34a" : "#9ca3af" }} />{x.nome}</b>
                  {x.naoLidasSuporte > 0 && <span className="rounded-full px-1.5 text-[11px] font-extrabold" style={{ background: "#e5484d", color: "#fff" }} data-testid="nao-lidas-interessado">{x.naoLidasSuporte}</span>}
                </div>
                <p style={{ color: "var(--muted)" }}>{x.temperatura ? `${TEMP[x.temperatura] ?? x.temperatura} • ` : ""}{x.iaPausada ? "Com você" : "IA atendendo"}</p>
                <p style={{ color: "var(--muted)" }}>{x.ultimaMensagemEm.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</p>
              </Link>
            ))}
          </div>
          <div className={atualI ? PAINEL_CHAT : "card overflow-hidden"} data-testid="painel-chat">
            {atualI ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 shrink-0" style={{ borderBottom: "1px solid var(--border)" }}>
                  <div className="text-[12px]"><b className="text-[14px]" data-testid="interessado-atual">{atualI.nome}</b> <span style={{ color: onI(atualI) ? "#16a34a" : "var(--muted)" }}>{onI(atualI) ? "• no chat agora" : "• fora do chat (sua resposta vai também pelo WhatsApp)"}</span><br />
                    <span style={{ color: "var(--muted)" }}>WhatsApp +{atualI.whatsapp}{atualI.email ? ` • ${atualI.email}` : ""}{atualI.iaPausaMotivo ? ` • ${atualI.iaPausaMotivo}` : ""}</span></div>
                  <BotaoIA id={atualI.id} pausada={atualI.iaPausada} />
                </div>
                <ChatSuporte key={atualI.id} modo="interessado" usuarioId={atualI.id} altura={420} preencher />
              </>
            ) : (
              <p className="text-[13px] p-6 text-center" style={{ color: "var(--muted)" }}>Escolha um interessado à esquerda. Escrever uma mensagem assume a conversa (a IA para).</p>
            )}
          </div>
        </div>
      </section>
    );
  }

  // Abrir a conversa já marca como lida (o contador some na hora)
  if (p.cliente) await prisma.suporteConversa.updateMany({ where: { usuarioId: p.cliente, naoLidasSuporte: { gt: 0 } }, data: { naoLidasSuporte: 0 } });
  const conversas = await prisma.suporteConversa.findMany({ orderBy: { ultimaMensagemEm: "desc" }, take: 200 });
  const ids = [...new Set([...conversas.map((c) => c.usuarioId), ...(p.cliente ? [p.cliente] : [])])];
  const pessoas = await prisma.usuario.findMany({
    where: { id: { in: ids }, cargo: { not: Cargo.SUPERADMIN } },
    select: { id: true, nome: true, email: true, cargo: true, vistoEm: true, empresa: { select: { nome: true, modulo: true } } },
  });
  const porId = new Map(pessoas.map((x) => [x.id, x]));
  const atual = p.cliente ? porId.get(p.cliente) : undefined;
  const clientes = await prisma.usuario.findMany({
    where: { cargo: { not: Cargo.SUPERADMIN }, status: "ATIVO" },
    orderBy: { nome: "asc" },
    take: 1000,
    select: { id: true, nome: true, email: true, empresa: { select: { nome: true } } },
  });
  const conta = (x: (typeof pessoas)[number]) => (x.empresa ? `${x.empresa.modulo === Modulo.EMPRESARIAL ? "Empresa" : "Individual"}: ${x.empresa.nome}` : "");
  const online = (x: (typeof pessoas)[number]) => !!x.vistoEm && Date.now() - x.vistoEm.getTime() < ONLINE_MS;

  return (
    <section className="flex-1 flex flex-col">
      <AtualizarSozinho segundos={10} />
      <Cabecalho rotulo="Principal • Atendimento" titulo="Atendimento" descricao="Conversas do suporte com os clientes, em tempo real. Imagens e PDF podem ser enviados. Histórico de 365 dias." />
      {abas}
      <div className="card p-3 mt-3"><NovoAtendimento clientes={clientes.map((c) => ({ id: c.id, rotulo: `${c.nome} • ${c.email}${c.empresa ? ` • ${c.empresa.nome}` : ""}` }))} /></div>
      <div className="grid gap-3 mt-3 lg:grid-cols-[300px_1fr]">
        <div className="card p-2 max-h-[560px] overflow-y-auto" data-testid="lista-atendimentos">
          {conversas.length === 0 && <p className="text-[12px] p-2" style={{ color: "var(--muted)" }}>Nenhuma conversa ainda.</p>}
          {conversas.map((c) => {
            const x = porId.get(c.usuarioId);
            if (!x) return null;
            return (
              <Link key={c.id} href={`/atendimento?aba=clientes&cliente=${x.id}`} className="block rounded-lg px-2 py-2 text-[12px]" data-testid="item-atendimento"
                style={{ background: x.id === p.cliente ? "var(--surface-2, rgba(0,0,0,.05))" : undefined }}>
                <div className="flex items-center justify-between gap-1">
                  <b className="truncate"><span className="inline-block w-2 h-2 rounded-full mr-1" style={{ background: online(x) ? "#16a34a" : "#9ca3af" }} />{x.nome}</b>
                  {c.naoLidasSuporte > 0 && <span className="rounded-full px-1.5 text-[11px] font-extrabold" style={{ background: "#e5484d", color: "#fff" }} data-testid="nao-lidas-atendimento">{c.naoLidasSuporte}</span>}
                </div>
                <p className="truncate" style={{ color: "var(--muted)" }}>{CARGOS[x.cargo]} • {conta(x)}</p>
                <p style={{ color: "var(--muted)" }}>{c.ultimaMensagemEm.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</p>
              </Link>
            );
          })}
        </div>
        <div className={atual ? PAINEL_CHAT : "card overflow-hidden"} data-testid="painel-chat">
          {atual ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 shrink-0" style={{ borderBottom: "1px solid var(--border)" }}>
                <div className="text-[12px]"><b className="text-[14px]" data-testid="cliente-atual">{atual.nome}</b> <span style={{ color: online(atual) ? "#16a34a" : "var(--muted)" }}>{online(atual) ? "• online" : "• offline"}</span><br /><span style={{ color: "var(--muted)" }}>{atual.email} • {CARGOS[atual.cargo]} • {conta(atual)}</span></div>
                <BotaoChamar usuarioId={atual.id} rotulo="Chamar cliente" />
              </div>
              <ChatSuporte key={atual.id} modo="suporte" usuarioId={atual.id} altura={420} preencher />
            </>
          ) : (
            <p className="text-[13px] p-6 text-center" style={{ color: "var(--muted)" }}>Escolha uma conversa à esquerda ou um cliente acima.</p>
          )}
        </div>
      </div>
    </section>
  );
}
