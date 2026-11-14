import { guardAbuse } from "../../packages/server-vercel/src/abuse.js";
import { requestForAuth } from "../../packages/server-vercel/src/auth-request.js";
import { openAuth } from "../../packages/server-vercel/src/auth.js";

const route = async (request: Request) => {
  const publicRequest = requestForAuth(request);
  const limited = await guardAbuse(publicRequest);
  if (limited) return limited;
  const ready = openAuth();
  if (!ready.ok) return ready.response;
  return ready.auth.handler(publicRequest);
};

export const GET = route;
export const POST = route;
export const PUT = route;
export const PATCH = route;
export const DELETE = route;
export const OPTIONS = route;
