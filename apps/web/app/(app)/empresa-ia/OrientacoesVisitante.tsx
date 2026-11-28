"use client";

// Script de atendimento do Fale conosco (decisão #178) — só o Super Admin. Texto lido só pela IA do chat da tela de Planos
// (quem ainda não é cliente), com texto sugestão e uma caixa para testar o que a IA responderia.
import { useState, useTransition } from "react";
import { useToast } from "@/components/app/Toast";
import CampoTextoGrande from "@/components/app/CampoTextoGrande";
import { restaurarVersaoAnteriorVisitante, salvarOrientacoesVisitante, testarVisitanteIA, type TesteVisitante } from "./actions";

export default function OrientacoesVisitante({ inicial, anterior, sugestao, max }: { inicial: string; anterior: string; sugestao: string; max: number }) {
  const toast = useToast();
  const [salvando, salvar] = useTransition();
  const [testando, testar] = useTransition();
  const [pergunta, setPergunta] = useState("");
  const [resultado, setResultado] = useState<TesteVisitante | null>(null);

  return (
    <div className="card p-4 mt-3" data-testid="orientacoes-visitante">
      <h2 className="font-display font-extrabold text-[16px]">Script do Fale conosco</h2>
      <p className="help">
        Roteiro que só a <b>IA do Fale conosco</b> (o chat da tela de Planos, para quem ainda não é cliente) lê: como abrir a conversa, que perguntas fazer, como recomendar
        o plano e respostas prontas. A IA já conhece o sistema (material comercial) e lê <b>os valores e as promoções dos planos direto do cadastro</b>, exatamente como
        estão. O seu script vale mais que o material comercial, mas nunca mais que os dados dos planos nem que as regras de segurança: ela não inventa preço ou desconto, não promete
        resultado e não pede dados de pagamento no chat.
      </p>
      <form className="mt-2" onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        salvar(async () => { const r = await salvarOrientacoesVisitante(f); toast(r.mensagem, r.ok ? "ok" : "erro"); });
      }}>
        <label className="label" htmlFor="ev-orientacoes">Script</label>
        <CampoTextoGrande id="ev-orientacoes" name="orientacoesVisitante" guardarRascunho rotulo="Script do Fale conosco" valorInicial={inicial} maxLength={max} sugestao={sugestao}
          placeholder="Ex.: como abrir a conversa, perguntas para entender o visitante, como recomendar o plano, respostas prontas…"
          ajuda="Só a IA do Fale conosco usa este texto. Use “Texto sugestão” para começar de um modelo e troque o que está entre colchetes." />
        <div className="flex flex-wrap items-center justify-between gap-2 mt-2">
          <p className="text-[12px] font-bold" style={{ color: inicial.trim() ? "#087a44" : "#8a5a00" }} data-testid="estado-script-visitante">
            {inicial.trim() ? `Script salvo: ${inicial.trim().length.toLocaleString("pt-BR")} caracteres${inicial.trim().length >= max ? " (no limite: o que passar disso é cortado)" : ""}` : "Nenhum script salvo ainda: a IA usa só o material comercial."}
          </p>
          <div className="flex gap-2">
            {inicial.trim() && (
              <button type="button" className="btn-ghost" disabled={salvando} data-testid="apagar-script-visitante" onClick={() => {
                if (!window.confirm("Apagar o script do Fale conosco? A IA volta a usar só o material comercial.")) return;
                const f = new FormData(); f.set("orientacoesVisitante", ""); f.set("apagar", "1");
                salvar(async () => { const r = await salvarOrientacoesVisitante(f); toast(r.mensagem, r.ok ? "ok" : "erro"); });
              }}>Apagar script</button>
            )}
            <button type="submit" className="btn-primary" disabled={salvando} data-testid="salvar-orientacoes-visitante">Salvar script</button>
          </div>
        </div>
        {anterior.trim() && anterior.trim() !== inicial.trim() && (
          <p className="text-[12px] mt-1.5" data-testid="versao-anterior-visitante">
            Há uma <b>versão anterior</b> guardada ({anterior.trim().length.toLocaleString("pt-BR")} caracteres).{" "}
            <button type="button" className="underline font-bold" disabled={salvando} data-testid="restaurar-anterior-visitante" onClick={() => {
              if (!window.confirm("Restaurar a versão anterior do script? A versão de agora fica guardada como anterior (dá para desfazer).")) return;
              salvar(async () => { const r = await restaurarVersaoAnteriorVisitante(); toast(r.mensagem, r.ok ? "ok" : "erro"); });
            }}>Restaurar a versão anterior</button>
          </p>
        )}
      </form>

      <div className="mt-3 pt-3" style={{ borderTop: "1px solid var(--border)" }}>
        <h3 className="font-display font-bold text-[13px]">Testar uma mensagem</h3>
        <p className="help">Escreva como se fosse o visitante e veja o que a IA responderia. Usa o script <b>salvo</b> acima (salve antes de testar). Não cria conversa nem avisa ninguém, mas usa IA
          (aparece em Despesas com IA). Limite de 10 testes por hora.</p>
        <form className="flex flex-wrap gap-2 mt-1" onSubmit={(e) => {
          e.preventDefault();
          if (!pergunta.trim()) return;
          testar(async () => setResultado(await testarVisitanteIA(pergunta)));
        }}>
          <input className="input flex-1 min-w-[220px]" value={pergunta} onChange={(e) => setPergunta(e.target.value)} maxLength={1000}
            placeholder="Ex.: Oi, quanto custa e como funciona?" aria-label="Mensagem de teste para a IA do Fale conosco" data-testid="pergunta-teste-visitante" />
          <button className="btn-ghost" disabled={testando || !pergunta.trim()} data-testid="testar-visitante">{testando ? "Testando…" : "Testar"}</button>
        </form>
        {resultado && (
          <div className="rounded-xl p-3 mt-2 text-[13px]" data-testid="resultado-teste-visitante"
            style={{ background: !resultado.ok ? "#ffeef0" : resultado.vaiParaAtendente ? "#fff7e0" : "var(--surface-2, rgba(0,0,0,.03))", color: !resultado.ok ? "#9e1d2f" : undefined }}>
            {!resultado.ok ? resultado.mensagem : (
              <>
                {resultado.vaiParaAtendente && <p className="font-bold text-[12px]" style={{ color: "#8a5a00" }} data-testid="teste-visitante-atendente">Isso iria para o atendente (a IA não soube responder).</p>}
                <p className="whitespace-pre-wrap mt-0.5" data-testid="teste-visitante-resposta">{resultado.resposta}</p>
                <p className="text-[11px] mt-1" style={{ color: "var(--muted)" }} data-testid="teste-visitante-usando">
                  A IA recebeu: {resultado.usando.script > 0 ? `seu script (${resultado.usando.script.toLocaleString("pt-BR")} caracteres)` : "SEM script seu (salve o script acima)"} • {resultado.usando.material > 0 ? `material comercial (${resultado.usando.material.toLocaleString("pt-BR")} caracteres)` : "SEM material comercial"} • {resultado.usando.planos} plano(s) visível(is), {resultado.usando.promocoes} com promoção.
                </p>
                <p className="text-[11px] mt-1" style={{ color: "var(--muted)" }}>Interesse percebido: {resultado.temperatura === "QUENTE" ? "Quente" : resultado.temperatura === "FRIO" ? "Frio" : "Morno"}</p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
