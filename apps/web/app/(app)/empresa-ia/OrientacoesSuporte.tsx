"use client";

// Orientações do suporte (decisão #148) — só o Super Admin. Texto lido só pela IA do suporte dos clientes
// (respostas prontas, regras de atendimento), com texto sugestão e uma caixa para testar o que a IA responderia.
import { useState, useTransition } from "react";
import { useToast } from "@/components/app/Toast";
import CampoTextoGrande from "@/components/app/CampoTextoGrande";
import { salvarOrientacoesSuporte, testarSuporteIA, type TesteSuporte } from "./actions";

export default function OrientacoesSuporte({ inicial, sugestao, max, testesPorHora }: { inicial: string; sugestao: string; max: number; testesPorHora: number }) {
  const toast = useToast();
  const [salvando, salvar] = useTransition();
  const [testando, testar] = useTransition();
  const [pergunta, setPergunta] = useState("");
  const [resultado, setResultado] = useState<TesteSuporte | null>(null);

  return (
    <div className="card p-4 mt-3" data-testid="orientacoes-suporte">
      <h2 className="font-display font-extrabold text-[16px]">Orientações do suporte</h2>
      <p className="help">
        Texto que só a <b>IA do suporte dos clientes</b> lê: respostas prontas, horário, regras de atendimento. Vale mais que o manual do sistema, mas nunca mais
        que as regras de segurança: pagamento, cobrança, cancelamento, bloqueio, reclamação, arquivos e pedido de atendente continuam indo para você.
      </p>
      <form className="mt-2" onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        salvar(async () => { const r = await salvarOrientacoesSuporte(f); toast(r.mensagem, r.ok ? "ok" : "erro"); });
      }}>
        <label className="label" htmlFor="ei-orientacoes">Orientações</label>
        <CampoTextoGrande id="ei-orientacoes" name="orientacoes" rotulo="Orientações do suporte" valorInicial={inicial} maxLength={max} sugestao={sugestao}
          placeholder="Ex.: horário de atendimento, perguntas e respostas frequentes, como tratar o cliente…"
          ajuda="Só a IA do suporte dos clientes usa este texto. Use “Texto sugestão” para começar de um modelo." />
        <div className="flex justify-end mt-2">
          <button type="submit" className="btn-primary" disabled={salvando} data-testid="salvar-orientacoes">Salvar orientações</button>
        </div>
      </form>

      <div className="mt-3 pt-3" style={{ borderTop: "1px solid var(--border)" }}>
        <h3 className="font-display font-bold text-[13px]">Testar uma pergunta</h3>
        <p className="help">Escreva como se fosse o cliente e veja o que a IA responderia. Usa o texto <b>salvo</b> acima (salve antes de testar). Não cria conversa nem avisa ninguém, mas usa IA (aparece em Despesas com IA). Limite: {testesPorHora} testes por hora.</p>
        <form className="flex flex-wrap gap-2 mt-1" onSubmit={(e) => {
          e.preventDefault();
          if (!pergunta.trim()) return;
          testar(async () => setResultado(await testarSuporteIA(pergunta)));
        }}>
          <input className="input flex-1 min-w-[220px]" value={pergunta} onChange={(e) => setPergunta(e.target.value)} maxLength={1000}
            placeholder="Ex.: Qual o horário de atendimento?" aria-label="Pergunta de teste para a IA do suporte" data-testid="pergunta-teste" />
          <button className="btn-ghost" disabled={testando || !pergunta.trim()} data-testid="testar-pergunta">{testando ? "Testando…" : "Testar"}</button>
        </form>
        {resultado && (
          <div className="rounded-xl p-3 mt-2 text-[13px]" data-testid="resultado-teste"
            style={{ background: !resultado.ok ? "#ffeef0" : resultado.vaiParaAtendente ? "#fff7e0" : "var(--surface-2, rgba(0,0,0,.03))", color: !resultado.ok ? "#9e1d2f" : undefined }}>
            {!resultado.ok ? resultado.mensagem : (
              <>
                {resultado.vaiParaAtendente && <p className="font-bold text-[12px]" style={{ color: "#8a5a00" }} data-testid="teste-atendente">Isso iria para o atendente: {resultado.motivo}.</p>}
                <p className="whitespace-pre-wrap mt-0.5" data-testid="teste-resposta">{resultado.resposta}</p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
