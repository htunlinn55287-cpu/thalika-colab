import { NextResponse } from "next/server";
import { providerCapabilities } from "@/lib/provider-capabilities";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    providers: Object.values(providerCapabilities)
  });
}
