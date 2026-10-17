import { redirect } from "next/navigation";
import { ControlTower } from "./control-tower";

export default function ControlPreviewPage() {
  if (process.env.NODE_ENV === "production") redirect("/controle");
  return <ControlTower />;
}
