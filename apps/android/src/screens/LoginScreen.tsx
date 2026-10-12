import { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { MalhaXMark } from "../components/MalhaXMark";
import { supabase } from "../lib/supabase";

export function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn() {
    setError(null);
    setBusy(true);
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
      if (signInError) setError("Não foi possível entrar. Confira o e-mail e a senha ou fale com o suporte.");
    } catch {
      setError("Não foi possível entrar. Verifique a conexão e tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.keyboard}>
      <View pointerEvents="none" style={styles.backgroundArt}>
        <View style={styles.glowTop} /><View style={styles.glowBottom} />
        <View style={styles.routeLineA} /><View style={styles.routeLineB} />
        <View style={styles.routeDotA} /><View style={styles.routeDotB} /><View style={styles.routeDotC} />
      </View>
      <ScrollView contentContainerStyle={styles.page} keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled">
        <View style={styles.content}>
          <View style={styles.brandRow}>
            <MalhaXMark size={58} />
            <View style={styles.brandCopy}>
              <Text style={styles.brand}>MalhaX</Text>
              <Text style={styles.brandCaption}>LOGÍSTICA E TECNOLOGIA</Text>
            </View>
          </View>
          <View style={styles.hero}>
            <View style={styles.eyebrowRow}><View style={styles.liveDot} /><Text style={styles.eyebrow}>OPERAÇÃO CONECTADA</Text></View>
            <Text style={styles.title}>Sua rota,{"\n"}no caminho certo.</Text>
            <Text style={styles.subtitle}>Consulte suas paradas, registre cada entrega e fale com o suporte em um só lugar.</Text>
          </View>
          <View style={styles.card}>
            <Text style={styles.formTitle}>Acesso do motorista</Text>
            <Text style={styles.formHint}>Entre com os dados do convite recebido da operação.</Text>
            <Text style={styles.label}>E-mail</Text>
            <TextInput accessibilityLabel="E-mail" autoCapitalize="none" autoComplete="email" keyboardType="email-address" onChangeText={setEmail} placeholder="voce@exemplo.com" placeholderTextColor="#75839a" returnKeyType="next" style={styles.input} value={email} />
            <Text style={styles.label}>Senha</Text>
            <TextInput accessibilityLabel="Senha" autoCapitalize="none" autoComplete="current-password" onChangeText={setPassword} onSubmitEditing={signIn} placeholder="Sua senha" placeholderTextColor="#75839a" secureTextEntry style={styles.input} value={password} />
            {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
            <Pressable accessibilityRole="button" disabled={busy || !email.trim() || !password} onPress={signIn} style={({ pressed }) => [styles.button, pressed && styles.pressed, (busy || !email.trim() || !password) && styles.disabled]}>
              {busy ? <ActivityIndicator color="#06101d" /> : <Text style={styles.buttonText}>Entrar na operação</Text>}
            </Pressable>
          </View>
          <Text style={styles.help}>Ainda não tem acesso? Peça um convite ao suporte da operação.</Text>
          <Text style={styles.footer}>LOCALIZAÇÃO · COLETAS · ENTREGAS</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  keyboard: { flex: 1, backgroundColor: "#070e1a" },
  backgroundArt: { ...StyleSheet.absoluteFill, overflow: "hidden" },
  glowTop: { position: "absolute", width: 300, height: 300, borderRadius: 150, top: -155, right: -110, backgroundColor: "rgba(0,194,203,0.09)" },
  glowBottom: { position: "absolute", width: 260, height: 260, borderRadius: 130, bottom: -150, left: -130, backgroundColor: "rgba(0,112,243,0.09)" },
  routeLineA: { position: "absolute", top: "30%", right: "-8%", width: "58%", height: 1, backgroundColor: "rgba(56,225,255,0.14)", transform: [{ rotate: "-27deg" }] },
  routeLineB: { position: "absolute", top: "32%", right: "3%", width: "40%", height: 1, backgroundColor: "rgba(0,194,203,0.12)", transform: [{ rotate: "35deg" }] },
  routeDotA: { position: "absolute", top: "27%", right: "34%", width: 7, height: 7, borderRadius: 4, backgroundColor: "#00c2cb" },
  routeDotB: { position: "absolute", top: "31%", right: "18%", width: 5, height: 5, borderRadius: 3, backgroundColor: "#38e1ff" },
  routeDotC: { position: "absolute", top: "38%", right: "8%", width: 6, height: 6, borderRadius: 3, backgroundColor: "#00c2cb" },
  page: { flexGrow: 1, justifyContent: "center", paddingHorizontal: 24, paddingVertical: 32 },
  content: { width: "100%", maxWidth: 460, alignSelf: "center" },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 13, marginBottom: 42 },
  brandCopy: { gap: 4 },
  brand: { color: "#f5f8fc", fontSize: 24, fontWeight: "800", letterSpacing: -0.5 },
  brandCaption: { color: "#8092a8", fontSize: 9, fontWeight: "700", letterSpacing: 2.3 },
  hero: { marginBottom: 26 },
  eyebrowRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 13 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#00c2cb" },
  eyebrow: { color: "#38e1ff", fontSize: 10, fontWeight: "800", letterSpacing: 1.8 },
  title: { color: "#f5f8fc", fontSize: 34, lineHeight: 39, fontWeight: "800", letterSpacing: -0.8 },
  subtitle: { color: "#aab6c7", fontSize: 14, lineHeight: 21, marginTop: 12, maxWidth: 390 },
  card: { padding: 20, borderWidth: 1, borderColor: "rgba(126,154,183,0.23)", borderRadius: 20, backgroundColor: "rgba(13,25,41,0.94)" },
  formTitle: { color: "#f5f8fc", fontSize: 17, fontWeight: "800" },
  formHint: { color: "#8493a8", fontSize: 12, lineHeight: 18, marginTop: 5, marginBottom: 10 },
  label: { color: "#d8e1ed", fontSize: 12, fontWeight: "700", marginBottom: 7, marginTop: 13 },
  input: { minHeight: 52, borderWidth: 1, borderColor: "#26364c", borderRadius: 12, backgroundColor: "#091523", color: "#f5f8fc", paddingHorizontal: 14, fontSize: 15 },
  button: { height: 52, marginTop: 22, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: "#00c2cb" },
  buttonText: { color: "#07101e", fontWeight: "800", fontSize: 14 },
  pressed: { opacity: 0.82 },
  disabled: { opacity: 0.5 },
  error: { color: "#ffb4aa", marginTop: 13, lineHeight: 20, fontSize: 13 },
  help: { color: "#93a2b6", textAlign: "center", fontSize: 12, marginTop: 19, lineHeight: 18 },
  footer: { color: "#52667c", textAlign: "center", fontSize: 9, fontWeight: "700", letterSpacing: 1.6, marginTop: 22 },
});


