// Definir nova senha pelo link de uso único enviado ao e-mail (decisão #164 — S9 do Módulo 1). Página pública.
// O código vem no fragmento do endereço (#t=…), lido só no navegador.
import type { Metadata } from "next";
import DefinirSenhaForm from "./DefinirSenhaForm";

export const metadata: Metadata = { title: "Definir nova senha — FilaPro Leads", robots: { index: false, follow: false } };

export default function DefinirSenhaPage() {
  return <DefinirSenhaForm />;
}
