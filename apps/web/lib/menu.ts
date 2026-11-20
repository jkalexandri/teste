// Menu por perfil (docs/decisoes.md #17).
// Grupos na ordem: Principal, Vendas, Administrativo, Configurações, Sistema.
// Grupo sem itens para o perfil fica oculto.
export type CargoMenu = "SUPERADMIN" | "ADMIN_EMPRESA" | "USUARIO";

export type IconeMenu =
  | "dashboard" | "envio" | "usuarios" | "bot" | "pasta" | "empresa"
  | "play" | "config" | "logs" | "whatsapp";

export type ItemMenu = {
  href: string;
  label: string;
  icone: IconeMenu;
  grupo: "Principal" | "Vendas" | "Administrativo" | "Configurações" | "Sistema";
  subgrupo?: string;
  /** Etapa em que o conteúdo da tela será entregue (decisão #20). */
  etapa: number;
};

export const ORDEM_GRUPOS = ["Principal", "Vendas", "Administrativo", "Configurações", "Sistema"] as const;

const USUARIO: ItemMenu[] = [
  { href: "/dashboard", label: "Dashboard", icone: "dashboard", grupo: "Principal", etapa: 3 },
  { href: "/campanhas", label: "Campanhas", icone: "envio", grupo: "Vendas", etapa: 8 },
  { href: "/leads", label: "Leads", icone: "usuarios", grupo: "Vendas", etapa: 7 },
  { href: "/conversas", label: "Conversas IA", icone: "bot", grupo: "Vendas", etapa: 10 },
  { href: "/arquivos", label: "Arquivos", icone: "pasta", grupo: "Vendas", etapa: 8 },
  { href: "/empresa-ia", label: "Empresa | IA", icone: "empresa", grupo: "Configurações", etapa: 9 },
  { href: "/whatsapp", label: "WhatsApp", icone: "whatsapp", grupo: "Configurações", etapa: 6 },
];

const ADMIN_EMPRESA: ItemMenu[] = [
  { href: "/dashboard", label: "Dashboard", icone: "dashboard", grupo: "Principal", etapa: 3 },
  { href: "/todos-os-disparos", label: "Todos os disparos", icone: "envio", grupo: "Vendas", etapa: 8 },
  { href: "/usuarios", label: "Usuários", icone: "usuarios", grupo: "Administrativo", etapa: 5 },
  { href: "/empresas", label: "Empresas", icone: "empresa", grupo: "Administrativo", etapa: 4 },
  { href: "/empresa-ia", label: "Empresa | IA", icone: "empresa", grupo: "Configurações", etapa: 9 },
  { href: "/configuracoes", label: "Configurações", icone: "config", grupo: "Configurações", etapa: 12 },
  { href: "/logs", label: "Logs", icone: "logs", grupo: "Sistema", etapa: 12 },
];

const SUPERADMIN: ItemMenu[] = [
  { href: "/dashboard", label: "Dashboard", icone: "dashboard", grupo: "Principal", etapa: 3 },
  { href: "/todos-os-disparos", label: "Todos os disparos", icone: "envio", grupo: "Vendas", etapa: 8 },
  { href: "/disparos-por-usuarios", label: "Disparos por usuários", icone: "usuarios", grupo: "Vendas", etapa: 8 },
  { href: "/campanhas", label: "Campanhas", icone: "play", grupo: "Vendas", etapa: 8 },
  { href: "/leads", label: "Leads", icone: "usuarios", grupo: "Vendas", etapa: 7 },
  { href: "/empresas", label: "Empresas", icone: "empresa", grupo: "Administrativo", etapa: 4 },
  { href: "/usuarios-individuais", label: "Usuários Individuais", icone: "usuarios", grupo: "Administrativo", etapa: 4 },
  { href: "/relatorios/empresarial", label: "Relatório Empresarial", icone: "empresa", grupo: "Administrativo", subgrupo: "Relatório", etapa: 11 },
  { href: "/relatorios/individual", label: "Relatório Individual", icone: "usuarios", grupo: "Administrativo", subgrupo: "Relatório", etapa: 11 },
  { href: "/relatorios/leads-empresarial", label: "Leads Empresarial", icone: "usuarios", grupo: "Administrativo", subgrupo: "Relatório", etapa: 11 },
  { href: "/relatorios/lead-individual", label: "Lead Individual", icone: "usuarios", grupo: "Administrativo", subgrupo: "Relatório", etapa: 11 },
];

export function menuDoCargo(cargo: CargoMenu): ItemMenu[] {
  const itens = cargo === "SUPERADMIN" ? SUPERADMIN : cargo === "ADMIN_EMPRESA" ? ADMIN_EMPRESA : USUARIO;
  // Ordena pelos grupos, mantendo a ordem interna de cada grupo.
  return ORDEM_GRUPOS.flatMap((g) => itens.filter((i) => i.grupo === g));
}

/** O perfil pode abrir esta rota? */
export function rotaPermitida(cargo: CargoMenu, pathname: string): boolean {
  return menuDoCargo(cargo).some((i) => pathname === i.href || pathname.startsWith(i.href + "/"));
}

export function itemDaRota(cargo: CargoMenu, pathname: string): ItemMenu | undefined {
  return menuDoCargo(cargo).find((i) => pathname === i.href || pathname.startsWith(i.href + "/"));
}
