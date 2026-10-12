"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { requestCargoTransfer } from "./actions";
import styles from "./transbordos.module.css";

type Trip = { id: string; trip_number: number; status: string; drivers: { profiles: { full_name: string } | null } | null };

export function CargoTransferRequestForm({ trips }: { trips: Trip[] }) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [message, setMessage] = useState<{ error?: string; success?: string } | null>(null);
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setMessage(null);
    const form = event.currentTarget;
    const formData = new FormData(form);
    startTransition(async () => {
      const result = await requestCargoTransfer(formData);
      setMessage(result);
      if (result.success) { form.reset(); router.refresh(); }
    });
  }
  return <form onSubmit={submit} className={styles.form}>
    <label>Viagem de origem<select name="sourceTripId" required defaultValue=""><option value="" disabled>Selecione</option>{trips.map((t) => <option key={t.id} value={t.id}>#{t.trip_number} · {t.drivers?.profiles?.full_name ?? "Motorista"}</option>)}</select></label>
    <label>Viagem de destino<select name="destinationTripId" required defaultValue=""><option value="" disabled>Selecione</option>{trips.map((t) => <option key={t.id} value={t.id}>#{t.trip_number} · {t.drivers?.profiles?.full_name ?? "Motorista"}</option>)}</select></label>
    <label>Motivo<select name="reason" required defaultValue="vehicle_breakdown"><option value="vehicle_breakdown">Quebra de veículo</option><option value="planned_handoff">Transbordo planejado</option><option value="route_change">Alteração de rota</option></select></label>
    <label>Códigos dos volumes<textarea name="packageCodes" required placeholder="Um código por linha ou separados por vírgula" rows={4} /></label>
    <small className={styles.hint}>Informe os códigos que constam na viagem de origem. O servidor valida se cada volume ainda está em rota.</small>
    <label>Detalhes da ocorrência<textarea name="details" required minLength={5} maxLength={1000} placeholder="Informe o ponto de encontro e o que aconteceu" rows={3} /></label>
    {message?.error ? <p role="alert" className={styles.error}>{message.error}</p> : null}
    {message?.success ? <p role="status" className={styles.success}>{message.success}</p> : null}
    <button className={styles.primaryButton} disabled={busy} type="submit">{busy ? "Enviando…" : "Enviar para autorização"}</button>
  </form>;
}

