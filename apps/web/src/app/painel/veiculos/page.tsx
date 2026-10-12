import { randomUUID } from "node:crypto";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "../../../lib/supabase/server";
import { VeiculoForm } from "./form";
import styles from "../clientes/clients.module.css";

const ROLES = new Set(["admin", "manager", "support"]);
type Vehicle = { id: string; plate: string; vehicle_type: "car" | "motorcycle" | "truck"; make_model: string | null; capacity_description: string | null; active: boolean; created_at: string };
const category: Record<Vehicle["vehicle_type"], string> = { car: "Carro", motorcycle: "Moto", truck: "Caminhão" };

export default async function VeiculosPage({ searchParams }: { searchParams: Promise<{ cadastro?: string }> }) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: roles } = await supabase.from("organization_member_roles").select("role").eq("user_id", user.id);
  if (!roles?.some(({ role }) => ROLES.has(role))) redirect("/painel");
  const { data, error } = await supabase.from("vehicles").select("id, plate, vehicle_type, make_model, capacity_description, active, created_at").order("plate").limit(500).overrideTypes<Vehicle[], { merge: false }>();
  const vehicles = data ?? [];
  return <main className={styles.page}>
    <p className={styles.back}><Link href="/painel">← Voltar ao painel</Link></p>
    <header className={styles.heading}><p className={styles.eyebrow}>MalhaX · cadastros</p><h1>Frota</h1><p>Cadastre os veículos da empresa para vinculá-los às viagens e comparar a operação por categoria.</p></header>
    {params.cadastro === "concluido" ? <p role="status" className={styles.success}>Veículo cadastrado e disponível no despacho.</p> : null}
    <div className={styles.columns}>
      <section className={styles.card}><p className={styles.eyebrow}>Novo cadastro</p><h2>Adicionar veículo</h2><VeiculoForm requestId={randomUUID()} /></section>
      <section className={styles.card}>
        <div className={styles.listHeading}><div><p className={styles.eyebrow}>Base da empresa</p><h2>Veículos cadastrados</h2></div><span className={styles.count}>{vehicles.length}</span></div>
        {error ? <p role="alert" className={styles.error}>Não foi possível carregar os veículos. Confira a migration e as permissões do banco.</p> : null}
        {!error && vehicles.length === 0 ? <p className={styles.empty}>Nenhum veículo cadastrado ainda.</p> : null}
        {vehicles.length ? <ul className={styles.list}>{vehicles.map((vehicle) => <li key={vehicle.id} className={styles.item}>
          <span className={styles.avatar} aria-hidden="true">{vehicle.vehicle_type === "motorcycle" ? "M" : vehicle.vehicle_type === "truck" ? "C" : "A"}</span>
          <span className={styles.clientText}><strong>{vehicle.plate} · {category[vehicle.vehicle_type]}</strong><small>{[vehicle.make_model, vehicle.capacity_description].filter(Boolean).join(" · ") || "Detalhes não informados"}</small></span>
          <span className={vehicle.active ? styles.active : styles.inactive}>{vehicle.active ? "Ativo" : "Inativo"}</span>
        </li>)}</ul> : null}
        <Link className={styles.secondaryLink} href="/painel/despacho">Selecionar no despacho →</Link>
      </section>
    </div>
  </main>;
}
