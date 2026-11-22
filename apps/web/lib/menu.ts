// Menu por perfil (docs/decisoes.md #17).
// Grupos na ordem: Principal, Vendas, Administrativo, Configurações, Sistema.
// Grupo sem itens para o perfil fica oculto.
export type CargoMenu = "SUPERADMIN" | "ADMIN_EMPRESA" | "USUARIO";

export type IconeMenu =
  | "dashboard" | "envio" | "usuarios" | "bot" | "pasta" | "empresa"
  | "play" | "config" | "logs" | "whatsapp" | "planos" | "pagamento";

export type ItemMenu = {
  href: string;
  label: string;
  icone: IconeMenu;
  grupo: "Principal" | "Vendas" | "Administrativo" | "Configurações" | "Sistema";
  subgrupo?: string;
  /** Etapa em que o conteúdo da tela será entregue (decisão #20). */
  etapa: number;
  /** Permissão exigida do Usuário (decisão #47). Sem permissão = sempre liberado. */
  permissao?: Permissao;
};

/** Permissões que o Admin da Empresa pode liberar para cada usuário (decisão #47). */
export const PERMISSOES = [
  { id: "leads", label: "Leads" },
  { id: "campanhas", label: "Campanhas" },
  { id: "conversas", label: "Conversas IA" },
  { id: "arquivos", label: "Arquivos" },
  { id: "empresa-ia", label: "Empresa | IA" },
] as const;
export type Permissao = (typeof PERMISSOES)[number]["id"];

export const ORDEM_GRUPOS = ["Principal", "Vendas", "Administrativo", "Configurações", "Sistema"] as const;

const USUARIO: ItemMenu[] = [
  { href: "/dashboard", label: "Dashboard", icone: "dashboard", grupo: "Principal", etapa: 3 },
  { href: "/campanhas", label: "Campanhas", icone: "envio", grupo: "Vendas", etapa: 8, permissao: "campanhas" },
  { href: "/leads", label: "Leads", icone: "usuarios", grupo: "Vendas", etapa: 7, permissao: "leads" },
  { href: "/conversas", label: "Conversas IA", icone: "bot", grupo: "Vendas", etapa: 10, permissao: "conversas" },
  { href: "/arquivos", label: "Arquivos", icone: "pasta", grupo: "Vendas", etapa: 8, permissao: "arquivos" },
  { href: "/empresa-ia", label: "Empresa | IA", icone: "empresa", grupo: "Configurações", etapa: 9, permissao: "empresa-ia" },
  { href: "/whatsapp", label: "WhatsApp", icone: "whatsapp", grupo: "Configurações", etapa: 6 },
];

const ADMIN_EMPRESA: ItemMenu[] = [
  { href: "/dashboard", label: "Dashboard", icone: "dashboard", grupo: "Principal", etapa: 3 },
  { href: "/todos-os-disparos", label: "Todos os disparos", icone: "envio", grupo: "Vendas", etapa: 8 },
  // Decisão #56: o Admin da Empresa vê e cuida dos leads de todos os usuários da empresa.
  { href: "/leads", label: "Leads", icone: "usuarios", grupo: "Vendas", etapa: 7 },
  { href: "/usuarios", label: "Usuários", icone: "usuarios", grupo: "Administrativo", etapa: 5 },
  { href: "/empresas", label: "Empresas", icone: "empresa", grupo: "Administrativo", etapa: 4 },
  { href: "/empresa-ia", label: "Empresa | IA", icone: "empresa", grupo: "Configurações", etapa: 9 },
  { href: "/configuracoes", label: "Configurações", icone: "config", grupo: "Configurações", etapa: 12 },
  { href: "/logs", label: "Logs", icone: "logs", grupo: "Sistema", etapa: 12 },
];

const SUPERADMIN: ItemMenu[] = [
  { href: "/dashboard", label: "Dashboard", icone: "dashboard", grupo: "Principal", etapa: 3 },
  // Decisão #33: pedidos de compra por PIX com confirmação manual.
  { href: "/pedidos", label: "Pedidos", icone: "pagamento", grupo: "Vendas", etapa: 4 },
  { href: "/todos-os-disparos", label: "Todos os disparos", icone: "envio", grupo: "Vendas", etapa: 8 },
  { href: "/disparos-por-usuarios", label: "Disparos por usuários", icone: "usuarios", grupo: "Vendas", etapa: 8 },
  { href: "/campanhas", label: "Campanhas", icone: "play", grupo: "Vendas", etapa: 8 },
  { href: "/leads", label: "Leads", icone: "usuarios", grupo: "Vendas", etapa: 7 },
  { href: "/arquivos", label: "Arquivos", icone: "pasta", grupo: "Vendas", etapa: 8 },
  { href: "/empresas", label: "Empresas", icone: "empresa", grupo: "Administrativo", etapa: 4 },
  { href: "/usuarios-individuais", label: "Usuários Individuais", icone: "usuarios", grupo: "Administrativo", etapa: 4 },
  { href: "/despesas-ia", label: "Despesas com IA", icone: "dashboard", grupo: "Administrativo", etapa: 9 },
  { href: "/relatorios/empresarial", label: "Relatório Empresarial", icone: "empresa", grupo: "Administrativo", subgrupo: "Relatório", etapa: 11 },
  { href: "/relatorios/individual", label: "Relatório Individual", icone: "usuarios", grupo: "Administrativo", subgrupo: "Relatório", etapa: 11 },
  { href: "/relatorios/leads-empresarial", label: "Leads Empresarial", icone: "usuarios", grupo: "Administrativo", subgrupo: "Relatório", etapa: 11 },
  { href: "/relatorios/lead-individual", label: "Lead Individual", icone: "usuarios", grupo: "Administrativo", subgrupo: "Relatório", etapa: 11 },
  // Decisão #27: Super Admin configura os planos e a forma de pagamento.
  { href: "/planos", label: "Planos", icone: "planos", grupo: "Configurações", etapa: 4 },
  { href: "/pagamento", label: "Pagamento", icone: "pagamento", grupo: "Configurações", etapa: 4 },
  // Decisão #88: dados do responsável na Política de Privacidade e nos Termos
  { href: "/dados-legais", label: "Dados legais", icone: "logs", grupo: "Configurações", etapa: 9 },
  // Decisão #51: WhatsApp da plataforma (avisos do sistema).
  { href: "/numero-plataforma", label: "Número da plataforma", icone: "whatsapp", grupo: "Configurações", etapa: 6 },
  // Decisão #62: o Super Admin também envia, pelo próprio WhatsApp.
  { href: "/whatsapp", label: "Meu WhatsApp", icone: "whatsapp", grupo: "Configurações", etapa: 6 },
  // Decisão #65: faixa global de horário, feriados e a janela do Super Admin.
  { href: "/regras-envio", label: "Regras de envio", icone: "config", grupo: "Configurações", etapa: 8 },
  // Decisões #72 e #77: IA trocável e despesas com IA
  { href: "/inteligencia-artificial", label: "Inteligência Artificial", icone: "bot", grupo: "Configurações", etapa: 9 },
];

export function menuDoCargo(cargo: CargoMenu, permissoes?: string[]): ItemMenu[] {
  const todos = cargo === "SUPERADMIN" ? SUPERADMIN : cargo === "ADMIN_EMPRESA" ? ADMIN_EMPRESA : USUARIO;
  // Usuário: só as telas liberadas pelo Admin (decisão #47).
  const itens = permissoes ? todos.filter((i) => !i.permissao || permissoes.includes(i.permissao)) : todos;
  // Ordena pelos grupos, mantendo a ordem interna de cada grupo.
  return ORDEM_GRUPOS.flatMap((g) => itens.filter((i) => i.grupo === g));
}

/** O perfil pode abrir esta rota? */
export function rotaPermitida(cargo: CargoMenu, pathname: string, permissoes?: string[]): boolean {
  return menuDoCargo(cargo, permissoes).some((i) => pathname === i.href || pathname.startsWith(i.href + "/"));
}

export function itemDaRota(cargo: CargoMenu, pathname: string, permissoes?: string[]): ItemMenu | undefined {
  return menuDoCargo(cargo, permissoes).find((i) => pathname === i.href || pathname.startsWith(i.href + "/"));
}
