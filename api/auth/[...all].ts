import { auth } from "../../packages/server-vercel/src/auth.js";

export const GET = (request: Request) => auth.handler(request);
export const POST = (request: Request) => auth.handler(request);
