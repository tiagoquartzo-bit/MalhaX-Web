import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "../../../lib/supabase/server";

const LOGIN_URL = "/login?confirmation=invalid";

export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type");
  if (!tokenHash || type !== "invite") {
    return NextResponse.redirect(new URL(LOGIN_URL, request.url));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "invite" });
  if (error) return NextResponse.redirect(new URL(LOGIN_URL, request.url));

  return NextResponse.redirect(new URL("/auth/definir-senha", request.url));
}

