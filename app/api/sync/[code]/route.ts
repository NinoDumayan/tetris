import { NextResponse } from "next/server";
import { query, initDB } from "@/lib/db";
import { getPusherServer } from "@/lib/pusher-server";

interface Room {
  code: string;
  host_name: string;
  guest_name: string | null;
  status: string;
}

interface GameState {
  code: string;
  host_board: unknown;
  guest_board: unknown;
  host_score: number;
  guest_score: number;
  host_lines: number;
  guest_lines: number;
  host_level: number;
  guest_level: number;
  host_status: string;
  guest_status: string;
  host_garbage: number;
  guest_garbage: number;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  await initDB();
  const { code } = await params;

  const room = await query<Room>`SELECT * FROM rooms WHERE code = ${code}`;
  if (room.length === 0) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }

  const state = await query<GameState>`SELECT * FROM game_state WHERE code = ${code}`;
  if (state.length === 0) {
    return NextResponse.json({ error: "Game state not found" }, { status: 404 });
  }

  return NextResponse.json({ room: room[0], state: state[0] });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  await initDB();
  const { code } = await params;
  const body = await req.json();
  const { role, board, score, lines, level, status, garbage } = body;

  if (role === "host") {
    await query`
      UPDATE game_state SET
        host_board = ${JSON.stringify(board)}::jsonb,
        host_score = ${score},
        host_lines = ${lines},
        host_level = ${level},
        host_status = ${status},
        guest_garbage = guest_garbage + ${garbage},
        updated_at = NOW()
      WHERE code = ${code}`;
  } else {
    await query`
      UPDATE game_state SET
        guest_board = ${JSON.stringify(board)}::jsonb,
        guest_score = ${score},
        guest_lines = ${lines},
        guest_level = ${level},
        guest_status = ${status},
        host_garbage = host_garbage + ${garbage},
        updated_at = NOW()
      WHERE code = ${code}`;
  }

  const updated = await query<GameState>`SELECT * FROM game_state WHERE code = ${code}`;

  try {
    const pusher = getPusherServer();
    if (pusher) {
      await pusher.trigger(`game-${code}`, "state-update", { state: updated[0] });
    }
  } catch (e) {
    console.error("Pusher trigger failed:", e);
  }

  return NextResponse.json({ state: updated[0] });
}
