"use client";

// Super Admin → Pagamento → Asaas (decisão #115, etapa A): ambiente, chave de API (criptografada, nunca mostrada de volta),
// teste de conexão e os dados do aviso automático (webhook) para cadastrar no Asaas.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/app/Toast";
import { removerAsaas, salvarAsaas } from "./actions";

type Estado = { ambiente: "sandbox" | "producao"; configurado: boolean; conta: string | null; testadoEm: string | null };

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
          No Asaas: <b>Integrações → Webhooks → Adicionar</b>, e preencha:
        </p>
        <Copiavel id="webhook-url" rotulo="URL do webhook" valor={webhook.url} />
        <Copiavel id="webhook-token" rotulo="Token de autenticação" valor={webhook.token} />
        <ul className="help list-disc pl-5 space-y-0.5">
          <li><b>Versão da API:</b> v3 • <b>Tipo de envio:</b> sequencial • <b>Fila de sincronização:</b> ativada</li>
          <li><b>Eventos:</b> marque os de <b>Cobranças</b> (cobrança criada, confirmada, recebida, vencida, estornada).</li>
          <li>Faça isso nos dois ambientes (Testes e Produção), com a mesma URL e o mesmo token.</li>
        </ul>
      </div>
    </div>
  );
}
