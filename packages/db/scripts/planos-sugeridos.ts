// Preenche a sugestão de planos (decisão #111): todos VISÍVEIS como "Em breve" (preço R$ 0,00, sem compra) até o Super Admin colocar o preço.
// Atualiza os 7 planos da instalação (pelo slug) e cria os 5 planos "Start" (por quantidade de disparos).
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
  maxWhatsapps?: number; disparosPorPeriodo?: number | null; pacoteDisparos?: number | null;
  testeDias?: number; testeDisparos?: number; selo: string; frase: string; condicoes: string; recursos: string[];
  textoBotao: string; destaque?: boolean; ordem: number;
};

const ilimitado = "Disparos sem limite no período";
const sugestao: Sugestao[] = [
  // ===== Aba "Sem limite de disparos" (Free e Personalizado aparecem nas duas abas) =====
  { slug: "free", nome: "Free", modulo: Modulo.INDIVIDUAL, usuarios: 1, gratis: true, limiteLeads: 100, limiteMateriais: 3, limitePaginasMes: 20, leadsAnuncios: false,
    testeDias: 7, testeDisparos: 20, selo: "Teste grátis", frase: "Conheça o FilaPro Leads sem pagar nada.", condicoes: "7 dias ou 20 disparos, o que acabar primeiro. Sem cartão.",
    recursos: ["1 usuário e 1 WhatsApp", "Até 100 leads", ...BASE.slice(0, 3)], textoBotao: "Testar grátis", ordem: 0 },
  { slug: "individual", nome: "Individual", modulo: Modulo.INDIVIDUAL, usuarios: 1, limiteLeads: 10000, limiteMateriais: 20, limitePaginasMes: 200, leadsAnuncios: true, maxWhatsapps: 3,
    selo: "Mais escolhido", frase: "Para quem vende sozinho e quer enviar sem limite.", condicoes: "Pagamento por PIX. Renove quando quiser.",
    recursos: [ilimitado, "1 usuário", "Até 3 WhatsApps (extra pago à parte)", "Até 10.000 leads", TREINO, ANUNCIOS, ...BASE], textoBotao: "Escolher plano", ordem: 1 },
  { slug: "basico", nome: "Básico", modulo: Modulo.EMPRESARIAL, usuarios: 3, limiteLeads: 15000, limiteMateriais: 20, limitePaginasMes: 200, leadsAnuncios: false,
    selo: "", frase: "Para pequenas equipes começarem a prospectar.", condicoes: "Pagamento por PIX. O Admin da Empresa não conta como usuário.",
    recursos: [ilimitado, "3 usuários + Admin da Empresa", "Até 15.000 leads", TREINO, ...BASE], textoBotao: "Escolher plano", ordem: 2 },
  { slug: "padrao", nome: "Padrão", modulo: Modulo.EMPRESARIAL, usuarios: 10, limiteLeads: 50000, limiteMateriais: 40, limitePaginasMes: 500, leadsAnuncios: true,
    selo: "Mais vendido", frase: "Para equipes de vendas em crescimento.", condicoes: "Pagamento por PIX. O Admin da Empresa não conta como usuário.",
    recursos: [ilimitado, "10 usuários + Admin da Empresa", "Até 50.000 leads", TREINO, ANUNCIOS, ...BASE], textoBotao: "Escolher plano", destaque: true, ordem: 3 },
  { slug: "premium", nome: "Premium", modulo: Modulo.EMPRESARIAL, usuarios: 30, limiteLeads: 150000, limiteMateriais: 80, limitePaginasMes: 1000, leadsAnuncios: true,
    selo: "", frase: "Para operações com várias equipes.", condicoes: "Pagamento por PIX. O Admin da Empresa não conta como usuário.",
    recursos: [ilimitado, "30 usuários + Admin da Empresa", "Até 150.000 leads", TREINO, ANUNCIOS, ...BASE], textoBotao: "Escolher plano", ordem: 4 },
  { slug: "elite", nome: "Elite", modulo: Modulo.EMPRESARIAL, usuarios: 50, limiteLeads: null, limiteMateriais: null, limitePaginasMes: null, leadsAnuncios: true,
    selo: "Completo", frase: "Tudo liberado para grandes operações.", condicoes: "Pagamento por PIX. O Admin da Empresa não conta como usuário.",
    recursos: [ilimitado, "50 usuários + Admin da Empresa", "Leads ilimitados", "IA sem limite de treino", ANUNCIOS, ...BASE], textoBotao: "Escolher plano", ordem: 5 },
  { slug: "personalizado", nome: "Personalizado", modulo: Modulo.EMPRESARIAL, usuarios: null, personalizado: true, limiteLeads: null, limiteMateriais: null, limitePaginasMes: null, leadsAnuncios: true,
    selo: "Sob medida", frase: "Montamos o plano do tamanho da sua operação.", condicoes: "Fale com a gente para receber a proposta.",
    recursos: ["Usuários e disparos sob medida", ANUNCIOS, ...BASE], textoBotao: "Falar com a gente", ordem: 99 },
  // ===== Aba "Por quantidade de disparos" =====
  { slug: "individual-start", nome: "Individual Start", modulo: Modulo.INDIVIDUAL, usuarios: 1, limiteLeads: 10000, limiteMateriais: 20, limitePaginasMes: 200, leadsAnuncios: true, maxWhatsapps: 3,
    disparosPorPeriodo: 1000, pacoteDisparos: 500, selo: "", frase: "Para quem envia pouco e quer pagar menos.", condicoes: "Acabou o saldo? Compre um pacote extra ou espere renovar.",
    recursos: ["1.000 disparos por mês", "Pacote extra de 500 disparos", "1 usuário", "Até 3 WhatsApps (extra pago à parte)", "Até 10.000 leads", TREINO, ANUNCIOS, ...BASE], textoBotao: "Escolher plano", ordem: 10 },
  { slug: "basico-start", nome: "Básico Start", modulo: Modulo.EMPRESARIAL, usuarios: 3, limiteLeads: 15000, limiteMateriais: 20, limitePaginasMes: 200, leadsAnuncios: false,
    disparosPorPeriodo: 5000, pacoteDisparos: 1000, selo: "", frase: "Equipe pequena, volume sob controle.", condicoes: "Saldo da empresa (todos os usuários usam o mesmo). Zera na renovação.",
    recursos: ["5.000 disparos por mês", "Pacote extra de 1.000 disparos", "3 usuários + Admin da Empresa", "Até 15.000 leads", TREINO, ...BASE], textoBotao: "Escolher plano", ordem: 11 },
  { slug: "padrao-start", nome: "Padrão Start", modulo: Modulo.EMPRESARIAL, usuarios: 10, limiteLeads: 50000, limiteMateriais: 40, limitePaginasMes: 500, leadsAnuncios: true,
    disparosPorPeriodo: 15000, pacoteDisparos: 2000, selo: "Mais vendido", frase: "O volume certo para equipes de vendas.", condicoes: "Saldo da empresa (todos os usuários usam o mesmo). Zera na renovação.",
    recursos: ["15.000 disparos por mês", "Pacote extra de 2.000 disparos", "10 usuários + Admin da Empresa", "Até 50.000 leads", TREINO, ANUNCIOS, ...BASE], textoBotao: "Escolher plano", destaque: true, ordem: 12 },
  { slug: "premium-start", nome: "Premium Start", modulo: Modulo.EMPRESARIAL, usuarios: 30, limiteLeads: 150000, limiteMateriais: 80, limitePaginasMes: 1000, leadsAnuncios: true,
    disparosPorPeriodo: 40000, pacoteDisparos: 5000, selo: "", frase: "Alto volume com custo previsível.", condicoes: "Saldo da empresa (todos os usuários usam o mesmo). Zera na renovação.",
    recursos: ["40.000 disparos por mês", "Pacote extra de 5.000 disparos", "30 usuários + Admin da Empresa", "Até 150.000 leads", TREINO, ANUNCIOS, ...BASE], textoBotao: "Escolher plano", ordem: 13 },
  { slug: "elite-start", nome: "Elite Start", modulo: Modulo.EMPRESARIAL, usuarios: 50, limiteLeads: null, limiteMateriais: null, limitePaginasMes: null, leadsAnuncios: true,
    disparosPorPeriodo: 80000, pacoteDisparos: 10000, selo: "Completo", frase: "Grande volume com tudo liberado.", condicoes: "Saldo da empresa (todos os usuários usam o mesmo). Zera na renovação.",
    recursos: ["80.000 disparos por mês", "Pacote extra de 10.000 disparos", "50 usuários + Admin da Empresa", "Leads ilimitados", "IA sem limite de treino", ANUNCIOS, ...BASE], textoBotao: "Escolher plano", ordem: 14 },
];

async function main() {
  for (const s of sugestao) {
    const pago = !s.gratis && !s.personalizado;
    const dados = {
      nome: s.nome, modulo: s.modulo, usuarios: s.usuarios, gratis: !!s.gratis, personalizado: !!s.personalizado,
      // Preços zerados (o Super Admin ajusta); Free = grátis; Personalizado = sob consulta
      precoAtual: pago ? 0 : null, precoAntigo: null, periodo: "mês", prazoDias: s.gratis ? 7 : 31,
      testeDias: s.gratis ? s.testeDias ?? 7 : null, testeDisparos: s.gratis ? s.testeDisparos ?? 20 : null,
      limiteLeads: s.limiteLeads, limiteMateriais: s.limiteMateriais, limitePaginasMes: s.limitePaginasMes, leadsAnuncios: s.leadsAnuncios,
      maxWhatsapps: s.maxWhatsapps ?? 1, precoWhatsappExtra: (s.maxWhatsapps ?? 1) > 1 ? 0 : null,
      disparosPorPeriodo: s.disparosPorPeriodo ?? null, pacoteDisparos: s.pacoteDisparos ?? null, precoPacoteDisparos: s.pacoteDisparos ? 0 : null,
      selo: s.selo, frase: s.frase, condicoes: s.condicoes, ofertaTexto: "", recursos: s.recursos, textoBotao: s.textoBotao,
      visivel: true, destaque: !!s.destaque, ordem: s.ordem,
    };
    const existe = await prisma.plano.findUnique({ where: { slug: s.slug } });
    if (existe) await prisma.plano.update({ where: { slug: s.slug }, data: dados });
    else await prisma.plano.create({ data: { slug: s.slug, ...dados } });
    console.log(`${existe ? "atualizado" : "criado    "}  ${s.nome.padEnd(18)} ${s.disparosPorPeriodo ? `por quantidade (${s.disparosPorPeriodo}/mês)` : s.gratis || s.personalizado ? "as duas abas" : "sem limite"}  — ${pago ? "Em breve" : "disponível"}`);
  }
  console.log("\nPronto: 12 planos preenchidos e visíveis. Os pagos aparecem como “Em breve” (sem compra) até ter preço.");
  console.log("Coloque os preços em Super Admin → Planos → Editar: o plano passa a vender na hora.");
}

main().finally(() => prisma.$disconnect());
