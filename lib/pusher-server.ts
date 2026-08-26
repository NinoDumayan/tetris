import PusherServer from "pusher";

let _pusher: PusherServer | null = null;

export function getPusherServer() {
  if (_pusher) return _pusher;
  _pusher = new PusherServer({
    appId: process.env.PUSHER_APP_ID!,
    key: process.env.PUSHER_KEY!,
    secret: process.env.PUSHER_SECRET!,
    cluster: process.env.PUSHER_CLUSTER!,
    useTLS: true,
  });
  return _pusher;
}
