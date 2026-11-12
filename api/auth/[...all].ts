import { guardAbuse } from "../../packages/server-vercel/src/abuse.js";
import { openAuth } from "../../packages/server-vercel/src/auth.js";

const route = async (request: Request) => {
  const limited = await guardAbuse(request);
  if (limited) return limited;
  const ready = openAuth();
  if (!ready.ok) return ready.response;
  return ready.auth.handler(request);
};

export const GET = route;
export const POST = route;
