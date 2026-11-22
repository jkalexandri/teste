"use client";

// Ativar / desativar a verificação em duas etapas e gerar códigos de recuperação (decisão #105).
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/app/Toast";
import { confirmarAtivacao, desativar, iniciarAtivacao, novosCodigos } from "./actions";

export default function DoisFatores({ ativo, restantes }: { ativo: boolean; restantes: number }) {
  const toast = useToast();
  const router = useRouter();
  const [passo, setPasso] = useState<{ qr: string; segredo: string } | null>(null);
  const [codigo, setCodigo] = useState("");
  const [codigos, setCodigos] = useState<string[] | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function rodar(f: () => Promise<{ ok: boolean; mensagem: string; qr?: string; segredo?: string; codigos?: string[] }>) {
    setOcupado(true);
    const r = await f();
    setOcupado(false);
    toast(r.mensagem, r.ok ? "ok" : "erro");
    if (!r.ok) return;
    if (r.qr && r.segredo) setPasso({ qr: r.qr, segredo: r.segredo });
    if (r.codigos) { setCodigos(r.codigos); setPasso(null); }
    setCodigo("");
    router.refresh();
  }

  const campoCodigo = (
    <input className="input !w-[150px] text-center tracking-[.25em] font-bold" value={codigo} inputMode="numeric" maxLength={6} placeholder="000000"
      aria-label="Código de 6 dígitos" onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ""))} />
  );

  if (codigos) {
    return (
      <div data-testid="codigos-recuperacao">
        <h2 className="font-extrabold text-[15px]">Guarde os códigos de recuperação</h2>
        <p className="text-[12px] mt-1" style={{ color: "var(--muted)" }}>Se perder o celular, cada código permite entrar uma vez. <b>Eles não aparecem de novo.</b> Guarde num lugar seguro (fora do celular).</p>
        <div className="grid grid-cols-2 gap-1.5 mt-3 font-mono text-[14px] font-bold max-w-[320px]">{codigos.map((c) => <span key={c} className="rounded-lg px-2 py-1 text-center" style={{ background: "var(--primary-soft)" }}>{c}</span>)}</div>
        <div className="flex gap-2 mt-3">
          <button type="button" className="btn-ghost" onClick={() => navigator.clipboard.writeText(codigos.join("\n")).then(() => toast("Códigos copiados.", "ok"), () => undefined)}>Copiar</button>
          <button type="button" className="btn-primary" onClick={() => setCodigos(null)}>Já guardei</button>
        </div>
      </div>
    );
  }

  if (ativo) {
    return (
      <div>
        <p className="text-[13px]" data-testid="estado-2fa"><b style={{ color: "#16a34a" }}>✓ Verificação em duas etapas ativa.</b> A cada entrada, depois da senha, o sistema pede o código do app.</p>
        <p className="text-[12px] mt-1" style={{ color: restantes <= 3 ? "#b42318" : "var(--muted)" }}>Códigos de recuperação restantes: <b>{restantes}</b></p>
        <div className="flex flex-wrap items-end gap-2 mt-3">
          <div><label className="label">Código atual do app</label>{campoCodigo}</div>
          <button type="button" className="btn-ghost" disabled={ocupado || codigo.length !== 6} onClick={() => rodar(() => novosCodigos(codigo))}>Gerar novos códigos de recuperação</button>
          <button type="button" className="btn-ghost" style={{ color: "#b42318" }} disabled={ocupado || codigo.length !== 6} onClick={() => { if (confirm("Desativar a verificação em duas etapas? A conta fica protegida só pela senha.")) void rodar(() => desativar(codigo)); }}>Desativar</button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <p className="text-[13px]" data-testid="estado-2fa"><b style={{ color: "#b42318" }}>Desativada.</b> Recomendado: ative para que ninguém entre só com a sua senha.</p>
      {!passo ? (
        <>
          <ol className="text-[12px] mt-2 list-decimal pl-5 space-y-0.5" style={{ color: "var(--muted)" }}>
            <li>Instale um app autenticador no celular (Google Authenticator, Microsoft Authenticator ou Authy).</li>
            <li>Clique em <b>Ativar</b> e leia o QR Code com o app.</li>
            <li>Digite o código de 6 dígitos que aparece no app e guarde os códigos de recuperação.</li>
          </ol>
          <button type="button" className="btn-primary mt-3" disabled={ocupado} onClick={() => rodar(iniciarAtivacao)}>Ativar</button>
        </>
      ) : (
        <div className="mt-3 flex flex-wrap gap-4 items-start" data-testid="ativacao-2fa">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={passo.qr} alt="QR Code para o app autenticador" width={180} height={180} className="rounded-lg bg-white p-1" />
          <div className="grid gap-2">
            <p className="text-[12px]">Não consegue ler? Digite no app a chave:<br /><b className="font-mono text-[13px]" data-testid="segredo-2fa">{passo.segredo}</b></p>
            <div><label className="label">Código de 6 dígitos do app</label>{campoCodigo}</div>
            <button type="button" className="btn-primary" disabled={ocupado || codigo.length !== 6} onClick={() => rodar(() => confirmarAtivacao(codigo))}>Confirmar e ativar</button>
          </div>
        </div>
      )}
    </div>
  );
}
