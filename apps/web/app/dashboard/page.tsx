// Tela inicial PROVISÓRIA após o login (etapa 2).
// Serve só para confirmar quem entrou. O dashboard real, com menu lateral e
// conteúdo por perfil, será feito na etapa 3 seguindo a prévia.
import { redirect } from "next/navigation";
import { obterSessao } from "@/lib/auth/session";
import BotaoSair from "./BotaoSair";

export const dynamic = "force-dynamic";

const CARGO = { SUPERADMIN: "Super Admin", ADMIN_EMPRESA: "Admin da Empresa", USUARIO: "Usuário" } as const;
const MODULO = { INDIVIDUAL: "Individual", EMPRESARIAL: "Empresarial" } as const;

export default async function DashboardPage() {
  const sessao = await obterSessao();
  if (!sessao) redirect("/login");
  if (sessao.precisaTrocar) redirect("/primeiro-acesso");

  const u = sessao.usuario;
  const dias = u.empresa
    ? Math.ceil((u.empresa.expiraEm.getTime() - Date.now()) / 86400000)
    : null;

  return (
    <div style={{ minHeight: "100dvh", background: "var(--bg)" }} className="p-4">
      <div className="card max-w-[560px] mx-auto p-4">
        <span className="chip" style={{ background: "var(--primary-soft)", color: "var(--primary-dark)" }}>
          Etapa 2 • tela provisória
        </span>
        <h1 className="font-display text-[22px] font-extrabold mt-2">Olá, {u.nome}</h1>
        <ul className="text-[13px] mt-2 space-y-1" style={{ color: "var(--muted)" }}>
          <li>E-mail: <b style={{ color: "var(--text)" }}>{u.email}</b></li>
          <li>Perfil: <b style={{ color: "var(--text)" }}>{CARGO[u.cargo]}</b></li>
          {u.empresa && (
            <>
              <li>Módulo: <b style={{ color: "var(--text)" }}>{MODULO[u.empresa.modulo]}</b></li>
              <li>Conta: <b style={{ color: "var(--text)" }}>{u.empresa.nome}</b> • pacote {u.empresa.pacote}</li>
              <li>Dias restantes do pacote: <b style={{ color: "var(--text)" }}>{dias}</b></li>
            </>
          )}
        </ul>
        <p className="help mt-3">O dashboard completo, com menu lateral e as telas de cada perfil, chega na etapa 3.</p>
        <BotaoSair />
      </div>
    </div>
  );
}
