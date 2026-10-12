import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { DriverStop } from "../lib/driver-api";
import { GpsStatusPanel } from "../components/GpsStatusPanel";

export function DriverGpsScreen({ stops, onBack, onSupport, supportNotice }: { stops: DriverStop[]; onBack: () => void; onSupport: () => void; supportNotice?: string | null }) {
  return (
    <View style={styles.page}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" onPress={onBack} style={styles.back}><Text style={styles.backText}>‹ Voltar</Text></Pressable>
        <Text style={styles.title}>GPS e localização</Text>
        <Text style={styles.subtitle}>Confira sua posição e as paradas com coordenadas cadastradas.</Text>
      </View>
      {supportNotice ? <Pressable accessibilityRole="button" onPress={onSupport} style={styles.supportNotice}><Text style={styles.supportNoticeText}>{supportNotice}</Text></Pressable> : null}
      <ScrollView contentContainerStyle={styles.content}>
        <GpsStatusPanel active={false} liveOnly stops={stops} />
        <View style={styles.privacyCard}>
          <Text style={styles.privacyTitle}>Quando sua localização é compartilhada</Text>
          <Text style={styles.privacyText}>Nesta tela, o GPS é usado enquanto ela estiver aberta para mostrar sua posição no aparelho. O histórico da rota é enviado ao suporte somente durante uma viagem ativa.</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#070e1a", paddingTop: 20 },
  header: { paddingHorizontal: 20, paddingBottom: 12 },
  back: { alignSelf: "flex-start", paddingVertical: 8, paddingRight: 16 },
  backText: { color: "#38e1ff", fontSize: 14, fontWeight: "700" },
  title: { color: "#f5f8fc", fontSize: 24, fontWeight: "800" },
  subtitle: { color: "#aab6c7", fontSize: 13, lineHeight: 19, marginTop: 5 },
  content: { padding: 18, paddingBottom: 36 },
  supportNotice: { marginHorizontal: 18, marginBottom: 10, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: "#27747c", backgroundColor: "#0c2932" },
  supportNoticeText: { color: "#8cecf1", fontSize: 12, fontWeight: "800" },
  privacyCard: { padding: 14, borderRadius: 13, borderWidth: 1, borderColor: "#26384c", backgroundColor: "#0d1929" },
  privacyTitle: { color: "#dce7f3", fontSize: 13, fontWeight: "800" },
  privacyText: { color: "#99a9bc", fontSize: 12, lineHeight: 18, marginTop: 6 },
});
