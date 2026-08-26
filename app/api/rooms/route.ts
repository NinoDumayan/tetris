import { NextResponse } from "next/server";
import { query, initDB } from "@/lib/db";

function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

export async function POST(req: Request) {
  await initDB();
  const { name, playerId } = await req.json();

  let code = generateCode();
  for (let attempt = 0; attempt < 10; attempt++) {
    const existing = await query`SELECT code FROM rooms WHERE code = ${code}`;
    if (existing.length === 0) break;
    code = generateCode();
  }

  await query`INSERT INTO rooms (code, host_name, host_id, status) VALUES (${code}, ${name}, ${playerId}, 'waiting')`;
  await query`INSERT INTO game_state (code) VALUES (${code})`;

  return NextResponse.json({ code, role: "host" });
}
