import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_REMOTE_ENDPOINT,
  endpointAcceptsClientRssKey,
  isSharedPublicDeployment,
  sharedDeploymentMcpResponse,
} from "./hosted.js";

const PRODUCTION_URL = "VERCEL_PROJECT_PRODUCTION_URL";
const original = process.env[PRODUCTION_URL];

afterEach(() => {
  if (original === undefined) delete process.env[PRODUCTION_URL];
  else process.env[PRODUCTION_URL] = original;
});

describe("shared deployment", () => {
  it("points the default hosted endpoint at OAuth", () => {
    expect(DEFAULT_REMOTE_ENDPOINT).toBe(
      "https://goodreads-mcp-chi.vercel.app/oauth/mcp",
    );
  });

  it("refuses to store an RSS key for any URL on the public host", () => {
    expect(
      endpointAcceptsClientRssKey("https://goodreads-mcp-chi.vercel.app/mcp"),
    ).toBe(false);
    expect(
      endpointAcceptsClientRssKey(
        "https://goodreads-mcp-organized-chaos.vercel.app/oauth/mcp",
      ),
    ).toBe(false);
    expect(endpointAcceptsClientRssKey("https://books.example.com/mcp")).toBe(
      true,
    );
    expect(endpointAcceptsClientRssKey("not a url")).toBe(false);
  });

  it("recognizes the shared project from its production URL", () => {
    process.env[PRODUCTION_URL] = "goodreads-mcp-chi.vercel.app";
    expect(isSharedPublicDeployment()).toBe(true);
    process.env[PRODUCTION_URL] = "https://goodreads-mcp-chi.vercel.app/";
    expect(isSharedPublicDeployment()).toBe(true);
    process.env[PRODUCTION_URL] = "books.example.com";
    expect(isSharedPublicDeployment()).toBe(false);
    delete process.env[PRODUCTION_URL];
    expect(isSharedPublicDeployment()).toBe(false);
  });

  it("permanently redirects /mcp to /oauth/mcp and keeps the query string", () => {
    process.env[PRODUCTION_URL] = "goodreads-mcp-chi.vercel.app";
    const response = sharedDeploymentMcpResponse(
      new Request(
        "https://goodreads-mcp-chi.vercel.app/mcp?shelf=to-read&limit=2",
      ),
    );
    expect(response?.status).toBe(308);
    expect(response?.headers.get("location")).toBe(
      "https://goodreads-mcp-chi.vercel.app/oauth/mcp?shelf=to-read&limit=2",
    );
  });

  it("redirects /mcp with no query string to /oauth/mcp", () => {
    process.env[PRODUCTION_URL] = "goodreads-mcp-chi.vercel.app";
    const response = sharedDeploymentMcpResponse(
      new Request("https://preview.example.vercel.app/mcp"),
    );
    expect(response?.status).toBe(308);
    expect(response?.headers.get("location")).toBe(
      "https://preview.example.vercel.app/oauth/mcp",
    );
  });

  it("does not redirect a self-hosted deployment", () => {
    process.env[PRODUCTION_URL] = "books.example.com";
    expect(
      sharedDeploymentMcpResponse(
        new Request("https://books.example.com/mcp?shelf=read"),
      ),
    ).toBeUndefined();
  });
});
