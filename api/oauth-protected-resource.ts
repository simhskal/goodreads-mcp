import {
  metadataCorsOptionsRequestHandler,
  protectedResourceHandler,
} from "mcp-handler";
import {
  authIssuer,
  mcpResource,
} from "../packages/server-vercel/src/config.js";

export const GET = protectedResourceHandler({
  authServerUrls: [authIssuer()],
  resourceUrl: mcpResource(),
});
export const OPTIONS = metadataCorsOptionsRequestHandler();
