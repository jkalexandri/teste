"use client";

// Layout do app depois do login — segue a prévia:
// barra lateral fixa (logo fixa + perfil + menu por grupos), topo fixo,
// menu em "pílulas" no celular e aviso de expiração.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment, type ReactNode } from "react";
import {
  Bot, Building2, ChartColumn, ChevronRight, Clock3, FolderOpen, MessageCircle,
  Moon, Play, Repeat, ScrollText, Send, Settings, ShieldCheck, Sun, Tag, TriangleAlert, Users, Wallet,
} from "@/components/icons";
import { useTheme } from "@/lib/theme";
import type { CargoMenu, IconeMenu, ItemMenu } from "@/lib/menu";
import AvisoExpiracao from "./AvisoExpiracao";
import { ToastProvider } from "./Toast";

const ICONES: Record<IconeMenu, (p: { size?: number }) => ReactNode> = {
  dashboard: (p) => <ChartColumn {...p} />,
  envio: (p) => <Send {...p} />,
  usuarios: (p) => <Users {...p} />,
  bot: (p) => <Bot {...p} />,
  pasta: (p) => <FolderOpen {...p} />,
  empresa: (p) => <Building2 {...p} />,
  play: (p) => <Play {...p} />,
  config: (p) => <Settings {...p} />,
  logs: (p) => <ScrollText {...p} />,
  whatsapp: (p) => <MessageCircle {...p} />,
  planos: (p) => <Tag {...p} />,
  pagamento: (p) => <Wallet {...p} />,
};

const PERFIL: Record<CargoMenu, string> = {
  SUPERADMIN: "Perfil: Super Admin",
  ADMIN_EMPRESA: "Perfil: Administrador",
  USUARIO: "Perfil: Usuário",
};

export type DadosShell = {
  nome: string;
  email: string;
  cargo: CargoMenu;
  dias: number | null;
  expiraEm: string | null;
  menu: ItemMenu[];
  contadores?: Record<string, number>;
};

async function sair() {
  await fetch("/api/auth/sair", { method: "POST" });
  window.location.href = "/login";
}

export default function AppShell({ dados, children }: { dados: DadosShell; children: ReactNode }) {
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();
  const { cargo, menu, dias } = dados;
  const ativo = (i: ItemMenu) => pathname === i.href || pathname.startsWith(i.href + "/");
  const admin = cargo !== "USUARIO";

  return (
    <ToastProvider>
      <div
        data-safe-area-inset-root
        style={{ boxSizing: "border-box", paddingTop: "var(--safe-area-inset-top)", minHeight: "100dvh", background: "var(--bg)" }}
        className="overflow-x-clip"
      >
        <div className="flex items-start">
          {/* ===== Barra lateral fixa ===== */}
          <aside
            data-safe-area-sticky-top
            className="hidden lg:flex flex-col w-[232px] shrink-0 border-r p-3 sticky self-start h-[calc(100dvh-var(--safe-area-inset-top))] overflow-y-auto"
            style={{ borderColor: "var(--border)", background: "var(--surface)", top: "var(--safe-area-inset-top)" }}
          >
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 min-w-0">
              <div className="font-display text-[20px] font-extrabold leading-none tracking-tight shrink-0 whitespace-nowrap">
                Fila<span style={{ color: "var(--primary)" }}>Pro</span> Leads
              </div>
              <div className="min-w-0">
                <div className="text-[11px] mt-0.5 leading-tight" style={{ color: "var(--muted)" }}>
                  {admin ? "Painel do Administrador" : "WhatsApp inteligente"}
                </div>
              </div>
            </div>
            <div
              className="mt-3 rounded-lg px-2.5 py-2 text-[11px] font-bold flex items-center gap-1.5"
              style={{ background: "var(--primary-soft)", color: "var(--primary-dark)" }}
            >
              {admin ? <ShieldCheck size={14} /> : <Users size={14} />} {PERFIL[cargo]}
            </div>

            <nav className="mt-2 space-y-0.5" aria-label="Menu principal">
              {menu.map((item, idx) => {
                const anterior = idx > 0 ? menu[idx - 1] : undefined;
                const novoGrupo = !anterior || anterior.grupo !== item.grupo;
                const novoSub = item.subgrupo && item.subgrupo !== anterior?.subgrupo;
                return (
                  <Fragment key={item.href}>
                    {novoGrupo && (
                      <div className="pt-2 pb-1 px-2.5 text-[10px] font-extrabold tracking-widest uppercase" style={{ color: "var(--muted)" }}>
                        {item.grupo}
                      </div>
                    )}
                    {novoSub && (
                      <div className="pt-1.5 pb-0.5 px-2.5 text-[10px] font-bold tracking-wide" style={{ color: "var(--muted-2)" }}>
                        {item.subgrupo}
                      </div>
                    )}
                    <Link
                      href={item.href}
                      className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left font-bold text-[13px]"
                      style={ativo(item) ? { background: "var(--primary-soft)", color: "var(--primary-dark)" } : { color: "var(--muted)" }}
                    >
                      {ICONES[item.icone]({ size: 17 })}
                      {item.label}
                      {!!dados.contadores?.[item.href] && (
                        <span className="ml-auto rounded-full px-1.5 py-0.5 text-[10px] font-extrabold leading-none" style={{ background: "#e5484d", color: "#fff" }}>
                          {dados.contadores[item.href]}
                        </span>
                      )}
                      {ativo(item) && <ChevronRight size={15} className={dados.contadores?.[item.href] ? "" : "ml-auto"} />}
                    </Link>
                  </Fragment>
                );
              })}
            </nav>

            <div className="mt-auto rounded-xl p-3" style={{ background: "var(--surface-2)" }}>
              <div className="flex items-center gap-1.5 font-bold text-[12px]">
                <ShieldCheck size={14} style={{ color: "var(--primary)" }} /> {admin ? "Visão agregada" : "Espaço individual"}
              </div>
              <p className="text-[11px] leading-relaxed mt-1.5" style={{ color: "var(--muted)" }}>
                {cargo === "SUPERADMIN"
                  ? "Acesso total, sempre agrupado por empresa e por usuário individual."
                  : cargo === "ADMIN_EMPRESA"
                    ? "O administrador vê contadores agregados da sua empresa. Admin não envia mensagens."
                    : "Você vê só seus leads, conversas e seu WhatsApp. Nenhum usuário acessa dados de outro."}
              </p>
            </div>
            <button onClick={sair} className="btn-ghost mt-2 w-full justify-center">
              <Repeat size={14} /> Sair
            </button>
          </aside>

          <div className="flex-1 min-w-0 flex flex-col">
            {/* ===== Topo fixo ===== */}
            <header
              data-safe-area-sticky-top
              className="h-[52px] shrink-0 border-b px-3 sm:px-4 flex items-center gap-2 sticky z-40"
              style={{ background: "var(--bg)", borderColor: "var(--border)", top: "var(--safe-area-inset-top)" }}
            >
              <div className="lg:hidden flex items-center gap-1.5 min-w-0">
                <span className="font-display text-[18px] font-extrabold leading-none tracking-tight whitespace-nowrap">
                  Fila<span style={{ color: "var(--primary)" }}>Pro</span> Leads
                </span>
              </div>
              <div className="hidden md:block leading-tight">
                <div className="text-[11px]" style={{ color: "var(--muted)" }}>
                  {cargo === "SUPERADMIN" ? "Super Admin • Acesso total agrupado" : cargo === "ADMIN_EMPRESA" ? "Administrador" : `Olá, ${dados.nome}`}
                </div>
                <div className="font-bold text-[12px] [overflow-wrap:anywhere]">{dados.email}</div>
              </div>
              <div className="ml-auto flex items-center gap-1.5 flex-wrap justify-end">
                {cargo !== "SUPERADMIN" && dias !== null && dias >= 0 && (
                  <span
                    className="chip"
                    style={
                      dias <= 3
                        ? { background: "#ffeef0", color: "#9e1d2f" }
                        : dias <= 10
                          ? { background: "#fff7e0", color: "#8a5a00" }
                          : { background: "var(--surface-3)", color: "var(--muted)" }
                    }
                  >
                    <Clock3 size={12} /> {dias === 0 ? "Expira hoje" : `Expira em ${dias} ${dias === 1 ? "dia" : "dias"}`}
                  </span>
                )}
                {cargo !== "SUPERADMIN" && dias !== null && dias < 0 && (
                  <span className="chip" style={{ background: "#ffeef0", color: "#9e1d2f" }}>
                    <TriangleAlert size={12} /> Acesso expirado
                  </span>
                )}
                {admin && (
                  <span className="hidden sm:inline-flex chip" style={{ background: "var(--primary-soft)", color: "var(--primary-dark)" }}>
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Painel administrativo
                  </span>
                )}
                <button onClick={toggleTheme} className="btn-ghost !p-2" aria-label="Alternar tema claro e escuro">
                  {theme === "light" ? <Moon size={16} /> : <Sun size={16} />}
                </button>
                <button onClick={sair} className="btn-ghost !py-2 !px-2.5">
                  <Repeat size={14} />
                  <span>Sair</span>
                </button>
              </div>
            </header>

            {/* ===== Menu no celular ===== */}
            <div
              data-safe-area-sticky-top
              className="nao-imprimir lg:hidden px-3 pt-2 flex gap-1.5 overflow-x-auto pb-1 shrink-0 no-scrollbar sticky z-30"
              style={{ background: "var(--bg)", top: "calc(var(--safe-area-inset-top) + 52px)" }}
            >
              {menu.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="shrink-0 px-2.5 py-1.5 rounded-full text-[12px] font-bold border"
                  style={
                    ativo(item)
                      ? { background: "var(--primary)", color: "#fff", borderColor: "var(--primary)" }
                      : { borderColor: "var(--border)", background: "var(--surface)" }
                  }
                >
                  {item.label}
                </Link>
              ))}
            </div>

            <main className="flex-1 p-3 sm:p-4">
              <div className="max-w-[1180px] mx-auto w-full flex flex-col">
                {cargo === "USUARIO" && (
                  <div className="flex gap-2 rounded-xl px-3 py-2 mb-3 shrink-0" style={{ background: "var(--primary-soft)", border: "1px solid var(--border)" }}>
                    <ShieldCheck size={16} className="shrink-0" style={{ color: "var(--primary)" }} />
                    <p className="text-[12px] leading-relaxed">
                      <b>Você está vendo apenas seus dados.</b>{" "}
                      <span style={{ color: "var(--muted)" }}>Seus leads, campanhas, conversas e arquivos não são compartilhados com outros usuários.</span>
                    </p>
                  </div>
                )}
                {children}
              </div>
            </main>
          </div>
        </div>

        {cargo !== "SUPERADMIN" && dias !== null && dados.expiraEm && <AvisoExpiracao dias={dias} expiraEm={dados.expiraEm} souAdmin={cargo === "ADMIN_EMPRESA"} />}
      </div>
    </ToastProvider>
  );
}
