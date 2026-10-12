import { notFound, redirect } from "next/navigation";
import { ControlTower } from "./control-tower";
import { createClient } from "../../../lib/supabase/server";

export default async function DevControlePage() {
  if (process.env.NODE_ENV === "production") notFound();

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return <ControlTower />;
}
