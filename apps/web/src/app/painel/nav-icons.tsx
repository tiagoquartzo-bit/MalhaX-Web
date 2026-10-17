export type NavIconName =
  | "home" | "orders" | "dispatch" | "trips" | "live" | "alerts" | "transfer"
  | "clients" | "driver" | "fleet" | "billing" | "chart" | "route" | "support" | "plus";

export function NavIcon({ name }: { name: NavIconName }) {
  const common = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true as const };
  switch (name) {
    case "home": return <svg {...common}><path d="M4 11.5 12 5l8 6.5V20H4z" /><path d="M10 20v-5h4v5" /></svg>;
    case "orders": return <svg {...common}><path d="M6 3.5h9l3 3V20.5H6z" /><path d="M9 10h6M9 14h6M9 18h4" /></svg>;
    case "dispatch": return <svg {...common}><circle cx="6" cy="6" r="2" /><circle cx="18" cy="18" r="2" /><path d="M8 6h6a3 3 0 0 1 0 6h-4a3 3 0 0 0 0 6h6" /></svg>;
    case "trips": return <svg {...common}><path d="M3 7h11v11H3zM14 11h4l3 4v3h-7z" /><circle cx="7.5" cy="18.5" r="1.8" /><circle cx="17.5" cy="18.5" r="1.8" /></svg>;
    case "live": return <svg {...common}><circle cx="12" cy="11" r="3" /><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z" /></svg>;
    case "alerts": return <svg {...common}><path d="M12 4 21 19H3z" /><path d="M12 10v4M12 17h.01" /></svg>;
    case "transfer": return <svg {...common}><path d="M4 8h15m-3-3 3 3-3 3M20 16H5m3-3-3 3 3 3" /></svg>;
    case "clients": return <svg {...common}><path d="M4 20V8l8-4 8 4v12" /><path d="M9 20v-6h6v6" /></svg>;
    case "driver": return <svg {...common}><circle cx="12" cy="8" r="3.5" /><path d="M5 20a7 7 0 0 1 14 0" /></svg>;
    case "fleet": return <svg {...common}><rect x="3" y="9" width="18" height="8" rx="2" /><circle cx="7.5" cy="18" r="1.6" /><circle cx="16.5" cy="18" r="1.6" /><path d="M6 9l2-4h8l2 4" /></svg>;
    case "billing": return <svg {...common}><rect x="3" y="6" width="18" height="12" rx="2" /><path d="M3 10h18M7 15h4" /></svg>;
    case "chart": return <svg {...common}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></svg>;
    case "route": return <svg {...common}><circle cx="5" cy="18.5" r="2" /><circle cx="19" cy="5.5" r="2" /><path d="M7 18.5h3a3 3 0 0 0 3-3v-7a3 3 0 0 1 3-3h1" /></svg>;
    case "support": return <svg {...common}><path d="M4 13v-1a8 8 0 0 1 16 0v1" /><path d="M4 13h3v6H6a2 2 0 0 1-2-2zm16 0h-3v6h1a2 2 0 0 0 2-2z" /></svg>;
    case "plus": return <svg {...common}><path d="M12 5v14M5 12h14" /></svg>;
  }
}
