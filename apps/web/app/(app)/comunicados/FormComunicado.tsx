"use client";

// Formulário da mensagem aos usuários (decisão #102): título, texto, link e validade opcionais, e o público.
import { useRef, useState } from "react";
import { useToast } from "@/components/app/Toast";
import { enviarComunicado } from "./actions";

type Opcao = { id: string; rotulo: string };

export default function FormComunicado({ empresas, usuarios }: { empresas: Opcao[]; usuarios: Opcao[] }) {
  const toast = useToast();
  const form = useRef<HTMLFormElement>(null);
  const [publico, setPublico] = useState("todos");
  const [busca, setBusca] = useState("");
  const [escolhidos, setEscolhidos] = useState<string[]>([]);
  const [enviando, setEnviando] = useState(false);
  const filtrados = usuarios.filter((u) => !busca.trim() || u.rotulo.toLowerCase().includes(busca.trim().toLowerCase())).slice(0, 50);

  async function enviar(fd: FormData) {
    if (!confirm("Enviar esta mensagem? Ela aparece em popup na tela de quem recebe.")) return;
    setEnviando(true);
    escolhidos.forEach((id) => fd.append("selecionados", id));
    const r = await enviarComunicado(fd);
    setEnviando(false);
    toast(r.mensagem, r.ok ? "ok" : "erro");
    if (r.ok) { form.current?.reset(); setEscolhidos([]); setPublico("todos"); }
  }

  return (
    <form ref={form} action={enviar} className="grid gap-2" data-testid="form-comunicado">
      <div><label className="label" htmlFor="com-titulo">Título</label><input id="com-titulo" name="titulo" className="input" maxLength={120} required /></div>
      <div><label className="label" htmlFor="com-texto">Mensagem</label><textarea id="com-texto" name="texto" className="input min-h-[110px]" maxLength={3000} required /></div>
      <div className="flex flex-wrap gap-2">
        <div className="flex-1 min-w-[220px]"><label className="label" htmlFor="com-link">Link (opcional)</label><input id="com-link" name="link" className="input" placeholder="https://" /></div>
        <div><label className="label" htmlFor="com-validade">Vale até (opcional)</label><input id="com-validade" name="validoAte" type="date" className="input" /></div>
      </div>
      <div>
        <label className="label" htmlFor="com-publico">Quem recebe</label>
        <select id="com-publico" name="publico" className="input !w-auto" value={publico} onChange={(e) => setPublico(e.target.value)}>
          <option value="todos">Todos os clientes</option>
          <option value="admins">Admins das empresas</option>
          <option value="usuarios-empresa">Usuários das empresas</option>
          <option value="individuais">Usuários individuais</option>
          <optgroup label="Uma empresa (todos dela)">
            {empresas.map((e) => <option key={e.id} value={`empresa:${e.id}`}>{e.rotulo}</option>)}
          </optgroup>
          <option value="selecionados">Escolher usuários</option>
        </select>
      </div>
      {publico === "selecionados" && (
        <div className="rounded-lg p-2" style={{ border: "1px solid var(--border)" }}>
          <input className="input !py-1.5" placeholder="Buscar nome, e-mail ou empresa" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar usuários" />
          <p className="text-[11px] mt-1" data-testid="qtd-escolhidos">{escolhidos.length} escolhido{escolhidos.length === 1 ? "" : "s"}</p>
          <div className="max-h-[200px] overflow-y-auto mt-1">
            {filtrados.map((u) => (
              <label key={u.id} className="flex items-center gap-2 text-[12px] py-0.5">
                <input type="checkbox" checked={escolhidos.includes(u.id)} onChange={(e) => setEscolhidos((l) => (e.target.checked ? [...l, u.id] : l.filter((x) => x !== u.id)))} />
                {u.rotulo}
              </label>
            ))}
          </div>
        </div>
      )}
      <p className="text-[11px]" style={{ color: "var(--muted)" }}>Aparece em popup no centro da tela e só fecha com OK. Quem não estiver online vê no próximo acesso. Não vai por WhatsApp nem e-mail.</p>
      <div><button className="btn-primary" disabled={enviando}>{enviando ? "Enviando…" : "Enviar mensagem"}</button></div>
    </form>
  );
}
