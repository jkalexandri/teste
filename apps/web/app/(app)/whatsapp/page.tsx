// WhatsApp: o usuário conecta os próprios números por QR Code (decisões #1, #18, #62).
// No plano Individual pode ter números extras (etapa 10c — decisões #79, #80 e #95).
// O Admin da Empresa não usa WhatsApp (o menu dele não tem esta tela).
import { redirect } from "next/navigation";
import Cabecalho from "@/components/app/Cabecalho";
import ConexaoWhatsapp from "@/components/app/ConexaoWhatsapp";
import { lerEstado, sessaoDoAlvo } from "@/lib/whatsapp";
import { MAX_NUMEROS_SUPERADMIN, numerosDoUsuario, podeTerExtras, rotuloNumero, sincronizarExtras } from "@/lib/whatsapp-extra";
import { obterSessao } from "@/lib/auth/session";
import { infoExtra } from "./actions";
import { Cargo } from "@filapro/db";
import { saudeDoNumero } from "@/lib/metricas";
import { Apelido, ComprarExtra, NumerosSuperAdmin } from "./Extras";

export const dynamic = "force-dynamic";

export default async function WhatsappPage() {
  const s = await sessaoDoAlvo("proprio");
  const sessao = await obterSessao();
  if (!s || !sessao) redirect("/dashboard");
  const u = sessao.usuario;
  const comExtras = podeTerExtras(u);
  // Garante os números contratados (extras confirmados em Pedidos ou dados pelo Super Admin)
  if (comExtras && u.empresa) await sincronizarExtras(u.id, u.empresa.whatsappsExtras);
  const { principal, extras } = await numerosDoUsuario(u.id);
  const ativos = extras.filter((x) => !x.bloqueada);
  const bloqueados = extras.filter((x) => x.bloqueada);
  const info = comExtras ? await infoExtra() : null;
  const varios = ativos.length > 0;
  // Super Admin: até 10 números, sem pagamento (decisão #113)
  const superAdmin = u.cargo === Cargo.SUPERADMIN;
  const estados = await Promise.all(ativos.map((x) => lerEstado(x.id)));
  // Saúde de cada número (decisão #79), quando há mais de um
  const saudes = varios ? await Promise.all([u.id, ...ativos.map((x) => x.id)].map((id) => saudeDoNumero(u.id, id))) : [];

  return (
    <section className="flex-1 flex flex-col">
      <Cabecalho
        rotulo="Configurações • WhatsApp"
        titulo="WhatsApp"
        descricao={varios
          ? "Conecte cada número lendo o QR Code com o celular. Nas campanhas você escolhe por quais números enviar."
          : "Conecte o seu WhatsApp lendo o QR Code com o celular."}
      />
      <div data-testid="numero" data-id={u.id}>
        <ConexaoWhatsapp alvo="proprio" titulo={varios ? rotuloNumero({ id: u.id, usuarioId: u.id, apelido: principal?.apelido ?? "", numero: null }, 1) : undefined} inicial={await lerEstado(s.sessaoId)} />
        {varios && <Apelido sessaoId={u.id} inicial={principal?.apelido ?? ""} saude={saudes[0]} />}
      </div>
      {ativos.map((x, i) => (
        <div key={x.id} data-testid="numero" data-id={x.id} className="mt-2">
          <ConexaoWhatsapp alvo={x.id} titulo={rotuloNumero(x, i + 2)} inicial={estados[i]!} semAjuda />
          <Apelido sessaoId={x.id} inicial={x.apelido} saude={saudes[i + 1]} />
        </div>
      ))}
      {bloqueados.length > 0 && (
        <div className="card p-3 mt-3 text-[12px]" data-testid="bloqueados">
          <b>{superAdmin ? "Números removidos" : "Números fora do plano"}</b>
          <p className="help">{superAdmin
            ? "Ficam desconectados até você adicionar de novo. As conversas continuam guardadas."
            : "Saíram na renovação: ficam desconectados até você comprar de novo. As conversas continuam guardadas."}</p>
          <ul className="mt-1 list-disc pl-5">
            {bloqueados.map((x) => <li key={x.id}>{x.apelido || (x.numero ? `+${x.numero}` : x.id)}</li>)}
          </ul>
        </div>
      )}
      {info && <ComprarExtra info={info} />}
      {superAdmin && <NumerosSuperAdmin total={1 + ativos.length} maximo={MAX_NUMEROS_SUPERADMIN} />}
    </section>
  );
}
