"use client";

// Tela Leads de anúncios (etapa 10b): endereço secreto (copiar / gerar novo), passo a passo e últimos leads recebidos.
import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/app/Toast";
import { gerarEndereco } from "./actions";

type Recebido = { id: string; origem: string; nome: string; telefone: string; assunto: string; status: string; erro: string | null; recebidoEm: string; leadId: string | null };

const STATUS: Record<string, { rotulo: string; cor: string }> = {
  RECEBIDO: { rotulo: "Recebido", cor: "#b54708" },
  AGUARDANDO_WHATSAPP: { rotulo: "Esperando o WhatsApp", cor: "#b54708" },
  ATENDIDO: { rotulo: "IA atendeu", cor: "#067647" },
  SEM_TELEFONE: { rotulo: "Sem telefone", cor: "#b42318" },
  SEM_RECURSO: { rotulo: "Fora do plano", cor: "#b42318" },
  ERRO: { rotulo: "Atenção", cor: "#b42318" },
};
const ORIGEM: Record<string, string> = { google: "Google Ads", facebook: "Facebook/Instagram", outro: "Outro" };
const EXEMPLO = `{
  "nome": "Maria Souza",
  "telefone": "(11) 98765-4321",
  "email": "maria@email.com",
  "assunto": "Quero saber o preço do plano mensal"
}`;

export default function TelaAnuncios({ incluido, endereco, recebidos }: { incluido: boolean; endereco: string | null; recebidos: Recebido[] }) {
  const router = useRouter();
  const toast = useToast();
  const [pendente, iniciar] = useTransition();
  // Atualiza a lista a cada 10 s (leads chegando e sendo atendidos)
  useEffect(() => { const t = setInterval(() => router.refresh(), 10_000); return () => clearInterval(t); }, [router]);

  if (!incluido) {
    return (
      <div className="card p-4 mt-3 max-w-[720px]">
        <p className="text-[13px] font-bold" data-testid="fora-do-plano">Leads de anúncios não está incluído no seu plano.</p>
        <p className="help mt-1">Fale com o suporte para incluir este recurso: os leads dos seus anúncios entram sozinhos e a IA atende na hora.</p>
      </div>
    );
  }
  const gerar = (novo: boolean) => {
    if (novo && !window.confirm("Gerar um endereço novo? O endereço atual para de funcionar na hora.")) return;
    iniciar(async () => { const r = await gerarEndereco(); toast(r.mensagem, r.ok ? "ok" : "erro"); router.refresh(); });
  };
  return (
    <>
      <div className="card p-4 mt-3">
        <h2 className="font-display font-extrabold text-[16px]">Seu endereço secreto</h2>
        <p className="help">Quem tiver este endereço consegue cadastrar leads na sua conta: não compartilhe.</p>
        {endereco ? (
          <div className="flex flex-wrap gap-2 mt-2">
            <input className="input flex-1 min-w-[260px] !text-[12px]" readOnly value={endereco} aria-label="Endereço de recebimento" data-testid="endereco" onFocus={(e) => e.currentTarget.select()} />
            <button type="button" className="btn-primary" onClick={() => navigator.clipboard.writeText(endereco).then(() => toast("Endereço copiado.", "ok"), () => toast("Selecione e copie o endereço.", "erro"))}>Copiar</button>
            <button type="button" className="btn-ghost" disabled={pendente} onClick={() => gerar(true)}>Gerar novo endereço</button>
          </div>
        ) : (
          <button type="button" className="btn-primary mt-2" disabled={pendente} onClick={() => gerar(false)}>Gerar meu endereço</button>
        )}
      </div>

      <div className="grid xl:grid-cols-2 gap-3 mt-3">
        <div className="card p-4 text-[13px] leading-relaxed">
          <h2 className="font-display font-extrabold text-[16px]">Google Ads (formulário de lead)</h2>
          <ol className="list-decimal pl-5 mt-1 space-y-1">
            <li>No Google Ads, abra o <b>recurso de formulário de lead</b> da campanha.</li>
            <li>Em <b>Integração de dados de leads</b> → <b>Webhook</b>, cole o seu endereço no campo <b>URL do webhook</b>.</li>
            <li>Em <b>Chave</b>, escreva qualquer palavra (não é usada; a segurança está no endereço).</li>
            <li>Clique em <b>Enviar dados de teste</b>: o teste aparece na lista abaixo.</li>
          </ol>
          <p className="help mt-2">Inclua o campo <b>telefone</b> no formulário: sem telefone o lead não entra.</p>
        </div>
        <div className="card p-4 text-[13px] leading-relaxed">
          <h2 className="font-display font-extrabold text-[16px]">Facebook / Instagram (via Make ou Zapier)</h2>
          <ol className="list-decimal pl-5 mt-1 space-y-1">
            <li>Crie um cenário (Make) ou Zap (Zapier) com o gatilho <b>Facebook Lead Ads → Novo lead</b>.</li>
            <li>Adicione a ação <b>HTTP / Webhooks → POST</b> para o seu endereço, no formato <b>JSON</b>.</li>
            <li>Envie os campos do formulário com estes nomes:</li>
          </ol>
          <pre className="mt-2 p-2 rounded-lg text-[11px] overflow-x-auto" style={{ background: "var(--surface-3)" }}>{EXEMPLO}</pre>
          <p className="help mt-1">Outros campos do formulário também podem ir: a IA usa tudo para escrever a primeira mensagem.</p>
        </div>
      </div>

      <div className="card p-4 mt-3">
        <h2 className="font-display font-extrabold text-[16px]">Últimos leads recebidos</h2>
        {recebidos.length === 0 ? (
          <p className="text-[12px] mt-2" style={{ color: "var(--muted)" }}>Nenhum lead recebido ainda.</p>
        ) : (
          <div className="table-wrap mt-2">
            <table style={{ minWidth: 760, fontSize: 12 }} data-testid="recebidos">
              <thead><tr><th>Recebido em</th><th>Origem</th><th>Nome</th><th>Telefone</th><th>Assunto</th><th>Situação</th></tr></thead>
              <tbody>
                {recebidos.map((r) => (
                  <tr key={r.id}>
                    <td style={{ whiteSpace: "nowrap" }}>{new Date(r.recebidoEm).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</td>
                    <td>{ORIGEM[r.origem] ?? r.origem}</td>
                    <td className="font-bold">{r.nome || "—"}</td>
                    <td style={{ whiteSpace: "nowrap" }}>{r.telefone || "—"}</td>
                    <td className="[overflow-wrap:anywhere] max-w-[260px]">{r.assunto || "—"}</td>
                    <td>
                      <span style={{ color: STATUS[r.status]?.cor, fontWeight: 700 }}>{STATUS[r.status]?.rotulo ?? r.status}</span>
                      {r.erro && <span className="help block">{r.erro}</span>}
                      {r.leadId && r.status === "ATENDIDO" && <a className="underline text-[11px]" href={`/conversas?lead=${r.leadId}`}>Ver conversa</a>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
