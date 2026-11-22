// Ícone do app com as luzes correndo nos circuitos a cada 4,2 s (decisão #86 — versão animada).
// Usado na tela de abertura do app e nas telas de carregamento.
export default function IconeAnimado({ tamanho = 120 }: { tamanho?: number }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width={tamanho} height={tamanho} className="icone-animado" role="img" aria-label="FilaPro Leads">
      <defs>
        <linearGradient id="ia-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#25D366" /><stop offset="1" stopColor="#2dd4ff" /></linearGradient>
        <radialGradient id="ia-bg" cx=".3" cy=".25" r="1"><stop offset="0" stopColor="#0d2a26" /><stop offset="1" stopColor="#050d18" /></radialGradient>
        <filter id="ia-brilho" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
      </defs>
      <rect width="512" height="512" rx="112" fill="url(#ia-bg)" />
      <g stroke="#25D366" strokeOpacity=".22" strokeWidth="5" fill="none">
        <path d="M0 140 H120 L170 90 H260" /><circle cx="270" cy="90" r="9" />
        <path d="M512 380 H400 L350 430 H260" /><circle cx="250" cy="430" r="9" />
        <path d="M40 512 V440 L80 400" /><path d="M470 0 V70 L430 110" />
      </g>
      <g filter="url(#ia-brilho)" fill="none" strokeWidth="7" strokeLinecap="round">
        <path className="ia-feixe" d="M0 140 H120 L170 90 H260" stroke="#7dffb5" />
        <path className="ia-feixe ia-b" d="M512 380 H400 L350 430 H260" stroke="#a8f0ff" />
      </g>
      <circle className="ia-no" cx="270" cy="90" r="9" fill="#7dffb5" filter="url(#ia-brilho)" />
      <circle className="ia-no ia-b" cx="250" cy="430" r="9" fill="#a8f0ff" filter="url(#ia-brilho)" />
      <text x="256" y="318" textAnchor="middle" fontFamily="Sora, Arial, sans-serif" fontWeight="800" fontSize="210" letterSpacing="-8" fill="url(#ia-g)">FP</text>
    </svg>
  );
}
