"use client";

// Editor de planos do Super Admin, com prévia ao vivo do popup.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { abasDoPlano, formatarReais, semPrecoDeVenda, type PlanoPublico } from "@/lib/planos";
import { PlanosComAbas } from "@/components/planos/PopupPlanos";
import { Eye, EyeOff, Pencil, Sparkles, X } from "@/components/icons";
import { useToast } from "@/components/app/Toast";
import CampoLimite from "@/components/app/CampoLimite";
import { alternarVisivel, definirDestaque, duplicarPlano, excluirPlano, moverPlano, novoPlano, salvarPlano } from "./actions";

const NOME_ABA = { ilimitado: "Mensal", quantidade: "Por disparo" } as const;
const NOME_MODULO = { INDIVIDUAL: "Individual", EMPRESARIAL: "Empresarial" } as const;

const reais = (c: number | null) => (c == null ? "" : (c / 100).toFixed(2).replace(".", ","));

export default function EditorPlanos({ planos }: { planos: PlanoPublico[] }) {
  const router = useRouter();
  const toast = useToast();
  const [editando, setEditando] = useState<PlanoPublico | null>(null);
  const [erroForm, setErroForm] = useState("");
  const [pendente, iniciar] = useTransition();

  const executar = (fn: () => Promise<{ ok: boolean; mensagem: string }>) =>
    iniciar(async () => {
      const r = await fn();
      if (r.mensagem) toast(r.mensagem, r.ok ? "ok" : "erro");
      router.refresh();
    });

  const visiveis = planos.filter((p) => p.visivel);
  const [novo, setNovo] = useState(false);

  return (
    <>
      {/* Novo plano (decisão #111): nasce oculto e sem preço */}
      <div className="card p-3 mt-3">
        {!novo ? (
          <button type="button" className="btn-primary" onClick={() => setNovo(true)}>+ Novo plano</button>
        ) : (
          <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            iniciar(async () => { const r = await novoPlano(fd); toast(r.mensagem, r.ok ? "ok" : "erro"); if (r.ok) { setNovo(false); router.refresh(); } });
          }}>
            <div><label className="label" htmlFor="novo-nome">Nome do plano</label><input id="novo-nome" name="nome" className="input !w-[220px]" required maxLength={60} /></div>
            <div><label className="label" htmlFor="novo-modulo">Módulo</label>
              <select id="novo-modulo" name="modulo" className="input !w-auto"><option value="EMPRESARIAL">Empresarial</option><option value="INDIVIDUAL">Individual</option></select></div>
            <button className="btn-primary" disabled={pendente}>Criar</button>
            <button type="button" className="btn-ghost" onClick={() => setNovo(false)}>Cancelar</button>
            <p className="help w-full">O plano nasce <b>oculto</b>. Depois clique em <b>Editar</b>: com “Disparos por período” preenchido ele vai para a aba <b>Por quantidade</b>; vazio, para <b>Sem limite</b>.</p>
          </form>
        )}
      </div>
      <div className="card p-3 mt-3">
        <div className="table-wrap">
          <table style={{ minWidth: 900 }}>
            <thead>
              <tr>
                <th>Ordem</th><th>Plano</th><th>Aba</th><th>Usuários</th><th>Preço</th><th>No popup</th><th>Destaque</th><th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {planos.map((p, i) => (
                <tr key={p.id} data-plano={p.nome}>
                  <td>
                    <div className="flex gap-1">
                      <button className="btn-ghost !px-2 !py-1" disabled={pendente || i === 0} onClick={() => executar(() => moverPlano(p.id, -1))} aria-label={`Subir ${p.nome}`}>↑</button>
                      <button className="btn-ghost !px-2 !py-1" disabled={pendente || i === planos.length - 1} onClick={() => executar(() => moverPlano(p.id, 1))} aria-label={`Descer ${p.nome}`}>↓</button>
                    </div>
                  </td>
                  <td className="font-bold">{p.nome}{p.gratis && <span className="chip ml-1" style={{ background: "var(--surface-3)", color: "var(--muted)" }}>Teste grátis</span>}</td>
                  <td className="text-[12px]" data-testid="aba-do-plano">{NOME_MODULO[p.modulo]} • {abasDoPlano(p).length > 1 ? "Mensal e Por disparo" : NOME_ABA[abasDoPlano(p)[0]!]}{p.disparosPorPeriodo ? <span className="help block">{p.disparosPorPeriodo.toLocaleString("pt-BR")}/{p.periodo}</span> : null}</td>
                  <td>{p.personalizado ? "Sob medida" : p.usuarios}</td>
                  <td>{p.gratis ? "Grátis" : p.personalizado && p.precoAtual == null ? "Sob consulta" : semPrecoDeVenda(p) ? <span style={{ color: "#b45309" }} data-testid="preco-em-breve">Em breve — defina o preço</span> : `${formatarReais(p.precoAtual!)}/${p.periodo}`}</td>
                  <td>
                    <button
                      className="btn-ghost !py-1 !px-2 !text-[11px]"
                      disabled={pendente}
                      onClick={() => executar(() => alternarVisivel(p.id, !p.visivel))}
                      style={p.visivel ? { background: "var(--primary-soft)", color: "var(--primary-dark)", borderColor: "var(--primary)" } : undefined}
                    >
                      {p.visivel ? <><Eye size={12} /> Aparece</> : <><EyeOff size={12} /> Oculto</>}
                    </button>
                  </td>
                  <td>
                    <button
                      className="btn-ghost !py-1 !px-2 !text-[11px]"
                      disabled={pendente || p.destaque}
                      onClick={() => executar(() => definirDestaque(p.id))}
                      style={p.destaque ? { background: "#0b2f1f", color: "#fff", borderColor: "#0b2f1f" } : undefined}
                    >
                      <Sparkles size={12} /> {p.destaque ? "Em destaque" : "Destacar"}
                    </button>
                  </td>
                  <td>
                    <div className="flex flex-wrap gap-1">
                      <button className="btn-ghost !py-1 !px-2 !text-[11px]" onClick={() => { setErroForm(""); setEditando(p); }}>
                        <Pencil size={12} /> Editar
                      </button>
                      {!p.gratis && <button className="btn-ghost !py-1 !px-2 !text-[11px]" disabled={pendente} onClick={() => executar(() => duplicarPlano(p.id))}>Duplicar</button>}
                      {!p.gratis && <button className="btn-ghost !py-1 !px-2 !text-[11px]" style={{ color: "#b42318" }} disabled={pendente}
                        onClick={() => { if (confirm(`Excluir o plano ${p.nome}? Só é possível se ninguém comprou.`)) executar(() => excluirPlano(p.id)); }}>Excluir</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-4">
        <h2 className="font-display font-bold text-[14px]">Prévia do popup</h2>
        <p className="help">É assim que o cliente vê ao clicar em “Planos” no login ({visiveis.length} {visiveis.length === 1 ? "plano visível" : "planos visíveis"}).</p>
        <div className="login-future rounded-[18px] p-4 mt-2 overflow-hidden">
          <div className="relative z-[1]">
            {visiveis.length === 0 ? (
              <div className="login-glass rounded-[18px] p-5 text-[13px] text-slate-300">Nenhum plano visível. Marque “Aparece” em pelo menos um plano.</div>
            ) : (
              <PlanosComAbas planos={visiveis} />
            )}
          </div>
        </div>
      </div>

      {editando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3" style={{ background: "rgba(10,20,15,.55)" }} role="dialog" aria-modal="true" aria-label={`Editar plano ${editando.nome}`}>
          <form
            className="card w-full max-w-[640px] flex flex-col overflow-hidden"
            style={{ maxHeight: "88vh" }}
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const id = editando.id;
              iniciar(async () => {
                const r = await salvarPlano(id, fd);
                if (!r.ok) { setErroForm(r.mensagem); return; }
                toast(r.mensagem);
                setEditando(null);
                router.refresh();
              });
            }}
          >
            <div className="flex items-start justify-between gap-2 px-4 pt-4 pb-3" style={{ borderBottom: "1px solid var(--border)" }}>
              <h2 className="font-display font-extrabold text-[16px]">Editar plano {editando.nome}</h2>
              <button type="button" className="btn-ghost !p-2" onClick={() => setEditando(null)} aria-label="Fechar"><X size={15} /></button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 grid sm:grid-cols-2 gap-2.5">
              <Campo nome="nome" rotulo="Nome do plano" valor={editando.nome} />
              <Campo nome="usuarios" rotulo={editando.personalizado ? "Usuários (opcional)" : "Quantidade de usuários (o Admin não conta)"} valor={editando.usuarios ?? ""} tipo="number" />
              {!editando.gratis && (
                <>
                  <Campo nome="precoAntigo" rotulo="Preço antigo (riscado) — R$" valor={reais(editando.precoAntigo)} dica="Deixe vazio para não mostrar." />
                  <Campo nome="precoAtual" rotulo="Preço atual — R$" valor={reais(editando.precoAtual)} dica={editando.personalizado ? "Vazio = “Sob consulta”." : undefined} />
                </>
              )}
              <Campo nome="periodo" rotulo="Período (aparece após o preço)" valor={editando.periodo} dica="Ex.: mês" />
              <Campo nome="prazoDias" rotulo="Prazo de acesso (dias)" valor={editando.prazoDias} tipo="number" />
              <CampoLimite
                valor={editando.limiteLeads}
                dica={editando.modulo === "EMPRESARIAL" ? "Limite da empresa (soma de todos os usuários). Pode ser ajustado em cada empresa." : "Máximo de leads da conta."}
              />
              <CampoLimite
                valor={editando.limiteMateriais ?? null}
                campo="limiteMateriais"
                id="f-limiteMateriais"
                rotulo="IA: máximo de materiais"
                placeholder="Máximo de materiais"
                dica="Materiais enviados por período do plano (Esquecer não devolve; zera na renovação)."
              />
              <CampoLimite
                valor={editando.limitePaginasMes ?? null}
                campo="limitePaginasMes"
                id="f-limitePaginasMes"
                rotulo="IA: páginas lidas por mês"
                placeholder="Máximo de páginas"
                dica="Cada página de site/PDF, imagem ou 3.000 letras de texto conta 1."
              />
              {editando.modulo === "INDIVIDUAL" && !editando.gratis && (
                <>
                  <Campo nome="maxWhatsapps" rotulo="WhatsApps por usuário (máximo, com o principal)" valor={editando.maxWhatsapps ?? 1} tipo="number" dica="1 = sem número extra." />
                  <Campo nome="precoWhatsappExtra" rotulo="Preço de cada WhatsApp extra — R$" valor={reais(editando.precoWhatsappExtra ?? null)} dica="Por período do plano. Comprado no meio do período, é proporcional." />
                </>
              )}
              {!editando.gratis && (
                <>
                  <Campo nome="disparosPorPeriodo" rotulo="Disparos por período (vazio = sem limite)" valor={editando.disparosPorPeriodo ?? ""} tipo="number" dica="Plano por quantidade de envio: só mensagens de campanha contam." />
                  <Campo nome="pacoteDisparos" rotulo="Pacote extra: quantidade de disparos" valor={editando.pacoteDisparos ?? ""} tipo="number" dica="Vazio = não vende pacote extra." />
                  <Campo nome="precoPacoteDisparos" rotulo="Pacote extra: preço — R$" valor={reais(editando.precoPacoteDisparos ?? null)} />
                </>
              )}
              <label className="flex items-start gap-2 cursor-pointer sm:col-span-2">
                <input type="checkbox" name="leadsAnuncios" id="f-leadsAnuncios" defaultChecked={!!editando.leadsAnuncios} className="w-4 h-4 mt-0.5 accent-emerald-600" />
                <span><b className="text-[13px]">Leads de anúncios incluído</b><span className="help block">Google Ads e Facebook/Instagram entram sozinhos e a IA atende (recurso pago).</span></span>
              </label>
              {editando.gratis && (
                <>
                  <Campo nome="testeDias" rotulo="Teste grátis: dias" valor={editando.testeDias ?? ""} tipo="number" />
                  <Campo nome="testeDisparos" rotulo="Teste grátis: disparos" valor={editando.testeDisparos ?? ""} tipo="number" dica="Vazio = teste por dias, sem limite de disparos (aba Mensal). Preenchido = teste por disparos (aba Por disparo)." />
                </>
              )}
              <Campo nome="selo" rotulo="Selo (canto do cartão)" valor={editando.selo} dica="Ex.: 80% de desconto" />
              <Campo nome="textoBotao" rotulo="Texto do botão" valor={editando.textoBotao} />
              <Campo nome="frase" rotulo="Frase curta" valor={editando.frase} area larga />
              <Campo nome="condicoes" rotulo="Condições (texto pequeno abaixo do botão)" valor={editando.condicoes} area larga />
              <Campo nome="ofertaTexto" rotulo="Caixa de oferta (deixe vazio para não mostrar)" valor={editando.ofertaTexto} area larga />
              <Campo nome="recursos" rotulo="Recursos (um por linha)" valor={editando.recursos.join("\n")} area larga linhas={5} />
            </div>
            {erroForm && <p className="mx-4 mb-2 text-[12px] font-semibold text-[#b42318]">{erroForm}</p>}
            <div className="flex justify-end gap-2 px-4 py-3" style={{ borderTop: "1px solid var(--border)" }}>
              <button type="button" className="btn-ghost" onClick={() => setEditando(null)}>Cancelar</button>
              <button type="submit" className="btn-primary" disabled={pendente}>{pendente ? "Salvando…" : "Salvar plano"}</button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

function Campo({ nome, rotulo, valor, tipo = "text", area, larga, linhas = 2, dica }: {
  nome: string; rotulo: string; valor: string | number; tipo?: string; area?: boolean; larga?: boolean; linhas?: number; dica?: string;
}) {
  return (
    <div className={larga ? "sm:col-span-2" : undefined}>
      <label className="label" htmlFor={`f-${nome}`}>{rotulo}</label>
      {area ? (
        <textarea id={`f-${nome}`} name={nome} className="input" rows={linhas} defaultValue={String(valor)} />
      ) : (
        <input id={`f-${nome}`} name={nome} className="input" type={tipo} min={tipo === "number" ? 0 : undefined} defaultValue={String(valor)} />
      )}
      {dica && <p className="help mt-0.5">{dica}</p>}
    </div>
  );
}
