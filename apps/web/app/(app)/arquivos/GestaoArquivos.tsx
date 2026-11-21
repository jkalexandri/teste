"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/app/Toast";
import { ANEXOS } from "@filapro/db/src/envio";
import { enviarArquivo, excluirArquivo } from "../campanhas/actions";

type A = { id: string; nome: string; tipo: string; tamanho: number; criadoEm: string; campanhas: string[] };
const mb = (b: number) => `${(b / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
const tipoTexto = (t: string) => (t.startsWith("image/") ? "Imagem" : t === "application/pdf" ? "PDF" : t.startsWith("video/") ? "Vídeo" : t.startsWith("audio/") ? "Áudio" : t);

export default function GestaoArquivos({ arquivos }: { arquivos: A[] }) {
  const router = useRouter();
  const toast = useToast();
  const [pendente, iniciar] = useTransition();
  return (
    <>
      <div className="card p-3 mt-3 flex flex-wrap items-center gap-2">
        <label className="label !mb-0" htmlFor="novo-arquivo">Enviar arquivo</label>
        <input
          id="novo-arquivo"
          type="file"
          className="input !py-1.5 !w-auto"
          accept={ANEXOS.flatMap((a) => a.tipos).join(",")}
          disabled={pendente}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            const fd = new FormData();
            fd.set("arquivo", f);
            iniciar(async () => {
              const r = await enviarArquivo(fd);
              toast(r.mensagem, r.ok ? "ok" : "erro");
              e.target.value = "";
              router.refresh();
            });
          }}
        />
        {pendente && <span className="text-[12px]">Enviando…</span>}
      </div>
      <div className="card p-3 mt-3">
        {arquivos.length === 0 ? (
          <p className="text-[12px]" style={{ color: "var(--muted)" }}>Nenhum arquivo ainda. Envie aqui ou na aba Mensagem da campanha.</p>
        ) : (
          <div className="table-wrap">
            <table style={{ minWidth: 720, fontSize: 12 }}>
              <thead><tr><th>Arquivo</th><th>Tipo</th><th>Tamanho</th><th>Usado em</th><th>Enviado em</th><th>Ações</th></tr></thead>
              <tbody>
                {arquivos.map((a) => (
                  <tr key={a.id}>
                    <td className="font-bold [overflow-wrap:anywhere]"><a href={`/api/arquivos/${a.id}`} target="_blank" rel="noreferrer" className="underline">{a.nome}</a></td>
                    <td>{tipoTexto(a.tipo)}</td>
                    <td style={{ whiteSpace: "nowrap" }}>{mb(a.tamanho)}</td>
                    <td>{a.campanhas.length ? a.campanhas.join(", ") : "—"}</td>
                    <td style={{ whiteSpace: "nowrap" }}>{new Date(a.criadoEm).toLocaleDateString("pt-BR")}</td>
                    <td>
                      <button className="btn-ghost !py-1 !px-2 !text-[11px]" style={{ color: "#b42318" }} disabled={pendente}
                        onClick={() => window.confirm(`Excluir ${a.nome}?`) && iniciar(async () => { const r = await excluirArquivo(a.id); toast(r.mensagem, r.ok ? "ok" : "erro"); router.refresh(); })}>
                        Excluir
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
