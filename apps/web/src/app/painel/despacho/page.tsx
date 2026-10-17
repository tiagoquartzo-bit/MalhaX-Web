import { randomUUID } from "node:crypto";
import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "../../../lib/supabase/server";
import { getCurrentOrganizationRoles } from "../../../lib/supabase/organization-roles";
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
  latitude: number | null;
  longitude: number | null;
  created_at: string;
  order_stop_packages: Array<{ package_id: string; packages: { weight_kg: number | null } | null }>;
};
type PedidoRow = { id: string; order_number: number };
type MotoristaRow = { id: string; profile_id: string | null };
type PerfilRow = { id: string; full_name: string };
type VeiculoRow = { id: string; plate: string; vehicle_type: "car" | "motorcycle" | "truck"; make_model: string | null; capacity_kg: number | null };

export default async function DespachoPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { roles: papeis } = await getCurrentOrganizationRoles(supabase, user.id);
  if (!papeis.some((role) => PAPEIS_QUE_DESPACHAM.has(role))) {
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
      .select("id, order_id, stop_type, address_label, address_line, district, city, latitude, longitude, created_at, order_stop_packages(package_id, packages(weight_kg))")
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
      .select("id, plate, vehicle_type, make_model, capacity_kg")
      .eq("active", true)
      .order("plate", { ascending: true })
      .limit(250)
      .overrideTypes<VeiculoRow[], { merge: false }>(),
  ]);

  const stopsWithCoordinates = (stopsResult.data ?? []).filter((stop) => stop.latitude !== null && stop.longitude !== null);
  const unlocatedStopCount = (stopsResult.data ?? []).length - stopsWithCoordinates.length;
  const orderIds = [...new Set(stopsWithCoordinates.map((stop) => stop.order_id))];
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
  const paradas = stopsWithCoordinates.flatMap((stop) => {
    const order_number = numeroPedidoPorId.get(stop.order_id);
    if (order_number === undefined) return [];
    const pesoTotalKg = stop.order_stop_packages.reduce((sum, link) => sum + Number(link.packages?.weight_kg ?? 0), 0);
    const pesoInformadoCount = stop.order_stop_packages.filter((link) => link.packages?.weight_kg !== null && link.packages?.weight_kg !== undefined).length;
    const volumes = stop.order_stop_packages.map((link) => ({ id: link.package_id, weightKg: link.packages?.weight_kg === null || link.packages?.weight_kg === undefined ? null : Number(link.packages.weight_kg) }));
    return [{ id: stop.id, order_id: stop.order_id, stop_type: stop.stop_type, address_label: stop.address_label, address_line: stop.address_line, district: stop.district, city: stop.city, created_at: stop.created_at, latitude: stop.latitude, longitude: stop.longitude, order_number, volumes, volumeCount: stop.order_stop_packages.length, pesoTotalKg, pesoInformadoCount }];
  });
  const motoristas = (driversResult.data ?? []).flatMap((driver) => {
    const name = driver.profile_id ? nomePorPerfilId.get(driver.profile_id) : undefined;
    return name ? [{ id: driver.id, name }] : [];
  });
  const veiculos = (vehiclesResult.data ?? []).map((vehicle) => ({
    id: vehicle.id,
    label: `${vehicle.vehicle_type === "motorcycle" ? "Moto" : vehicle.vehicle_type === "truck" ? "Caminhão" : "Carro"} · ${vehicle.plate}${vehicle.make_model ? ` · ${vehicle.make_model}` : ""}${vehicle.capacity_kg ? ` · até ${Number(vehicle.capacity_kg).toLocaleString("pt-BR")} kg` : ""}`,
    capacityKg: vehicle.capacity_kg === null ? null : Number(vehicle.capacity_kg),
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
        <>
        {unlocatedStopCount > 0 ? <p className={styles.warning} role="status">{unlocatedStopCount} parada(s) pendente(s) ainda não têm localização confirmada e ficaram fora do despacho. Abra Coletas e entregas, localize os endereços no mapa e tente novamente.</p> : null}
        <DespachoForm
          paradas={paradas}
          motoristas={motoristas}
          veiculos={veiculos}
          requestId={randomUUID()}
        />
        </>
      )}
    </main>
  );
}
