import Pusher from "pusher-js";

let _pusher: Pusher | null = null;

export function getPusherClient() {
  if (_pusher) return _pusher;
  _pusher = new Pusher(process.env.NEXT_PUBLIC_PUSHER_KEY!, {
    cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
    enabledTransports: ["ws", "wss"],
  });
  return _pusher;
}
