// Tela de carregamento das áreas internas: ícone animado (decisão #86).
import IconeAnimado from "@/components/pwa/IconeAnimado";

export default function Carregando() {
  return (
    <div className="flex-1 flex items-center justify-center py-16" aria-label="Carregando">
      <IconeAnimado tamanho={72} />
    </div>
  );
}
