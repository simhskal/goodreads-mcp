import { requireMcpAuth } from "@better-auth/mcp";
import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import {
  errorResult,
  jsonResult,
} from "../packages/server-local/src/result.js";
import { registerTools } from "../packages/server-local/src/server.js";
import {
  auth,
  getPool,
  LibraryRepository,
  mcpResource,
  StoredLibraryService,
} from "../packages/server-vercel/src/index.js";

const route = requireMcpAuth(
  auth,
  async (request, claims) => {
    const authUserId = typeof claims.sub === "string" ? claims.sub : undefined;
    if (!authUserId)
      return Response.json(
        { error: "Authenticated identity is missing." },
        { status: 401 },
      );

    const library = new StoredLibraryService(
      new LibraryRepository(getPool()),
      authUserId,
    );
    const grantedScopes = new Set(
      typeof claims.scope === "string" ? claims.scope.split(/\s+/) : [],
    );
    const handler = createMcpHandler(
      (server) => {
        // mcp-handler v2 uses the protocol SDK v2 while the published local
        // server remains on SDK v1. Their registerTool surfaces are runtime
        // compatible; keep one tool catalog until the local package upgrades.
        registerTools(
          server as unknown as Parameters<typeof registerTools>[0],
          library,
        );
        server.registerTool(
          "delete_account",
          {
            title: "Delete stored Goodreads data",
            description:
              "Permanently delete credentials and imported library data for this connection.",
            inputSchema: { confirm: z.literal("DELETE") },
          },
          async () => {
            if (!grantedScopes.has("account:write")) {
              return errorResult(
                new Error("The account:write OAuth scope is required."),
              );
            }
            try {
              return jsonResult(await library.deleteAccount());
            } catch (error) {
              return errorResult(error);
            }
          },
        );
      },
      {
        serverInfo: { name: "goodreads-mcp", version: "0.1.0" },
        maxSubscriptions: 0,
        verboseLogs: process.env.NODE_ENV !== "production",
      },
    );
    return handler(request);
  },
  {
    resource: mcpResource(),
    requiredScopes: ["library:read"],
    challengeScopes: ["library:read", "account:write"],
  },
);

export const POST = route;
