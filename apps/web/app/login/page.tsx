import LoginScreen from "@/components/login/LoginScreen";
import AvisoManutencao from "@/components/login/AvisoManutencao";

export default function LoginPage() {
  return (
    <>
      <LoginScreen />
      {/* Decisão #103: aviso de atualização por cima (não altera o login) */}
      <AvisoManutencao />
    </>
  );
}
