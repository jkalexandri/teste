"use client";

// Tela Empresa | IA (etapa 9b): dados da empresa, materiais (Link/Site, Texto, Imagem, PDF),
// lista com "Esquecer" e "Ler de novo" e a ficha montada pela IA.
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X } from "@/components/icons";
import { useToast } from "@/components/app/Toast";
import CampoTextoGrande from "@/components/app/CampoTextoGrande";
import { adicionarLink, adicionarTexto, enviarMaterialArquivo, esquecerMaterial, estadoEmpresaIA, lerDeNovo, salvarCampos } from "./actions";

type Campos = { nome: string; endereco: string; telefone: string; whatsapp: string; atividade: string; comoQualificar: string };
type Material = {
  id: string; tipo: "LINK" | "TEXTO" | "IMAGEM" | "PDF"; origem: string; status: "LENDO" | "PRONTO" | "ERRO";
  resumo: string; paginas: number; erro: string | null; criadoEm: string; lidoEm: string | null;
};
type Uso = { materiais: number; limiteMateriais: number | null; paginasMes: number; limitePaginasMes: number | null };
type Aba = "LINK" | "TEXTO" | "IMAGEM" | "PDF";

const ABAS: { id: Aba; rotulo: string; dica: string }[] = [
  { id: "LINK", rotulo: "Link / Site", dica: "A página e as páginas do mesmo site ligadas a ela (até 20)." },
  { id: "TEXTO", rotulo: "Texto", dica: "Cole ou escreva informações: produtos, preços, perguntas frequentes…" },
  { id: "IMAGEM", rotulo: "Imagem", dica: "JPG ou PNG até 5 MB. A IA lê os textos e descreve a imagem." },
  { id: "PDF", rotulo: "PDF", dica: "Até 20 MB e 100 páginas. PDF escaneado (só imagem) não tem texto para ler." },
];
const TIPO: Record<Material["tipo"], string> = { LINK: "Link / Site", TEXTO: "Texto", IMAGEM: "Imagem", PDF: "PDF" };
const STATUS: Record<Material["status"], { rotulo: string; cor: string }> = {
  LENDO: { rotulo: "Lendo…", cor: "#b54708" },
  PRONTO: { rotulo: "Aprendido", cor: "#067647" },
  ERRO: { rotulo: "Erro", cor: "#b42318" },
};
const dataHora = (iso: string) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
const limiteTxt = (usado: number, limite: number | null) => `${usado.toLocaleString("pt-BR")} / ${limite == null ? "ilimitado" : limite.toLocaleString("pt-BR")}`;

export default function TelaEmpresaIA(p: {
  podeEditar: boolean; treinarIA: boolean; servicoConfigurado: boolean; campos: Campos; resumo: string; resumoEm: string | null;
  montando: boolean; uso: Uso; materiais: Material[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [pendente, iniciar] = useTransition();
  const [aba, setAba] = useState<Aba | null>(null);
  const [verResumo, setVerResumo] = useState<Material | null>(null);
  const podeTreinar = p.podeEditar && p.treinarIA;
  const lendo = p.materiais.some((m) => m.status === "LENDO") || p.montando;

  // Enquanto houver leitura ou montagem em andamento, confere a cada 4 s; ao terminar, atualiza a tela
  useEffect(() => {
    if (!lendo) return;
    const t = setInterval(async () => {
      const e = await estadoEmpresaIA().catch(() => null);
      if (e && !e.lendo && !e.montando) router.refresh();
    }, 4000);
    return () => clearInterval(t);
  }, [lendo, router]);

  const rodar = (acao: () => Promise<{ ok: boolean; mensagem: string }>, depois?: () => void) =>
    iniciar(async () => {
      const r = await acao();
      toast(r.mensagem, r.ok ? "ok" : "erro");
      if (r.ok) depois?.();
      router.refresh();
    });

  return (
    <>
      {!p.treinarIA && p.podeEditar && (
        <div className="card p-3 mt-3 text-[12px] font-bold" style={{ color: "#b42318" }}>
          O treinamento da IA está desligado para esta conta. Você pode ver e editar os dados, mas não enviar materiais. Fale com o suporte.
        </div>
      )}
      {!p.servicoConfigurado && (
        <div className="card p-3 mt-3 text-[12px]" style={{ color: "#b54708" }}>O serviço 24/7 não está configurado: os materiais ficam aguardando leitura.</div>
      )}

      <div className="grid xl:grid-cols-2 gap-3 mt-3">
        {/* Dados da empresa */}
        <form
          className="card p-4"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            rodar(() => salvarCampos(fd));
          }}
        >
          <h2 className="font-display font-extrabold text-[16px]">Dados da empresa</h2>
          <fieldset disabled={!p.podeEditar || pendente} className="grid sm:grid-cols-2 gap-2 mt-2">
            <div className="sm:col-span-2">
              <label className="label" htmlFor="ei-nome">Nome da empresa</label>
              <input id="ei-nome" name="nome" className="input" defaultValue={p.campos.nome} maxLength={120} required />
            </div>
            <div className="sm:col-span-2">
              <label className="label" htmlFor="ei-endereco">Endereço</label>
              <input id="ei-endereco" name="endereco" className="input" defaultValue={p.campos.endereco} maxLength={300} />
            </div>
            <div>
              <label className="label" htmlFor="ei-telefone">Telefone</label>
              <input id="ei-telefone" name="telefone" className="input" defaultValue={p.campos.telefone} maxLength={40} />
            </div>
            <div>
              <label className="label" htmlFor="ei-whatsapp">WhatsApp</label>
              <input id="ei-whatsapp" name="whatsapp" className="input" defaultValue={p.campos.whatsapp} maxLength={40} />
            </div>
            <div className="sm:col-span-2">
              <label className="label" htmlFor="ei-atividade">Atividade da empresa</label>
              <textarea id="ei-atividade" name="atividade" className="input min-h-[90px]" defaultValue={p.campos.atividade} maxLength={2000}
                placeholder="Ex.: imobiliária em Campinas, venda e aluguel de apartamentos e casas…" />
            </div>
            <div className="sm:col-span-2">
              <label className="label" htmlFor="ei-qualificar">Como qualificar os leads (opcional)</label>
              {/* Clicar abre o editor grande em popup (decisão #120) */}
              <CampoTextoGrande id="ei-qualificar" name="comoQualificar" rotulo="Como qualificar os leads" valorInicial={p.campos.comoQualificar} maxLength={2000}
                placeholder="Ex.: pergunte o bairro, o valor que pretende investir e quando quer se mudar."
                ajuda="Orientação que a IA segue em todas as conversas, junto com a Ficha da IA. Vazio = critério geral (interesse, prazo e orçamento)." />
              <p className="help mt-0.5">Vazio = a IA usa o critério geral (interesse, prazo e orçamento).</p>
            </div>
          </fieldset>
          {p.podeEditar && (
            <div className="flex justify-end mt-3">
              <button type="submit" className="btn-primary" disabled={pendente}>Salvar dados</button>
            </div>
          )}
        </form>

        {/* Ficha montada pela IA */}
        <div className="card p-4 flex flex-col">
          <div className="flex flex-wrap justify-between items-start gap-2">
            <div>
              <h2 className="font-display font-extrabold text-[16px]">Ficha da IA</h2>
              <p className="help">Resumo de tamanho fixo que a IA usa (economiza nas conversas).</p>
            </div>
            <span className="text-[11px] font-bold" style={{ color: p.montando ? "#b54708" : "var(--muted)" }}>
              {p.montando ? "Atualizando…" : p.resumoEm ? `Atualizada em ${dataHora(p.resumoEm)}` : "Ainda não montada"}
            </span>
          </div>
          <div className="mt-2 p-3 rounded-lg text-[12px] leading-relaxed whitespace-pre-wrap flex-1 overflow-auto max-h-[360px]"
            style={{ background: "var(--surface-2, rgba(0,0,0,.04))" }} data-testid="ficha-ia">
            {p.resumo || "A ficha aparece aqui depois que você salvar os dados ou enviar o primeiro material."}
          </div>
        </div>
      </div>

      {/* Materiais */}
      <div className="card p-4 mt-3">
        <div className="flex flex-wrap justify-between items-center gap-2">
          <div>
            <h2 className="font-display font-extrabold text-[16px]">Materiais</h2>
            <p className="help">Materiais enviados no período do plano: {limiteTxt(p.uso.materiais, p.uso.limiteMateriais)} • Páginas lidas neste mês: {limiteTxt(p.uso.paginasMes, p.uso.limitePaginasMes)}</p>
          </div>
          {podeTreinar && (
            <div className="flex flex-wrap gap-1.5">
              {ABAS.map((a) => (
                <button key={a.id} type="button" className="btn-ghost !py-1.5 !px-3 !text-[12px]" onClick={() => setAba(a.id)} disabled={pendente}>
                  + {a.rotulo}
                </button>
              ))}
            </div>
          )}
        </div>

        {p.materiais.length === 0 ? (
          <p className="text-[12px] mt-3" style={{ color: "var(--muted)" }}>Nenhum material ainda.</p>
        ) : (
          <div className="table-wrap mt-3">
            <table style={{ minWidth: 760, fontSize: 12 }}>
              <thead><tr><th>Material</th><th>Tipo</th><th>Situação</th><th>Páginas</th><th>Enviado em</th><th>Ações</th></tr></thead>
              <tbody>
                {p.materiais.map((m) => (
                  <tr key={m.id}>
                    <td className="font-bold [overflow-wrap:anywhere] max-w-[320px]">
                      {m.tipo === "LINK" ? <a href={m.origem} target="_blank" rel="noreferrer noopener" className="underline">{m.origem}</a> : m.origem}
                      {m.erro && m.status === "ERRO" && <p className="font-normal mt-0.5" style={{ color: "#b42318" }}>{m.erro}</p>}
                    </td>
                    <td>{TIPO[m.tipo]}</td>
                    <td style={{ color: STATUS[m.status].cor, fontWeight: 700, whiteSpace: "nowrap" }}>{STATUS[m.status].rotulo}</td>
                    <td>{m.status === "PRONTO" ? m.paginas : "—"}</td>
                    <td style={{ whiteSpace: "nowrap" }}>{dataHora(m.criadoEm)}</td>
                    <td>
                      <div className="flex gap-1">
                        {m.status === "PRONTO" && (
                          <button type="button" className="btn-ghost !py-1 !px-2 !text-[11px]" onClick={() => setVerResumo(m)}>Ver resumo</button>
                        )}
                        {podeTreinar && m.status !== "LENDO" && m.tipo !== "TEXTO" && (
                          <button type="button" className="btn-ghost !py-1 !px-2 !text-[11px]" disabled={pendente} onClick={() => rodar(() => lerDeNovo(m.id))}>Ler de novo</button>
                        )}
                        {podeTreinar && m.status === "ERRO" && m.tipo === "TEXTO" && (
                          <button type="button" className="btn-ghost !py-1 !px-2 !text-[11px]" disabled={pendente} onClick={() => rodar(() => lerDeNovo(m.id))}>Tentar de novo</button>
                        )}
                        {p.podeEditar && (
                          <button type="button" className="btn-ghost !py-1 !px-2 !text-[11px]" style={{ color: "#b42318" }} disabled={pendente}
                            onClick={() => window.confirm(`Esquecer “${m.origem}”? A IA deixa de usar este material.`) && rodar(() => esquecerMaterial(m.id))}>
                            Esquecer
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Popups de cada tipo de material */}
      {aba && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3" style={{ background: "rgba(10,20,15,.55)" }} role="dialog" aria-modal="true" aria-label={`Adicionar ${ABAS.find((a) => a.id === aba)!.rotulo}`}>
          <form
            className="card w-full max-w-[520px] p-4"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const acao = aba === "LINK" ? adicionarLink : aba === "TEXTO" ? adicionarTexto : enviarMaterialArquivo;
              rodar(() => acao(fd), () => setAba(null));
            }}
          >
            <div className="flex justify-between items-start">
              <h2 className="font-display font-extrabold text-[16px]">Adicionar {ABAS.find((a) => a.id === aba)!.rotulo}</h2>
              <button type="button" className="btn-ghost !p-1.5" onClick={() => setAba(null)} aria-label="Fechar"><X size={14} /></button>
            </div>
            <p className="help mt-1">{ABAS.find((a) => a.id === aba)!.dica}</p>
            <fieldset disabled={pendente} className="mt-3 grid gap-2">
              {aba === "LINK" && (
                <div>
                  <label className="label" htmlFor="mat-url">Endereço</label>
                  <input id="mat-url" name="url" className="input" placeholder="https://suaempresa.com.br" required autoFocus />
                </div>
              )}
              {aba === "TEXTO" && (
                <>
                  <div>
                    <label className="label" htmlFor="mat-titulo">Título</label>
                    <input id="mat-titulo" name="titulo" className="input" placeholder="Ex.: Tabela de preços" maxLength={120} />
                  </div>
                  <div>
                    <label className="label" htmlFor="mat-texto">Texto</label>
                    <textarea id="mat-texto" name="texto" className="input min-h-[180px]" required maxLength={50000} />
                  </div>
                </>
              )}
              {(aba === "IMAGEM" || aba === "PDF") && (
                <div>
                  <label className="label" htmlFor="mat-arquivo">Arquivo</label>
                  <input type="hidden" name="esperado" value={aba} />
                  <input id="mat-arquivo" name="arquivo" type="file" className="input !py-1.5" required accept={aba === "PDF" ? "application/pdf" : "image/jpeg,image/png"} />
                </div>
              )}
            </fieldset>
            <div className="flex justify-end gap-2 mt-3">
              <button type="button" className="btn-ghost" onClick={() => setAba(null)} disabled={pendente}>Cancelar</button>
              <button type="submit" className="btn-primary" disabled={pendente}>{pendente ? "Enviando…" : "Ensinar a IA"}</button>
            </div>
          </form>
        </div>
      )}

      {verResumo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3" style={{ background: "rgba(10,20,15,.55)" }} role="dialog" aria-modal="true" aria-label="Resumo do material">
          <div className="card w-full max-w-[560px] p-4">
            <div className="flex justify-between items-start gap-2">
              <h2 className="font-display font-extrabold text-[16px] [overflow-wrap:anywhere]">{verResumo.origem}</h2>
              <button type="button" className="btn-ghost !p-1.5" onClick={() => setVerResumo(null)} aria-label="Fechar"><X size={14} /></button>
            </div>
            <p className="text-[12px] leading-relaxed whitespace-pre-wrap mt-2 max-h-[60vh] overflow-auto">{verResumo.resumo}</p>
          </div>
        </div>
      )}
    </>
  );
}
