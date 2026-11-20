import { redirect } from "next/navigation";

// A raiz do domínio leva para o login.
export default function Home() {
  redirect("/login");
}
