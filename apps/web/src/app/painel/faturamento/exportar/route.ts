import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "../../../../lib/supabase/server";
import { getCurrentOrganizationRoles } from "../../../../lib/supabase/organization-roles";
import { lerPeriodo } from "../periodo";

const celula = (valor: unknown) => {
  const texto = valor === null || valor === undefined ? "" : String(valor);
  const seguro = /^[=+\-@]/.test(texto) ? `'${texto}` : texto; // evita fórmula ao abrir no Excel
  return /[";\n]/.test(seguro) ? `"${seguro.replace(/"/g, '""')}"` : seguro;
};
const numero = (valor: unknown) => Number(valor ?? 0).toFixed(2).replace(".", ",");

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url));
  const { roles } = await getCurrentOrganizationRoles(supabase, user.id);
  if (!roles.some((role) => ["admin", "manager", "finance"].includes(role))) return new NextResponse("Sem permissão", { status: 403 });
  const periodo = lerPeriodo({ inicio: request.nextUrl.searchParams.get("inicio") ?? undefined, fim: request.nextUrl.searchParams.get("fim") ?? undefined });
  const [clientes, motoristas] = await Promise.all([
    supabase.rpc("billing_overview", { p_start: periodo.inicio, p_end: periodo.fim }),
    supabase.rpc("driver_pay_overview", { p_start: periodo.inicio, p_end: periodo.fim }),
  ]);
  if (clientes.error || motoristas.error) return new NextResponse("Não foi possível gerar o arquivo.", { status: 500 });
  const linhas: string[][] = [
    ["Faturamento MalhaX", `Período ${periodo.rotulo}`],
    [],
    ["CLIENTES"],
    ["Cliente", "Pedidos concluídos", "Frete total", "Pedidos sem frete", "Faturado", "A faturar"],
    ...((clientes.data ?? []) as Array<Record<string, unknown>>).map((c) => [celula(c.client_name), String(c.completed_orders), numero(c.freight_total), String(c.orders_without_freight), numero(c.invoiced_amount), numero(c.pending_amount)]),
    [],
    ["MOTORISTAS (em aberto)"],
    ["Motorista", "Modelo", "Valor", "Viagens", "Dias", "Base", "Ajustes", "A pagar"],
    ...((motoristas.data ?? []) as Array<Record<string, unknown>>).map((m) => [celula(m.driver_name), m.pay_mode === "daily" ? "Diária" : m.pay_mode === "per_trip" ? "Por viagem" : "Sem regra", numero(m.rate), String(m.trips_count), String(m.days_worked), numero(m.base_amount), numero(m.adjustments_amount), numero(m.total_amount)]),
  ];
  const csv = "﻿" + linhas.map((linha) => linha.join(";")).join("\r\n");
  return new NextResponse(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="faturamento-${periodo.inicio}-a-${periodo.fim}.csv"`, "cache-control": "no-store" } });
}
