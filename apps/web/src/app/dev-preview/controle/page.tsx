import { notFound } from "next/navigation";
import { ControlTower } from "./control-tower-GAMER";

export default function ControlPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <ControlTower />;
}
