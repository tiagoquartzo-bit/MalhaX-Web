import Link from "next/link";
import { createClient } from "../../lib/supabase/server";
import { signOut } from "../login/actions";

export default async function DriverAccessPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, background: "linear-gradient(145deg, #070e1a, #0a1628 58%, #091522)", color: "#e8f2ff", fontFamily: 'Inter, "Segoe UI", system-ui, sans-serif' }}>
    <section style={{ width: "min(100%, 560px)", padding: 32, border: "1px solid #20344c", borderRadius: 20, background: "#0d1b2a", boxShadow: "0 24px 70px #0006" }}>
      <p style={{ color: "#41dce5", fontSize: 12, fontWeight: 800, letterSpacing: ".16em" }}>MALHAX · ACESSO DO MOTORISTA</p>
      <h1 style={{ margin: "12px 0", fontSize: "clamp(1.7rem, 5vw, 2.2rem)" }}>Sua conta é de motorista</h1>
      <p style={{ color: "#b7c7d9", lineHeight: 1.7 }}>O Backoffice é reservado aos gestores e à equipe operacional. Para abrir suas viagens, registrar paradas e iniciar a navegação, use o app MalhaX para motoristas.</p>
      <p style={{ color: "#91a6bc", lineHeight: 1.7 }}>Se o app ainda não estiver instalado neste celular ou você não conseguir entrar nele, peça ao gestor da sua empresa o link de instalação e a confirmação do seu convite. Esta página não altera sua conta nem seus dados.</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 24 }}>
        {user ? <form action={signOut}><button type="submit" style={{ minHeight: 44, padding: "0 18px", border: 0, borderRadius: 10, background: "#00c2cb", color: "#071522", fontWeight: 800, cursor: "pointer" }}>Sair desta conta</button></form> : null}
        <Link href="/login" style={{ display: "inline-flex", minHeight: 44, alignItems: "center", padding: "0 18px", border: "1px solid #31455a", borderRadius: 10, color: "#d6e6f5", textDecoration: "none" }}>Voltar ao login</Link>
      </div>
    </section>
  </main>;
}
