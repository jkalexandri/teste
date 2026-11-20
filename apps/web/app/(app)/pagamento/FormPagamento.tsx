"use client";

import { useState, useTransition } from "react";
import { useToast } from "@/components/app/Toast";
import { salvarPagamento } from "./actions";

type Dados = { chavePix: string; nomeRecebedor: string; cidadeRecebedor: string; contatoPersonalizado: string };

export default function FormPagamento({ inicial }: { inicial: Dados }) {
  const toast = useToast();
  const [erro, setErro] = useState("");
  const [pendente, iniciar] = useTransition();

  return (
    <form
      className="grid lg:grid-cols-2 gap-3 mt-3"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        iniciar(async () => {
          const r = await salvarPagamento(fd);
          setErro(r.ok ? "" : r.mensagem);
          if (r.ok) toast(r.mensagem);
        });
      }}
    >
      <div className="card p-4 space-y-2.5">
        <h2 className="font-display font-bold text-[14px]">Formas de pagamento</h2>
        <label className="flex items-center gap-2 text-[13px] font-bold">
          <input type="checkbox" checked readOnly className="w-4 h-4 accent-emerald-600" /> PIX
        </label>
        <p className="help">Por enquanto só PIX. Outras formas poderão ser ativadas depois.</p>

        <div>
          <label className="label" htmlFor="chavePix">Chave PIX</label>
          <input id="chavePix" name="chavePix" className="input" defaultValue={inicial.chavePix} placeholder="CPF, CNPJ, e-mail, telefone ou chave aleatória" />
        </div>
        <div>
          <label className="label" htmlFor="nomeRecebedor">Nome do recebedor (até 25 letras)</label>
          <input id="nomeRecebedor" name="nomeRecebedor" className="input" maxLength={25} defaultValue={inicial.nomeRecebedor} />
        </div>
        <div>
          <label className="label" htmlFor="cidadeRecebedor">Cidade do recebedor (até 15 letras)</label>
          <input id="cidadeRecebedor" name="cidadeRecebedor" className="input" maxLength={15} defaultValue={inicial.cidadeRecebedor} />
        </div>
        <p className="help">Usados para gerar o QR Code e o “copia e cola” do PIX de cada pedido. A confirmação do pagamento é manual, na tela Pedidos.</p>
      </div>

      <div className="card p-4 space-y-2.5 self-start">
        <h2 className="font-display font-bold text-[14px]">Plano Personalizado</h2>
        <div>
          <label className="label" htmlFor="contatoPersonalizado">Contato para o plano Personalizado</label>
          <input id="contatoPersonalizado" name="contatoPersonalizado" className="input" defaultValue={inicial.contatoPersonalizado} placeholder="WhatsApp (ex.: (11) 99999-9999) ou link" />
        </div>
        <p className="help">Se for um telefone, o botão do plano abre o WhatsApp. Se for um link, abre o link.</p>
      </div>

      <div className="lg:col-span-2 flex items-center gap-3">
        <button className="btn-primary" disabled={pendente}>{pendente ? "Salvando…" : "Salvar"}</button>
        {erro && <span className="text-[12px] font-semibold text-[#b42318]">{erro}</span>}
      </div>
    </form>
  );
}
