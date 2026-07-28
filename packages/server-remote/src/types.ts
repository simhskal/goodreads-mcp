export interface Env {
  DB: D1Database;
  CACHE: KVNamespace;
  OAUTH_KV: KVNamespace;
  MCP_OBJECT: DurableObjectNamespace;
  OAUTH_PROVIDER: {
    parseAuthRequest(request: Request): Promise<OAuthRequest>;
    lookupClient(clientId: string): Promise<{ clientName?: string } | null>;
    completeAuthorization(input: {
      request: OAuthRequest;
      userId: string;
      metadata: Record<string, unknown>;
      scope: string[];
      props: AuthProps;
    }): Promise<{ redirectTo: string }>;
  };
}

export interface OAuthRequest {
  clientId: string;
  redirectUri: string;
  scope?: string[];
  state?: string;
  [key: string]: unknown;
}

export interface AuthProps {
  [key: string]: unknown;
  userId: string;
  goodreadsUserId: string;
}

export interface StoredBook {
  goodreadsId?: string;
  title: string;
  author: string;
  isbn?: string;
  isbn13?: string;
  shelf: string;
  rating?: number;
  averageRating?: number;
  dateRead?: string;
  dateAdded?: string;
  review?: string;
  source: "csv" | "rss";
}
