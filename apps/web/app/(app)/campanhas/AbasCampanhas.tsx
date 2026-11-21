// Cabeçalho e abas de Campanhas (prompt seção 8): a aba Nova não mostra quantidade.
import Link from "next/link";

const ABAS = [
  { id: "nova", rotulo: "Nova" },
  { id: "em-andamento", rotulo: "Em andamento" },
  { id: "pausada", rotulo: "Pausada" },
  { id: "rascunho", rotulo: "Rascunho" },
  { id: "concluida", rotulo: "Concluída" },
  { id: "cancelada", rotulo: "Cancelada" },
];

export default function AbasCampanhas({ aba, contagens }: { aba: string; contagens: Record<string, number> }) {
  return (
    <>
      <div className="shrink-0 flex items-center justify-between gap-3">
        <h1 className="font-display font-extrabold leading-tight" style={{ fontSize: "clamp(24px,2.8vw,32px)" }}>Campanhas</h1>
        <Link href="/campanhas?aba=nova" className="btn-primary">Nova campanha</Link>
      </div>
      <nav className="flex gap-1.5 overflow-x-auto no-scrollbar mt-3 pb-1" aria-label="Abas de campanhas">
        {ABAS.map((a) => {
          const ativa = a.id === aba;
          return (
            <Link
              key={a.id}
              href={`/campanhas?aba=${a.id}`}
              className="shrink-0 px-3 py-1.5 rounded-full text-[12px] font-bold border"
              style={ativa ? { background: "var(--primary)", color: "#fff", borderColor: "var(--primary)" } : { borderColor: "var(--border)", background: "var(--surface)" }}
              aria-current={ativa ? "page" : undefined}
            >
              {a.rotulo}
              {a.id !== "nova" && <span className="ml-1 opacity-80">({contagens[a.id] ?? 0})</span>}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
