import { randomUUID } from "node:crypto";
import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "../../../lib/supabase/server";
import { DespachoForm } from "./form";
import styles from "./page.module.css";

const PAPEIS_QUE_DESPACHAM = new Set(["admin", "manager", "dispatcher"]);

type ParadaRow = {
  id: string;
  order_id: string;
  stop_type: "pickup" | "delivery";
  address_label: string;
  address_line: string;
  district: string | null;
  city: string | null;
  created_at: string;
  order_stop_packages: Array<{ packages: { weight_kg: number | null } | null }>;
};
type PedidoRow = { id: string; order_number: number };
type MotoristaRow = { id: string; profile_id: string | null };
type PerfilRow = { id: string; full_name: string };
type VeiculoRow = { id: string; plate: string; make_model: string | null };

export default async function DespachoPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: papeis } = await supabase
    .from("organization_member_roles")
    .select("role")
    .eq("user_id", user.id);
  if (!papeis?.some(({ role }) => PAPEIS_QUE_DESPACHAM.has(role))) {
    return (
      <main className={styles.page}>
        <h1>Acesso restrito</h1>
        <p>Seu perfil não pode despachar viagens.</p>
        <Link href="/painel">Voltar ao painel</Link>
      </main>
    );
  }

  const [stopsResult, driversResult, vehiclesResult] = await Promise.all([
    supabase.from("order_stops")
      .select("id, order_id, stop_type, address_label, address_line, district, city, created_at, order_stop_packages(packages(weight_kg))")
      .in("status", ["pending_dispatch", "exception"])
      .order("created_at", { ascending: true })
      .limit(1000)
      .overrideTypes<ParadaRow[], { merge: false }>(),
    supabase.from("drivers")
      .select("id, profile_id")
      .eq("status", "active")
      .order("created_at", { ascending: true })
      .limit(250)
      .overrideTypes<MotoristaRow[], { merge: false }>(),
    supabase.from("vehicles")
      .select("id, plate, make_model")
      .eq("active", true)
      .order("plate", { ascending: true })
      .limit(250)
      .overrideTypes<VeiculoRow[], { merge: false }>(),
  ]);

  const orderIds = [...new Set((stopsResult.data ?? []).map((stop) => stop.order_id))];
  const profileIds = [...new Set((driversResult.data ?? []).flatMap((driver) => driver.profile_id ? [driver.profile_id] : []))];
  const [pedidosResult, perfisResult] = await Promise.all([
    orderIds.length
      ? supabase.from("orders").select("id, order_number").in("id", orderIds).overrideTypes<PedidoRow[], { merge: false }>()
      : Promise.resolve({ data: [] as PedidoRow[], error: null }),
    profileIds.length
      ? supabase.from("profiles").select("id, full_name").in("id", profileIds).overrideTypes<PerfilRow[], { merge: false }>()
      : Promise.resolve({ data: [] as PerfilRow[], error: null }),
  ]);

  const pedidos = pedidosResult.data;
  const perfis = perfisResult.data;
  const numeroPedidoPorId = new Map((pedidos ?? []).map((pedido) => [pedido.id, pedido.order_number]));
  const nomePorPerfilId = new Map((perfis ?? []).map((perfil) => [perfil.id, perfil.full_name]));
  const paradas = (stopsResult.data ?? []).flatMap((stop) => {
    const order_number = numeroPedidoPorId.get(stop.order_id);
    if (order_number === undefined) return [];
    const pesoTotalKg = stop.order_stop_packages.reduce((sum, link) => sum + Number(link.packages?.weight_kg ?? 0), 0);
    const pesoInformadoCount = stop.order_stop_packages.filter((link) => link.packages?.weight_kg !== null && link.packages?.weight_kg !== undefined).length;
    return [{ ...stop, order_number, volumeCount: stop.order_stop_packages.length, pesoTotalKg, pesoInformadoCount }];
  });
  const motoristas = (driversResult.data ?? []).flatMap((driver) => {
    const name = driver.profile_id ? nomePorPerfilId.get(driver.profile_id) : undefined;
    return name ? [{ id: driver.id, name }] : [];
  });
  const veiculos = (vehiclesResult.data ?? []).map((vehicle) => ({
    id: vehicle.id,
    label: vehicle.make_model ? `${vehicle.plate} · ${vehicle.make_model}` : vehicle.plate,
  }));
  const dataError = stopsResult.error || driversResult.error || vehiclesResult.error || pedidosResult.error || perfisResult.error;

  return (
    <main className={styles.page}>
      <p className={styles.back}><Link href="/painel">← Voltar ao painel</Link></p>
      <header className={styles.pageHeading}>
        <p className={styles.eyebrow}>MalhaX · operação</p>
        <h1>Despachar viagem</h1>
        <p>Monte a sequência das paradas, atribua o motorista e programe a saída.</p>
      </header>

      {dataError ? (
        <p className={styles.error} role="alert">Não foi possível carregar os dados do despacho. Atualize a página; se o problema continuar, verifique as permissões do banco.</p>
      ) : (
        <DespachoForm
          paradas={paradas}
          motoristas={motoristas}
          veiculos={veiculos}
          requestId={randomUUID()}
        />
      )}
    </main>
  );
}
