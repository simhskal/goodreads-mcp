import { openAuth } from "../../packages/server-vercel/src/auth.js";

const route = (request: Request) => {
  const ready = openAuth();
  if (!ready.ok) return ready.response;
  return ready.auth.handler(request);
};

export const GET = route;
export const POST = route;
