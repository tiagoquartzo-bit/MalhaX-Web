import { redirect } from "next/navigation";

// A antiga "Visão de controle" mostrava dados de demonstração. O Início do painel usa dados reais.
export default function ControlePage() {
  redirect("/painel");
}
