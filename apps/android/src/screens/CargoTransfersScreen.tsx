import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import type { DriverTrip } from "../lib/driver-api";
import { captureLocation } from "../lib/driver-api";
import { supabase } from "../lib/supabase";

type Transfer = { id: string; status: string; reason: string; details: string; source_trip_id: string; destination_trip_id: string; source_confirmed_at: string | null; receiver_confirmed_at: string | null; source_trip: { trip_number: number } | null; destination_trip: { trip_number: number } | null; cargo_transfer_items: Array<{ packages: { package_code: string; description: string | null; quantity: number } | null }>; cargo_transfer_events: Array<{ event_type: string; details: string | null }> };
const stateLabel: Record<string, string> = { pending_support: "Aguardando autorização do suporte", authorized: "Autorizado · aguardando leitura do QR", awaiting_source: "Recebido · aguardando confirmação de saída", completed: "Transbordo concluído", rejected: "Solicitação recusada", expired: "Autorização expirada" };

export function CargoTransfersScreen({ trips, onBack, onChanged }: { trips: DriverTrip[]; onBack: () => void; onChanged: () => Promise<void> }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [rows, setRows] = useState<Transfer[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const tripIds = trips.map((trip) => trip.id);

  const refresh = useCallback(async () => {
    if (!tripIds.length) { setRows([]); setLoading(false); return; }
    setLoading(true);
    try {
      const db = supabase as any;
      const { data, error: loadError } = await db.from("cargo_transfers")
        .select("id,status,reason,details,source_trip_id,destination_trip_id,source_confirmed_at,receiver_confirmed_at,source_trip:trips!cargo_transfers_source_trip_id_fkey(trip_number),destination_trip:trips!cargo_transfers_destination_trip_id_fkey(trip_number),cargo_transfer_items(packages(package_code,description,quantity)),cargo_transfer_events(event_type,details)")
        .or(`source_trip_id.in.(${tripIds.join(",")}),destination_trip_id.in.(${tripIds.join(",")})`)
        .order("requested_at", { ascending: false }).limit(40);
      if (loadError) throw loadError;
      setRows((data ?? []) as Transfer[]);
    } catch { setError("Não foi possível sincronizar os transbordos. A confirmação exige conexão com o servidor."); }
    finally { setLoading(false); }
  }, [trips.map((trip) => trip.id).join(",")]);

  useEffect(() => {
    void refresh();
    if (!tripIds.length) return;
    const channel = supabase.channel("malhax-cargo-transfers")
      .on("postgres_changes", { event: "*", schema: "public", table: "cargo_transfers" }, () => { void refresh(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [refresh]);

  async function acceptQr(data: string) {
    if (processing || !data.startsWith("MXTR1-")) return;
    setProcessing(true); setError(null); setNotice(null); setScanning(false);
    try {
      const location = await captureLocation();
      const { data: result, error: rpcError } = await (supabase as any).rpc("accept_cargo_transfer", {
        p_qr_token: data,
        p_latitude: location?.latitude ?? null,
        p_longitude: location?.longitude ?? null,
      });
      if (rpcError) throw rpcError;
      if (result === "expired") { setError("Este QR expirou. Peça ao suporte para emitir uma nova autorização."); return; }
      setNotice(result === "completed" ? "Transbordo confirmado pelos dois motoristas." : "Recebimento confirmado. O motorista de origem ainda precisa confirmar a entrega da carga.");
      await refresh(); await onChanged();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "falha";
      setError(message.includes("qr_expired") ? "Este QR expirou. Peça ao suporte para emitir uma nova autorização." : "QR inválido ou já utilizado. Confirme com o suporte antes de tentar novamente.");
    } finally { setProcessing(false); }
  }

  async function confirmSource(id: string) {
    setProcessing(true); setError(null); setNotice(null);
    try {
      const location = await captureLocation();
      const { data: result, error: rpcError } = await (supabase as any).rpc("confirm_cargo_handoff", {
        p_transfer_id: id,
        p_latitude: location?.latitude ?? null,
        p_longitude: location?.longitude ?? null,
      });
      if (rpcError) throw rpcError;
      setNotice(result === "completed" ? "Custódia do volume transferida para a viagem de destino." : "Saída confirmada. O recebimento pelo motorista de destino ainda está pendente.");
      await refresh(); await onChanged();
    } catch { setError("Não foi possível confirmar. Verifique a conexão e se o suporte autorizou o transbordo."); }
    finally { setProcessing(false); }
  }

  return <View style={styles.page}>
    <View style={styles.header}><Pressable onPress={onBack} style={styles.back}><Text style={styles.backText}>‹ Voltar</Text></Pressable><Text style={styles.kicker}>CARGA · TRANSFERÊNCIA SEGURA</Text><Text style={styles.title}>Transbordo</Text><Text style={styles.subtitle}>Receba volumes com autorização do suporte e confirme a passagem da carga.</Text></View>
    {notice ? <Text accessibilityLiveRegion="polite" style={styles.notice}>{notice}</Text> : null}
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    {scanning ? <View style={styles.cameraWrap}>
      {!permission?.granted ? <View style={styles.permission}><Text style={styles.body}>Permita o uso da câmera para ler o QR autorizado pelo suporte.</Text><Pressable onPress={() => void requestPermission()} style={styles.button}><Text style={styles.buttonText}>Permitir câmera</Text></Pressable></View> : <CameraView style={styles.camera} facing="back" barcodeScannerSettings={{ barcodeTypes: ["qr"] }} onBarcodeScanned={({ data }) => void acceptQr(data)} />}
      <Pressable onPress={() => setScanning(false)} style={styles.cancel}><Text style={styles.cancelText}>Cancelar leitura</Text></Pressable>
    </View> : <Pressable disabled={processing} onPress={() => { setError(null); setScanning(true); }} style={styles.scanButton}><Text style={styles.scanGlyph}>▦</Text><View style={{ flex: 1 }}><Text style={styles.scanTitle}>{processing ? "Confirmando…" : "Ler QR de recebimento"}</Text><Text style={styles.scanHint}>O QR precisa estar autorizado pelo suporte e ainda dentro da validade.</Text></View></Pressable>}
    <View style={styles.sectionHeading}><Text style={styles.sectionTitle}>Minhas transferências</Text><Pressable onPress={() => void refresh()}><Text style={styles.refresh}>Atualizar</Text></Pressable></View>
    <ScrollView contentContainerStyle={styles.list}>
      {loading ? <ActivityIndicator color="#37d9e4" style={{ marginTop: 24 }} /> : null}
      {!loading && rows.length === 0 ? <View style={styles.empty}><Text style={styles.emptyTitle}>Nenhum transbordo</Text><Text style={styles.body}>As solicitações autorizadas pelo suporte aparecerão aqui.</Text></View> : null}
      {rows.map((transfer) => {
        const isSource = trips.some((trip) => trip.id === transfer.source_trip_id);
        const needsSource = isSource && !transfer.source_confirmed_at && ["authorized", "awaiting_source"].includes(transfer.status);
        const alreadyReceived = isSource && Boolean(transfer.source_confirmed_at);
        return <View key={transfer.id} style={styles.card}>
          <Text style={styles.status}>{stateLabel[transfer.status] ?? transfer.status}</Text>
          <Text style={styles.route}>Viagem #{transfer.source_trip?.trip_number ?? "—"} → #{transfer.destination_trip?.trip_number ?? "—"}</Text>
          <Text style={styles.body}>{transfer.details}</Text>
          {transfer.status === "completed" ? <Text style={styles.routeNote}>{transfer.cargo_transfer_events.some((event) => event.event_type === "manual_route_adjustment") ? "Custódia transferida. A equipe precisa revisar manualmente as paradas que já estavam em andamento." : transfer.cargo_transfer_events.some((event) => event.event_type === "route_updated") ? "Custódia transferida e paradas pendentes atualizadas na viagem de destino." : "Custódia transferida. Consulte a equipe para confirmar a sequência da rota."}</Text> : null}
          <View style={styles.packages}>{transfer.cargo_transfer_items.map(({ packages }) => packages ? <Text style={styles.package} key={packages.package_code}>{packages.package_code}{packages.quantity > 1 ? ` ×${packages.quantity}` : ""}</Text> : null)}</View>
          {needsSource || alreadyReceived ? <Pressable disabled={processing || alreadyReceived} onPress={() => void confirmSource(transfer.id)} style={[styles.button, (processing || alreadyReceived) && styles.disabled]}><Text style={styles.buttonText}>{alreadyReceived ? "Confirmação de saída registrada" : processing ? "Registrando…" : "Confirmar que entreguei a carga"}</Text></Pressable> : null}
        </View>;
      })}
    </ScrollView>
  </View>;
}

const styles = StyleSheet.create({
  page: { flex: 1, paddingTop: 26, paddingHorizontal: 18, backgroundColor: "#070e1a" },
  header: { paddingBottom: 18 }, back: { alignSelf: "flex-start", paddingVertical: 6, paddingRight: 12 }, backText: { color: "#51dce5", fontSize: 15, fontWeight: "700" },
  kicker: { color: "#51cbd1", fontSize: 10, fontWeight: "900", letterSpacing: 1.5, marginTop: 14 }, title: { color: "#f5f8fc", fontSize: 27, fontWeight: "800", marginTop: 3 }, subtitle: { color: "#aab6c7", lineHeight: 21, marginTop: 5 },
  scanButton: { flexDirection: "row", alignItems: "center", gap: 14, padding: 15, borderRadius: 14, backgroundColor: "#0d2733", borderWidth: 1, borderColor: "#1d5260" }, scanGlyph: { color: "#4be0e8", fontSize: 32 }, scanTitle: { color: "#e8fbff", fontWeight: "800", fontSize: 15 }, scanHint: { color: "#a6bdcc", fontSize: 11, lineHeight: 16, marginTop: 4 },
  cameraWrap: { height: 330, borderRadius: 14, overflow: "hidden", backgroundColor: "#0c1a29" }, camera: { flex: 1 }, cancel: { padding: 11, alignItems: "center", backgroundColor: "#13263b" }, cancelText: { color: "#d8e5f1", fontWeight: "700" }, permission: { flex: 1, justifyContent: "center", alignItems: "center", gap: 14, padding: 20 },
  sectionHeading: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 22, marginBottom: 8 }, sectionTitle: { color: "#f1f5fb", fontSize: 17, fontWeight: "800" }, refresh: { color: "#56d6df", fontSize: 12, fontWeight: "700" }, list: { gap: 10, paddingBottom: 28 },
  card: { padding: 14, borderWidth: 1, borderColor: "#1e364d", borderRadius: 13, backgroundColor: "#0c1b2a" }, status: { color: "#60dbe0", fontSize: 11, fontWeight: "800" }, route: { color: "#edf4fc", fontSize: 15, fontWeight: "700", marginTop: 7 }, body: { color: "#adbdce", fontSize: 12, lineHeight: 18, marginTop: 7 }, packages: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginVertical: 9 }, package: { color: "#c9e7eb", fontSize: 10, borderWidth: 1, borderColor: "#284b5a", borderRadius: 6, paddingHorizontal: 7, paddingVertical: 4 },
  button: { minHeight: 44, justifyContent: "center", alignItems: "center", paddingHorizontal: 12, borderRadius: 9, backgroundColor: "#11bbc5", marginTop: 8 }, buttonText: { color: "#071522", fontSize: 12, fontWeight: "900" }, disabled: { opacity: .5 }, notice: { color: "#85e1c4", backgroundColor: "#10372e", padding: 10, borderRadius: 8, marginBottom: 10 }, error: { color: "#ffb1a7", backgroundColor: "#40211f", padding: 10, borderRadius: 8, marginBottom: 10 }, empty: { padding: 18, borderRadius: 12, backgroundColor: "#0c1b2a", alignItems: "center", marginTop: 6 }, routeNote: { color: "#f3cb81", fontSize: 11, lineHeight: 16, marginTop: 8 }, emptyTitle: { color: "#f0f4fa", fontWeight: "800" },
});





