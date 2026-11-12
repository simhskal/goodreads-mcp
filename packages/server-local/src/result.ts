import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import {
  logInternalError,
  safeClientMessage,
} from "@organized-chaos/goodreads-mcp-core";

export function jsonResult(value: unknown): CallToolResult {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(value, null, 2),
      },
    ],
  };
}

export function errorResult(error: unknown): CallToolResult {
  const safe = safeClientMessage(error);
  if (!safe) logInternalError(error);
  return {
    isError: true,
    content: [
      {
        type: "text",
        text: safe
          ? `Goodreads request failed: ${safe}`
          : "Goodreads request failed.",
      },
    ],
  };
}
