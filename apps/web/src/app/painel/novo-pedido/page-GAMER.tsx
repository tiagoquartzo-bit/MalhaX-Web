import { randomUUID } from "node:crypto";
import Link from "next/link";

import { createClient } from "../../../lib/supabase/server";
import { NovoPedidoForm } from "./form-GAMER";

export default async function NovoPedidoPage() {
  const supabase = await createClient();

  // RLS limita a lista; a criação em si é validada de novo dentro da RPC create_order.
  const { data: clientes } = await supabase
    .from("clients")
    .select("id, name")
    .eq("active", true)
    .order("name");

  return (
    <main style={{ maxWidth: 920, margin: "0 auto", padding: "24px 16px" }}>
      <p>
        <Link href="/painel">← Voltar ao painel</Link>
      </p>
      <header style={{ margin: "28px 0 20px" }}>
        <p style={{ margin: "0 0 6px", color: "#087f8c", fontSize: 12, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase" }}>
          Operação · cadastro
        </p>
        <h1 style={{ color: "#102a43", fontSize: "clamp(1.8rem, 4vw, 2.4rem)", letterSpacing: "-.04em" }}>Novo pedido</h1>
        <p style={{ maxWidth: 620, marginTop: 10, color: "#52677a", lineHeight: 1.6 }}>
          Cadastre os volumes e adicione quantas coletas e entregas forem necessárias. Cada parada pode ter seu próprio endereço.
        </p>
      </header>
      <NovoPedidoForm clientes={clientes ?? []} requestId={randomUUID()} />
    </main>
  );
}
