import { NextResponse } from "next/server";
import { query, initDB } from "@/lib/db";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  await initDB();
  const { code } = await params;
  const { role, rows } = await req.json();

  if (role === "host") {
    await query`
      UPDATE game_state
      SET guest_garbage = guest_garbage + ${rows},
          updated_at = NOW()
      WHERE code = ${code}`;
  } else {
    await query`
      UPDATE game_state
      SET host_garbage = host_garbage + ${rows},
          updated_at = NOW()
      WHERE code = ${code}`;
  }

  return NextResponse.json({ ok: true });
}
