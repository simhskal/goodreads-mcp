import { oauthProviderAuthServerMetadata } from "@better-auth/oauth-provider";
import { auth } from "../packages/server-vercel/src/auth.js";

export const GET = oauthProviderAuthServerMetadata(
  auth as unknown as Parameters<typeof oauthProviderAuthServerMetadata>[0],
);
