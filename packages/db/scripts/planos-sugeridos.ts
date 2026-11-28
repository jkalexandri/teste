// Preenche a sugestão de planos (decisão #111): todos VISÍVEIS como "Em breve" (preço R$ 0,00, sem compra) até o Super Admin colocar o preço.
// Atualiza os planos da instalação (pelo slug), cria os 5 planos "Start" (por disparo) e remove o Personalizado (decisão #113).
// Não mexe em contas, pedidos nem em outros planos criados pelo Super Admin. Pode rodar de novo (sobrescreve a sugestão).
// Uso (na VPS): cd /opt/filapro/app && set -a && . apps/web/.env.production && set +a && pnpm --filter @filapro/db planos:sugeridos
import { PrismaClient, Modulo } from "@prisma/client";

const prisma = new PrismaClient();

const BASE = ["Antibloqueio inteligente", "IA que atende, qualifica e trata objeções", "Conversas IA no estilo WhatsApp Web", "Relatórios em Excel e PDF", "App no celular com avisos", "Suporte pelo chat"];
const ANUNCIOS = "Leads do Google e Facebook entram sozinhos";
const TREINO = "IA treinada com o seu site e materiais";

type Sugestao = {
  slug: string; nome: string; modulo: Modulo; usuarios: number | null; gratis?: boolean; personalizado?: boolean;
  limiteLeads: number | null; limiteMateriais: number | null; limitePaginasMes: number | null; leadsAnuncios: boolean;
  maxWhatsapps?: number; maxPacotes?: number; disparosPorPeriodo?: number | null; pacoteDisparos?: number | null;
  testeDias?: number; testeDisparos?: number | null; selo: string; frase: string; condicoes: string; recursos: string[];
  textoBotao: string; destaque?: boolean; ordem: number;
};

const ilimitado = "Disparos sem limite no período";
const sugestao: Sugestao[] = [
  // ===== Aba "Sem limite de disparos" (Free e Personalizado aparecem nas duas abas) =====
  // Dois testes grátis (decisão #113, item C): por dias (Mensal) e por disparos (Por disparo). Um teste por e-mail.
  { slug: "free", nome: "Free", modulo: Modulo.INDIVIDUAL, usuarios: 1, gratis: true, limiteLeads: 100, limiteMateriais: 3, limitePaginasMes: 20, leadsAnuncios: false,
    testeDias: 7, testeDisparos: null, selo: "Teste grátis", frase: "Use à vontade por 7 dias, sem pagar nada.", condicoes: "7 dias, até 100 leads. Sem cartão.",
    recursos: ["1 usuário e 1 WhatsApp", "Disparos sem limite por 7 dias", "Até 100 leads", ...BASE.slice(0, 3)], textoBotao: "Testar grátis", ordem: 0 },
  { slug: "free-disparos", nome: "Free", modulo: Modulo.INDIVIDUAL, usuarios: 1, gratis: true, limiteLeads: 100, limiteMateriais: 3, limitePaginasMes: 20, leadsAnuncios: false,
    testeDias: 30, testeDisparos: 50, selo: "Teste grátis", frase: "Teste com 50 disparos, sem pagar nada.", condicoes: "50 disparos em até 30 dias, até 100 leads. Sem cartão.",
    recursos: ["1 usuário e 1 WhatsApp", "50 disparos grátis", "Até 100 leads", ...BASE.slice(0, 3)], textoBotao: "Testar grátis", ordem: 9 },
  { slug: "individual", nome: "Individual", modulo: Modulo.INDIVIDUAL, usuarios: 1, limiteLeads: 10000, limiteMateriais: 20, limitePaginasMes: 200, leadsAnuncios: true, maxWhatsapps: 4,
    selo: "Mais escolhido", frase: "Para quem vende sozinho e quer enviar sem limite.", condicoes: "Pagamento por PIX. Renove quando quiser.",
    recursos: [ilimitado, "1 usuário", "Até 4 números de WhatsApp (com desconto a partir do 2º)", "Até 10.000 leads", TREINO, ANUNCIOS, ...BASE], textoBotao: "Escolher plano", ordem: 1 },
  { slug: "basico", nome: "Básico", modulo: Modulo.EMPRESARIAL, usuarios: 3, limiteLeads: 15000, limiteMateriais: 20, limitePaginasMes: 200, leadsAnuncios: false,
    selo: "", frase: "Para pequenas equipes começarem a prospectar.", condicoes: "Pagamento por PIX. O Admin da Empresa não conta como usuário.",
    recursos: [ilimitado, "3 usuários + Admin da Empresa", "Até 15.000 leads", TREINO, ...BASE], textoBotao: "Escolher plano", ordem: 2 },
  { slug: "padrao", nome: "Padrão", modulo: Modulo.EMPRESARIAL, usuarios: 10, limiteLeads: 50000, limiteMateriais: 40, limitePaginasMes: 500, maxPacotes: 5, leadsAnuncios: true,
    selo: "Mais vendido", frase: "Para equipes de vendas em crescimento.", condicoes: "Pagamento por PIX. O Admin da Empresa não conta como usuário.",
    recursos: [ilimitado, "10 usuários + Admin (até 50, de 10 em 10)", "Até 50.000 leads a cada 10 usuários", TREINO, ANUNCIOS, ...BASE], textoBotao: "Escolher plano", destaque: true, ordem: 3 },
  { slug: "premium", nome: "Premium", modulo: Modulo.EMPRESARIAL, usuarios: 30, limiteLeads: 150000, limiteMateriais: 80, limitePaginasMes: 1000, maxPacotes: 5, leadsAnuncios: true,
    selo: "", frase: "Para operações com várias equipes.", condicoes: "Pagamento por PIX. O Admin da Empresa não conta como usuário.",
    recursos: [ilimitado, "30 usuários + Admin (até 150, de 30 em 30)", "Até 150.000 leads a cada 30 usuários", TREINO, ANUNCIOS, ...BASE], textoBotao: "Escolher plano", ordem: 4 },
  { slug: "elite", nome: "Elite", modulo: Modulo.EMPRESARIAL, usuarios: 50, limiteLeads: null, limiteMateriais: null, limitePaginasMes: null, maxPacotes: 5, leadsAnuncios: true,
    selo: "Completo", frase: "Tudo liberado para grandes operações.", condicoes: "Pagamento por PIX. O Admin da Empresa não conta como usuário.",
    recursos: [ilimitado, "50 usuários + Admin (até 250, de 50 em 50)", "Leads ilimitados", "IA sem limite de treino", ANUNCIOS, ...BASE], textoBotao: "Escolher plano", ordem: 5 },
  // ===== Aba "Por quantidade de disparos" =====
  { slug: "individual-start", nome: "Individual Start", modulo: Modulo.INDIVIDUAL, usuarios: 1, limiteLeads: 10000, limiteMateriais: 20, limitePaginasMes: 200, leadsAnuncios: true, maxWhatsapps: 4,
    disparosPorPeriodo: 1000, pacoteDisparos: 500, selo: "", frase: "Para quem envia pouco e quer pagar menos.", condicoes: "Acabou o saldo? Compre um pacote extra ou espere renovar.",
    recursos: ["1.000 disparos por mês", "Pacote extra de 500 disparos", "1 usuário", "Até 4 números de WhatsApp (com desconto a partir do 2º)", "Até 10.000 leads", TREINO, ANUNCIOS, ...BASE], textoBotao: "Escolher plano", ordem: 10 },
  { slug: "basico-start", nome: "Básico Start", modulo: Modulo.EMPRESARIAL, usuarios: 3, limiteLeads: 15000, limiteMateriais: 20, limitePaginasMes: 200, leadsAnuncios: false,
    disparosPorPeriodo: 5000, pacoteDisparos: 1000, selo: "", frase: "Equipe pequena, volume sob controle.", condicoes: "Saldo da empresa (todos os usuários usam o mesmo). Zera na renovação.",
    recursos: ["5.000 disparos por mês", "Pacote extra de 1.000 disparos", "3 usuários + Admin da Empresa", "Até 15.000 leads", TREINO, ...BASE], textoBotao: "Escolher plano", ordem: 11 },
  { slug: "padrao-start", nome: "Padrão Start", modulo: Modulo.EMPRESARIAL, usuarios: 10, limiteLeads: 50000, limiteMateriais: 40, limitePaginasMes: 500, maxPacotes: 5, leadsAnuncios: true,
    disparosPorPeriodo: 15000, pacoteDisparos: 2000, selo: "Mais vendido", frase: "O volume certo para equipes de vendas.", condicoes: "Saldo da empresa (todos os usuários usam o mesmo). Zera na renovação.",
    recursos: ["15.000 disparos por mês a cada 10 usuários", "Pacote extra de 2.000 disparos", "10 usuários + Admin (até 50, de 10 em 10)", "Até 50.000 leads a cada 10 usuários", TREINO, ANUNCIOS, ...BASE], textoBotao: "Escolher plano", destaque: true, ordem: 12 },
  { slug: "premium-start", nome: "Premium Start", modulo: Modulo.EMPRESARIAL, usuarios: 30, limiteLeads: 150000, limiteMateriais: 80, limitePaginasMes: 1000, maxPacotes: 5, leadsAnuncios: true,
    disparosPorPeriodo: 40000, pacoteDisparos: 5000, selo: "", frase: "Alto volume com custo previsível.", condicoes: "Saldo da empresa (todos os usuários usam o mesmo). Zera na renovação.",
    recursos: ["40.000 disparos por mês a cada 30 usuários", "Pacote extra de 5.000 disparos", "30 usuários + Admin (até 150, de 30 em 30)", "Até 150.000 leads a cada 30 usuários", TREINO, ANUNCIOS, ...BASE], textoBotao: "Escolher plano", ordem: 13 },
  { slug: "elite-start", nome: "Elite Start", modulo: Modulo.EMPRESARIAL, usuarios: 50, limiteLeads: null, limiteMateriais: null, limitePaginasMes: null, maxPacotes: 5, leadsAnuncios: true,
    disparosPorPeriodo: 80000, pacoteDisparos: 10000, selo: "Completo", frase: "Grande volume com tudo liberado.", condicoes: "Saldo da empresa (todos os usuários usam o mesmo). Zera na renovação.",
    recursos: ["80.000 disparos por mês a cada 50 usuários", "Pacote extra de 10.000 disparos", "50 usuários + Admin (até 250, de 50 em 50)", "Leads ilimitados", "IA sem limite de treino", ANUNCIOS, ...BASE], textoBotao: "Escolher plano", ordem: 14 },
];

async function main() {
  for (const s of sugestao) {
    const pago = !s.gratis && !s.personalizado;
    const dados = {
      nome: s.nome, modulo: s.modulo, categoria: s.modulo === Modulo.EMPRESARIAL ? "BUSINESS" as const : "INDIVIDUAL" as const, usuarios: s.usuarios, gratis: !!s.gratis, personalizado: !!s.personalizado,
      // Preços zerados (o Super Admin ajusta); Free = grátis; Personalizado = sob consulta
      precoAtual: pago ? 0 : null, precoAntigo: null, periodo: "mês", prazoDias: s.gratis ? 7 : 31,
      testeDias: s.gratis ? s.testeDias ?? 7 : null, testeDisparos: s.gratis ? s.testeDisparos ?? null : null,
      limiteLeads: s.limiteLeads, limiteMateriais: s.limiteMateriais, limitePaginasMes: s.limitePaginasMes, leadsAnuncios: s.leadsAnuncios,
      // Preço por quantidade (decisão #113): números (Individual) ou pacotes de usuários (Empresarial), com desconto por posição
      maxWhatsapps: s.maxWhatsapps ?? 1, precoWhatsappExtra: null, maxPacotes: s.maxPacotes ?? 1, descontos: [10, 15, 20, 25],
      disparosPorPeriodo: s.disparosPorPeriodo ?? null, pacoteDisparos: s.pacoteDisparos ?? null, precoPacoteDisparos: s.pacoteDisparos ? 0 : null,
      selo: s.selo, frase: s.frase, condicoes: s.condicoes, ofertaTexto: "", recursos: s.recursos, textoBotao: s.textoBotao,
      visivel: true, destaque: !!s.destaque, ordem: s.ordem,
    };
    const existe = await prisma.plano.findUnique({ where: { slug: s.slug } });
    if (existe) await prisma.plano.update({ where: { slug: s.slug }, data: dados });
    else await prisma.plano.create({ data: { slug: s.slug, ...dados } });
    console.log(`${existe ? "atualizado" : "criado    "}  ${s.nome.padEnd(18)} ${s.disparosPorPeriodo || s.testeDisparos ? `Por disparo (${(s.disparosPorPeriodo ?? s.testeDisparos)!.toLocaleString("pt-BR")}${s.gratis ? " no teste" : "/mês"})` : "Mensal"}  — ${pago ? "Em breve" : "disponível"}`);
  }
  // Personalizado removido (decisão #113): apaga se ninguém usou; senão, só oculta
  const pers = await prisma.plano.findUnique({ where: { slug: "personalizado" } });
  if (pers) {
    const usado = (await prisma.pedido.count({ where: { planoId: pers.id } })) + (await prisma.empresa.count({ where: { planoId: pers.id } }));
    if (usado) await prisma.plano.update({ where: { id: pers.id }, data: { visivel: false } });
    else await prisma.plano.delete({ where: { id: pers.id } });
    console.log(`removido   Personalizado      ${usado ? "(oculto: já tem pedidos ou contas)" : "(apagado)"}`);
  }
  console.log("\nPronto: 12 planos preenchidos e visíveis. Os pagos aparecem como “Em breve” (sem compra) até ter preço.");
  console.log("Coloque os preços em Super Admin → Planos → Editar: o plano passa a vender na hora.");
}

main().finally(() => prisma.$disconnect());
