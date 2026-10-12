import { createClient } from "../../lib/supabase/server";
import { signOut } from "../login/actions";

export default async function AccessUnavailablePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, background: "#070e1a", color: "#f5f8fc" }}>
      <section style={{ width: "100%", maxWidth: 520, padding: 32, border: "1px solid #26364c", borderRadius: 20, background: "#0d1929" }}>
        <p style={{ color: "#00c4d2", fontSize: 12, fontWeight: 800, letterSpacing: 2 }}>MALHAX</p>
        <h1 style={{ margin: "12px 0", fontSize: 28 }}>Acesso operacional indisponível</h1>
        <p style={{ color: "#aab6c7", lineHeight: 1.7 }}>O Backoffice foi removido deste site. Sua conta continua cadastrada{user?.email ? ` (${user.email})` : ""}. Para acessar viagens como motorista, use o aplicativo MalhaX com uma conta de motorista.</p>
        <form action={signOut}><button type="submit" style={{ marginTop: 12, border: 0, borderRadius: 10, background: "#00c4d2", color: "#04111d", padding: "12px 18px", fontWeight: 700, cursor: "pointer" }}>Sair da conta</button></form>
      </section>
    </main>
  );
}
