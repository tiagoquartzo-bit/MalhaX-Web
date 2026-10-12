import { Image, View } from "react-native";

export function MalhaXMark({ size = 56 }: { size?: number }) {
  return (
    <View accessibilityRole="image" accessibilityLabel="Símbolo oficial MalhaX" style={{ width: size, height: size, borderRadius: size * 0.2, overflow: "hidden", backgroundColor: "#071321" }}>
      <Image source={require("../../assets/malhax-symbol-v2.png")} resizeMode="contain" style={{ width: "100%", height: "100%" }} />
    </View>
  );
}