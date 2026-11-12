import { guardAbuse } from "../../packages/server-vercel/src/abuse.js";
import { auth } from "../../packages/server-vercel/src/auth.js";

const handle = async (request: Request) => {
  const limited = await guardAbuse(request);
  if (limited) return limited;
  return auth.handler(request);
};

export const GET = handle;
export const POST = handle;
