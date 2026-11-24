"use client";

// Super Admin → Pagamento → Asaas (decisão #115, etapa A): ambiente, chave de API (criptografada, nunca mostrada de volta),
// teste de conexão e os dados do aviso automático (webhook) para cadastrar no Asaas.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/app/Toast";
import { configurarAvisoAsaas, removerAsaas, salvarAsaas, verificarAvisoAsaas } from "./actions";

type Estado = {
  ambiente: "sandbox" | "producao"; configurado: boolean; conta: string | null; testadoEm: string | null;
  /** Último aviso que chegou do Asaas e se o token conferiu */
  aviso: { em: string; evento: string; ok: boolean } | null;
};

/** Campo só de leitura com botão "Copiar". */
function Copiavel({ id, rotulo, valor }: { id: string; rotulo: string; valor: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <div>
      <label className="label" htmlFor={id}>{rotulo}</label>
      <div className="flex gap-2">
        <input id={id} className="input font-mono !text-[12px]" value={valor} readOnly onFocus={(e) => e.currentTarget.select()} />
        <button type="button" className="btn-ghost shrink-0" onClick={() => navigator.clipboard.writeText(valor).then(() => setCopiado(true), () => undefined)}>
          {copiado ? "Copiado!" : "Copiar"}
        </button>
      </div>
    </div>
  );
}

export default function ConfigAsaas({ estado, webhook }: { estado: Estado; webhook: { url: string; token: string } }) {
  const toast = useToast();
  const router = useRouter();
  const [erro, setErro] = useState("");
  const [pendente, iniciar] = useTransition();
  const [ambiente, setAmbiente] = useState(estado.ambiente);
  // Resultado do "Configurar aviso automaticamente" / "Verificar no Asaas"
  const [msgAviso, setMsgAviso] = useState<{ ok: boolean; mensagem: string } | null>(null);
  const agirAviso = (fn: () => Promise<{ ok: boolean; mensagem: string }>) =>
    iniciar(async () => { const r = await fn(); setMsgAviso(r); router.refresh(); });

  return (
    <div className="grid lg:grid-cols-2 gap-3 mt-3" data-testid="config-asaas">
      <form
        className="card p-4 space-y-2.5"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          const form = e.currentTarget;
          iniciar(async () => {
            const r = await salvarAsaas(fd);
            setErro(r.ok ? "" : r.mensagem);
            if (r.ok) { toast(r.mensagem); form.reset(); router.refresh(); }
          });
        }}
      >
        <h2 className="font-display font-bold text-[14px]">Asaas — cartão, PIX automático e boleto</h2>
        <p className="help">
          Com o Asaas ligado, o cliente paga com cartão (na página segura do Asaas), PIX com confirmação automática ou boleto.
          Comece pelo ambiente de <b>Testes</b>; quando estiver tudo certo, troque para <b>Produção</b>.
        </p>

        <div className="rounded-lg p-2.5 text-[12px]" style={{ background: "var(--surface-3)", border: "1px solid var(--border)" }} data-testid="estado-asaas">
          {estado.configurado ? (
            <>
              <b style={{ color: "var(--primary-dark)" }}>● Conectado</b> à conta <b>{estado.conta}</b> —{" "}
              {estado.ambiente === "producao" ? "Produção" : "Testes (sandbox)"}
              {estado.testadoEm && <span style={{ color: "var(--muted)" }}> • testado em {new Date(estado.testadoEm).toLocaleString("pt-BR")}</span>}
            </>
          ) : (
            <><b>○ Não configurado.</b> <span style={{ color: "var(--muted)" }}>Os pedidos continuam com o PIX manual.</span></>
          )}
        </div>

        <div>
          <label className="label" htmlFor="asaasAmbiente">Ambiente</label>
          <select id="asaasAmbiente" name="asaasAmbiente" className="input" value={ambiente} onChange={(e) => setAmbiente(e.target.value as Estado["ambiente"])}>
            <option value="sandbox">Testes (sandbox) — nada é cobrado de verdade</option>
            <option value="producao">Produção — cobranças reais</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="asaasChave">Chave de API {estado.configurado && ambiente === estado.ambiente ? "(deixe vazio para manter a atual)" : ""}</label>
          <input id="asaasChave" name="asaasChave" type="password" className="input font-mono" autoComplete="off"
            placeholder={ambiente === "producao" ? "$aact_prod_…" : "$aact_hmlg_…"} />
          <p className="help mt-0.5">
            No Asaas: <b>Integrações → Chaves de API → Gerar chave</b>. Ela fica guardada criptografada e não aparece de novo aqui.
          </p>
        </div>

        {erro && <p className="text-[12px] font-semibold text-[#b42318]" data-testid="erro-asaas">{erro}</p>}
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" disabled={pendente} data-testid="salvar-asaas">{pendente ? "Testando…" : "Salvar e testar conexão"}</button>
          {estado.configurado && (
            <button type="button" className="btn-ghost" disabled={pendente}
              onClick={() => window.confirm("Remover a chave do Asaas? Os pedidos voltam a usar o PIX manual.") && iniciar(async () => { const r = await removerAsaas(); toast(r.mensagem); router.refresh(); })}>
              Remover chave
            </button>
          )}
        </div>
      </form>

      <div className="card p-4 space-y-2.5 self-start" data-testid="webhook-asaas">
        <h2 className="font-display font-bold text-[14px]">Aviso automático de pagamento (webhook)</h2>
        <p className="help">
          É por aqui que o Asaas avisa o FilaPro quando um pagamento é aprovado, e a conta é liberada sozinha.
        </p>

        {/* Último aviso recebido: mostra se o Asaas está mesmo chegando aqui */}
        <div className="rounded-lg p-2.5 text-[12px]" style={{ background: "var(--surface-3)", border: "1px solid var(--border)" }} data-testid="ultimo-aviso">
          {estado.aviso ? (
            estado.aviso.ok ? (
              <><b style={{ color: "var(--primary-dark)" }}>● Último aviso recebido</b> em {new Date(estado.aviso.em).toLocaleString("pt-BR")} — {estado.aviso.evento}</>
            ) : (
              <><b className="text-[#b42318]">● Aviso recusado</b> em {new Date(estado.aviso.em).toLocaleString("pt-BR")}: o token do Asaas está diferente.
                Clique em <b>Configurar aviso automaticamente</b>.</>
            )
          ) : (
            <><b>○ Nenhum aviso recebido ainda.</b> <span style={{ color: "var(--muted)" }}>Depois de configurar, crie uma cobrança de teste no Asaas e recarregue esta página.</span></>
          )}
        </div>

        {estado.configurado ? (
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-primary" disabled={pendente} onClick={() => agirAviso(configurarAvisoAsaas)} data-testid="configurar-aviso">
              {pendente ? "Aguarde…" : "Configurar aviso automaticamente"}
            </button>
            <button type="button" className="btn-ghost" disabled={pendente} onClick={() => agirAviso(verificarAvisoAsaas)} data-testid="verificar-aviso">Verificar no Asaas</button>
          </div>
        ) : (
          <p className="help">Conecte a chave do Asaas ao lado para o FilaPro cadastrar o aviso sozinho.</p>
        )}
        {msgAviso && <p className={`text-[12px] font-semibold ${msgAviso.ok ? "" : "text-[#b42318]"}`} style={msgAviso.ok ? { color: "var(--primary-dark)" } : undefined} data-testid="msg-aviso">{msgAviso.mensagem}</p>}

        <details className="text-[12px]">
          <summary className="cursor-pointer font-bold">Prefere cadastrar à mão no Asaas?</summary>
          <div className="space-y-2 mt-2">
            <p className="help">No Asaas: <b>Integrações → Webhooks → Adicionar</b>, e preencha:</p>
            <Copiavel id="webhook-url" rotulo="URL do webhook" valor={webhook.url} />
            <Copiavel id="webhook-token" rotulo="Token de autenticação" valor={webhook.token} />
            <ul className="help list-disc pl-5 space-y-0.5">
              <li><b>Versão da API:</b> v3 • <b>Tipo de envio:</b> sequencial • <b>Fila de sincronização:</b> ativada</li>
              <li><b>Eventos:</b> marque os de <b>Cobranças</b> (cobrança criada, confirmada, recebida, vencida, estornada).</li>
            </ul>
          </div>
        </details>
      </div>
    </div>
  );
}
