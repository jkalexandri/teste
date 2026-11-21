"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/app/Toast";
import { Pencil, Plus, X } from "@/components/icons";
import { PERMISSOES } from "@/lib/menu";
import { alternarAtivo, criarUsuario, editarUsuario, excluirUsuario, resetarSenha } from "./actions";

type U = {
  id: string; nome: string; email: string; whatsapp: string; ativo: boolean; pendente: boolean;
  permissoes: string[]; ultimoAcesso: string | null;
};

export default function GestaoUsuarios({ usuarios, limite }: { usuarios: U[]; limite: number }) {
  const router = useRouter();
  const toast = useToast();
  const [pendente, iniciar] = useTransition();
  const [form, setForm] = useState<"novo" | U | null>(null);
  const [erro, setErro] = useState("");
  const [excluindo, setExcluindo] = useState<U | null>(null);
  const [destino, setDestino] = useState("");
  const [busca, setBusca] = useState("");

  const ativos = usuarios.filter((u) => u.ativo).length;
  const livres = limite - ativos;
  const lista = usuarios.filter((u) => (u.nome + u.email + u.whatsapp).toLowerCase().includes(busca.toLowerCase()));

  function agir(fn: () => Promise<{ ok: boolean; mensagem: string }>, depois?: () => void) {
    iniciar(async () => {
      const r = await fn();
      toast(r.mensagem, r.ok ? "ok" : "erro");
      if (r.ok) depois?.();
      router.refresh();
    });
  }

  const editando = form && form !== "novo" ? form : null;
  const outros = excluindo ? usuarios.filter((u) => u.id !== excluindo.id) : [];

  return (
    <>
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mt-3">
        {[
          { l: "Vagas do pacote em uso", v: `${ativos} / ${limite}` },
          { l: "Vagas livres", v: String(Math.max(0, livres)) },
          { l: "Desativados (não ocupam vaga)", v: String(usuarios.length - ativos) },
          { l: "Aguardando 1º acesso", v: String(usuarios.filter((u) => u.pendente).length) },
        ].map((c) => (
          <div key={c.l} className="card p-2.5">
            <div className="font-display text-[22px] font-extrabold leading-none">{c.v}</div>
            <div className="text-[11px] font-bold mt-1" style={{ color: "var(--muted)" }}>{c.l}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 mt-3">
        <button className="btn-primary" disabled={livres <= 0} onClick={() => { setErro(""); setForm("novo"); }}>
          <Plus size={14} /> Novo usuário
        </button>
        {livres <= 0 && <span className="text-[12px] font-semibold" style={{ color: "#8a5a00" }}>Limite do pacote atingido. Desative um usuário ou aumente o pacote.</span>}
      </div>

      <div className="card p-3 mt-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-display font-bold text-[14px]">Usuários da conta</h2>
          <span className="chip" style={{ background: "var(--surface-3)", color: "var(--muted)" }}>1 usuário por linha</span>
          <input className="input !w-full sm:!w-[240px] sm:ml-auto !py-1.5" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome, e-mail ou WhatsApp" />
        </div>
        {lista.length === 0 ? (
          <p className="text-[12px] mt-2" style={{ color: "var(--muted)" }}>Nenhum usuário cadastrado ainda.</p>
        ) : (
          <div className="table-wrap mt-2">
            <table style={{ minWidth: 960, fontSize: 12 }}>
              <thead><tr><th>Usuário</th><th>Permissões</th><th>Status</th><th>Último acesso</th><th>Ações</th></tr></thead>
              <tbody>
                {lista.map((u) => (
                  <tr key={u.id} style={{ height: 42 }}>
                    <td style={{ whiteSpace: "nowrap", maxWidth: 320 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                        <span style={{ width: 28, height: 28, borderRadius: 999, background: "var(--primary)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 12, flexShrink: 0 }}>
                          {u.nome.trim()[0]?.toUpperCase() || "?"}
                        </span>
                        <span title={`${u.nome} • ${u.email} • ${u.whatsapp}`} style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                          <b>{u.nome}</b><span style={{ color: "var(--muted)" }}> • {u.email}</span>
                        </span>
                      </div>
                    </td>
                    <td className="text-[11px]" style={{ color: "var(--muted)" }}>
                      {PERMISSOES.filter((p) => u.permissoes.includes(p.id)).map((p) => p.label).join(", ") || "Nenhuma"}
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <span className="chip" style={u.ativo ? { background: "var(--primary-soft)", color: "#087a44" } : { background: "#f1f3f2", color: "#5b6b62" }}>
                        {u.ativo ? "Ativo" : "Desativado"}
                      </span>
                      {u.pendente && <span className="chip ml-1" style={{ background: "#fff7e0", color: "#8a5a00" }}>Senha temporária</span>}
                    </td>
                    <td style={{ whiteSpace: "nowrap", color: "var(--muted)" }}>
                      {u.ultimoAcesso ? new Date(u.ultimoAcesso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "Ainda não acessou"}
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <div style={{ display: "flex", gap: 4 }}>
                        <button className="btn-ghost !py-1 !px-1.5 !text-[11px]" onClick={() => { setErro(""); setForm(u); }}><Pencil size={11} /> Editar</button>
                        <button className="btn-ghost !py-1 !px-1.5 !text-[11px]" disabled={pendente} onClick={() => window.confirm(`Enviar nova senha temporária para ${u.email}?`) && agir(() => resetarSenha(u.id))}>Resetar senha</button>
                        <button className="btn-ghost !py-1 !px-1.5 !text-[11px]" disabled={pendente} onClick={() => window.confirm(`${u.ativo ? "Desativar" : "Reativar"} ${u.nome}?`) && agir(() => alternarAtivo(u.id))}>
                          {u.ativo ? "Desativar" : "Reativar"}
                        </button>
                        <button className="btn-ghost !py-1 !px-1.5 !text-[11px]" style={{ color: "#b42318" }} disabled={pendente} onClick={() => { setDestino(""); setExcluindo(u); }}>Excluir</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Novo / editar usuário */}
      {form && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3" style={{ background: "rgba(10,20,15,.55)" }} role="dialog" aria-modal="true" aria-label={editando ? "Editar usuário" : "Novo usuário"}>
          <form
            className="card w-full max-w-[560px] p-4"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              iniciar(async () => {
                const r = editando ? await editarUsuario(editando.id, fd) : await criarUsuario(fd);
                if (!r.ok) { setErro(r.mensagem); return; }
                toast(r.mensagem);
                setForm(null);
                router.refresh();
              });
            }}
          >
            <div className="flex items-start justify-between">
              <h2 className="font-display font-extrabold text-[16px]">{editando ? `Editar ${editando.nome}` : "Novo usuário"}</h2>
              <button type="button" className="btn-ghost !p-1.5" onClick={() => setForm(null)} aria-label="Fechar"><X size={14} /></button>
            </div>
            <div className="grid sm:grid-cols-2 gap-2.5 mt-3">
              <div><label className="label" htmlFor="u-nome">Nome completo</label><input id="u-nome" name="nome" className="input" defaultValue={editando?.nome} /></div>
              <div><label className="label" htmlFor="u-email">E-mail (login)</label><input id="u-email" name="email" type="email" className="input" defaultValue={editando?.email} /></div>
              <div className="sm:col-span-2"><label className="label" htmlFor="u-whats">WhatsApp próprio</label><input id="u-whats" name="whatsapp" className="input" placeholder="(11) 90000-0000" defaultValue={editando?.whatsapp} /></div>
            </div>
            <span className="label mt-3">Permissões</span>
            <div className="flex flex-wrap gap-2">
              {PERMISSOES.map((p) => (
                <label key={p.id} className="flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[12px] font-bold cursor-pointer" style={{ border: "1px solid var(--border)" }}>
                  <input type="checkbox" name="permissoes" value={p.id} defaultChecked={editando ? editando.permissoes.includes(p.id) : true} className="w-4 h-4 accent-emerald-600" />
                  {p.label}
                </label>
              ))}
            </div>
            <p className="help mt-2">Dashboard e WhatsApp ficam sempre liberados. O acesso vence junto com o pacote da empresa.</p>
            {!editando && <p className="help">Uma senha temporária é gerada e enviada para o e-mail do usuário.</p>}
            {erro && <p className="text-[12px] font-semibold text-[#b42318] mt-2">{erro}</p>}
            <div className="flex justify-end gap-2 mt-3">
              <button type="button" className="btn-ghost" onClick={() => setForm(null)}>Cancelar</button>
              <button className="btn-primary" disabled={pendente}>{pendente ? "Salvando…" : editando ? "Salvar alterações" : "Criar usuário e enviar senha"}</button>
            </div>
          </form>
        </div>
      )}

      {/* Excluir com transferência (decisão #49) */}
      {excluindo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3" style={{ background: "rgba(10,20,15,.55)" }} role="dialog" aria-modal="true" aria-label="Excluir usuário">
          <div className="card w-full max-w-[480px] p-4">
            <h2 className="font-display font-extrabold text-[16px]">Excluir {excluindo.nome}</h2>
            {outros.length > 0 ? (
              <>
                <p className="text-[12px] mt-1.5 leading-relaxed" style={{ color: "var(--muted)" }}>
                  Antes de excluir, escolha quem vai receber os leads, campanhas e conversas de {excluindo.nome}.
                </p>
                <label className="label mt-3" htmlFor="destino">Transferir dados para</label>
                <select id="destino" className="input" value={destino} onChange={(e) => setDestino(e.target.value)}>
                  <option value="">Selecione um usuário</option>
                  {outros.map((o) => <option key={o.id} value={o.id}>{o.nome} — {o.email}{o.ativo ? "" : " (desativado)"}</option>)}
                </select>
              </>
            ) : (
              <p className="text-[12px] mt-1.5 leading-relaxed" style={{ color: "var(--muted)" }}>
                Não há outro usuário na empresa para receber os dados. A exclusão é definitiva.
              </p>
            )}
            <div className="flex justify-end gap-2 mt-4">
              <button className="btn-ghost" onClick={() => setExcluindo(null)}>Cancelar</button>
              <button
                className="btn-primary"
                style={{ background: "#e5484d" }}
                disabled={pendente || (outros.length > 0 && !destino)}
                onClick={() => agir(() => excluirUsuario(excluindo.id, destino || null), () => setExcluindo(null))}
              >
                Excluir definitivamente
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
