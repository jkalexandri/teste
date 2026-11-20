"use client";

// Popups do canto inferior: somem após 2 segundos (prompt seção 7).
// O aviso de expiração é outro componente e dura 10 segundos.
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { CircleCheck, TriangleAlert } from "@/components/icons";

type Toast = { id: number; texto: string; tipo: "ok" | "erro" };
const Ctx = createContext<(texto: string, tipo?: Toast["tipo"]) => void>(() => {});

export const DURACAO_TOAST_MS = 2000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [lista, setLista] = useState<Toast[]>([]);
  const mostrar = useCallback((texto: string, tipo: Toast["tipo"] = "ok") => {
    const id = Date.now() + Math.random();
    setLista((l) => [...l, { id, texto, tipo }]);
    window.setTimeout(() => setLista((l) => l.filter((t) => t.id !== id)), DURACAO_TOAST_MS);
  }, []);

  return (
    <Ctx.Provider value={mostrar}>
      {children}
      <div className="fixed bottom-3 left-3 z-50 flex flex-col gap-2 max-w-[340px]" aria-live="polite">
        {lista.map((t) => (
          <div key={t.id} className="card px-3 py-2 flex gap-2 text-[12px] font-semibold" role="status">
            {t.tipo === "ok" ? (
              <CircleCheck size={15} className="shrink-0" style={{ color: "var(--primary)" }} />
            ) : (
              <TriangleAlert size={15} className="shrink-0" style={{ color: "#e5484d" }} />
            )}
            {t.texto}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);
