import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { authConfigured } from "@/lib/config";

export async function POST(request: Request) {
  const { origin } = new URL(request.url);
  if (authConfigured) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  return NextResponse.redirect(`${origin}/login`, { status: 303 });
}
