import { NextResponse } from "next/server";
import { getDashboardData } from "@/lib/data";

// GET /api/metrics — returns the full dashboard payload (live Meta data
// when configured, otherwise demo data).
export async function GET() {
  const data = await getDashboardData();
  return NextResponse.json(data);
}
