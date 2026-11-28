// Campanhas (etapa 8a — prompt seção 8). Abas: Nova, Em andamento, Pausada, Rascunho, Concluída, Cancelada.
// A aba Nova não mostra quantidade. Super Admin também envia (decisão #62): aqui vê as próprias campanhas.
import { redirect } from "next/navigation";
import { prisma, Cargo, Modulo, StatusCampanha, StatusWhatsapp, minParaHora } from "@filapro/db";
import { obterSessao } from "@/lib/auth/session";
import { disparosRestantes, janelaDe, numerosParaCampanha } from "@/lib/campanhas";
import BotaoUpgrade from "./BotaoUpgrade";
import NovaCampanha, { type Rascunho } from "./NovaCampanha";
import ListaCampanhas, { type CampanhaLinha } from "./ListaCampanhas";
import AbasCampanhas from "./AbasCampanhas";
import { protegerTela } from "@/lib/auth/tela";

export const dynamic = "force-dynamic";

const ABAS = ["nova", "em-andamento", "pausada", "rascunho", "concluida", "cancelada"] as const;
type Aba = (typeof ABAS)[number];
const STATUS_DA_ABA: Record<Exclude<Aba, "nova">, StatusCampanha[]> = {
  "em-andamento": [StatusCampanha.EM_ANDAMENTO, StatusCampanha.AGENDADA],
  pausada: [StatusCampanha.PAUSADA],
  rascunho: [StatusCampanha.RASCUNHO],
  concluida: [StatusCampanha.CONCLUIDA],
  cancelada: [StatusCampanha.CANCELADA],
};

export default async function CampanhasPage({ searchParams }: { searchParams: Promise<{ aba?: string; editar?: string }> }) {
  await protegerTela(); // trava da tela antes de qualquer dado (decisão #130)
  const s = await obterSessao();
  if (!s) redirect("/login");
  const u = s.usuario;
  if (u.cargo === Cargo.ADMIN_EMPRESA) redirect("/dashboard"); // Admin da Empresa não envia
  // Plano só de Redes Sociais: sem disparos (decisão #185) — a tela explica e leva ao upgrade
  if (u.cargo === Cargo.USUARIO && u.empresa && !u.empresa.permiteDisparos) {
    return (
      <div className="card p-5 max-w-[640px]" data-testid="sem-disparos">
        <h1 className="font-display font-extrabold text-[18px]">Campanhas não incluídas no seu plano</h1>
        <p className="help mt-1">O seu plano é <b>Redes Sociais</b>: recebe e qualifica os leads das redes, mas não dispara campanhas. Para disparar, faça o upgrade para <b>Redes Sociais + Disparos</b>.</p>
        {u.empresa.modulo === Modulo.INDIVIDUAL ? <BotaoUpgrade /> : <p className="help mt-2">Peça ao Admin da Empresa para fazer o upgrade.</p>}
      </div>
    );
  }
  const f = await searchParams;
  const aba: Aba = (ABAS as readonly string[]).includes(f.aba ?? "") ? (f.aba as Aba) : "nova";

  // Contagem por aba (a aba Nova não mostra quantidade)
  const grupos = await prisma.campanha.groupBy({ by: ["status"], where: { usuarioId: u.id }, _count: { _all: true } });
  const qtd = (st: StatusCampanha[]) => grupos.filter((g) => st.includes(g.status)).reduce((a, g) => a + g._count._all, 0);
  const contagens = Object.fromEntries(Object.entries(STATUS_DA_ABA).map(([k, v]) => [k, qtd(v)]));

  if (aba !== "nova") {
    const campanhas = await prisma.campanha.findMany({ where: { usuarioId: u.id, status: { in: STATUS_DA_ABA[aba] } }, orderBy: { atualizadoEm: "desc" }, take: 200 });
    const env = await prisma.envio.groupBy({ by: ["campanhaId", "status"], where: { campanhaId: { in: campanhas.map((c) => c.id) } }, _count: { _all: true } });
    const conta = (id: string, st: string) => env.find((e) => e.campanhaId === id && e.status === st)?._count._all ?? 0;
    const linhas: CampanhaLinha[] = campanhas.map((c) => ({
      id: c.id, assunto: c.assunto || "(sem assunto)", status: c.status, modo: c.modo, bloqueio24h: c.bloqueio24h, mensagem: c.mensagem,
      total: c.totalLeads, enviados: conta(c.id, "ENVIADO"), fila: conta(c.id, "PENDENTE"), falhas: conta(c.id, "FALHOU") + conta(c.id, "PULADO"),
      criadoEm: c.criadoEm.toISOString(), agendadaPara: c.agendadaPara?.toISOString() ?? null, motivo: c.motivo,
    }));
    return (
      <section className="flex-1 flex flex-col">
        <AbasCampanhas aba={aba} contagens={contagens} />
        <ListaCampanhas aba={aba} campanhas={linhas} />
      </section>
    );
  }

  // ===== Aba Nova =====
  let rascunho: Rascunho | null = null;
  if (f.editar) {
    const c = await prisma.campanha.findUnique({ where: { id: f.editar }, include: { arquivo: true } });
    if (c && c.usuarioId === u.id && c.status === StatusCampanha.RASCUNHO) {
      rascunho = {
        id: c.id, assunto: c.assunto, referencia: c.referencia, mensagem: c.mensagem, variacoes: c.variacoes, modo: c.modo, bloqueio24h: c.bloqueio24h,
        descadastro: c.descadastro, textoDescadastro: c.textoDescadastro, incluirDataHora: c.incluirDataHora, eliminarDuplicados: c.eliminarDuplicados,
        randomizar: c.randomizar, selecaoTodos: c.selecaoTodos, selecaoStatus: c.selecaoStatus, leadsEscolhidos: c.leadsEscolhidos, manterQuemSaiu: c.manterQuemSaiu,
        arquivoId: c.arquivoId, sessoes: c.sessoes, arquivo: c.arquivo ? { id: c.arquivo.id, nome: c.arquivo.nome, tipo: c.arquivo.tipo, tamanho: c.arquivo.tamanho } : null,
      };
    }
  }
  const [numeros, totalLeads, arquivos, { janela, global }, restantes] = await Promise.all([
    numerosParaCampanha(u.id),
    prisma.lead.count({ where: { usuarioId: u.id, ativo: true } }),
    prisma.arquivo.findMany({ where: { usuarioId: u.id }, orderBy: { criadoEm: "desc" }, take: 50 }),
    janelaDe(u),
    disparosRestantes(u.empresa),
  ]);
  const inicio = Math.max(janela.inicio, global.horaMinima), fim = Math.min(janela.fim, global.horaMaxima);

  return (
    <section className="flex-1 flex flex-col">
      <AbasCampanhas aba="nova" contagens={contagens} />
      <NovaCampanha
        key={rascunho?.id ?? "nova"}
        rascunho={rascunho}
        whatsappConectado={numeros.some((n) => n.conectado)}
        numeros={numeros}
        totalLeadsAtivos={totalLeads}
        arquivos={arquivos.map((a) => ({ id: a.id, nome: a.nome, tipo: a.tipo, tamanho: a.tamanho }))}
        janela={{
          texto: `Segunda a sábado, das ${minParaHora(inicio)} às ${minParaHora(fim)} (sem feriados)`,
          inicio: minParaHora(janela.inicio),
          fim: minParaHora(janela.fim),
          faixa: `${minParaHora(global.horaMinima)} às ${minParaHora(global.horaMaxima)}`,
          // Individual ajusta a própria janela; usuário de empresa vê a do Admin; Super Admin ajusta em "Regras de envio".
          podeAlterar: u.cargo === Cargo.USUARIO && u.empresa?.modulo === Modulo.INDIVIDUAL,
        }}
        restantesTeste={restantes}
      />
    </section>
  );
}
