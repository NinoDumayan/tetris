import { NextResponse } from "next/server";
import { query, initDB } from "@/lib/db";

interface Room {
  code: string;
  host_name: string;
  guest_name: string | null;
  host_id: string;
  guest_id: string | null;
  status: string;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  await initDB();
  const { code } = await params;
  const { name, playerId } = await req.json();

  const rooms = await query<Room>`SELECT * FROM rooms WHERE code = ${code}`;
  if (rooms.length === 0) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }

  const room = rooms[0];
  if (room.status !== "waiting") {
    return NextResponse.json({ error: "Room is full" }, { status: 400 });
  }

  await query`UPDATE rooms SET guest_name = ${name}, guest_id = ${playerId}, status = 'playing' WHERE code = ${code}`;

  return NextResponse.json({ code, role: "guest" });
}
