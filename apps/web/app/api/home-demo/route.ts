import { NextResponse } from "next/server";
import { fetchHomeDemoSnapshot } from "../../../lib/home-demo";

export const dynamic = "force-dynamic";

export async function GET() {
  const snapshot = await fetchHomeDemoSnapshot();
  return NextResponse.json(snapshot, {
    headers: {
      "cache-control": "no-store",
      "x-clime-demo-source": snapshot.source
    }
  });
}
