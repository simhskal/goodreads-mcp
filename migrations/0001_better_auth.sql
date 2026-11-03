-- Better Auth 1.7.13 core, anonymous, JWT, MCP OAuth provider, and CIMD schema.
CREATE TABLE IF NOT EXISTS "user" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL UNIQUE,
  "emailVerified" BOOLEAN NOT NULL DEFAULT FALSE,
  "image" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL,
  "updatedAt" TIMESTAMPTZ NOT NULL,
  "isAnonymous" BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS "session" (
  "id" TEXT PRIMARY KEY,
  "expiresAt" TIMESTAMPTZ NOT NULL,
  "token" TEXT NOT NULL UNIQUE,
  "createdAt" TIMESTAMPTZ NOT NULL,
  "updatedAt" TIMESTAMPTZ NOT NULL,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "userId" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "session_userId_idx" ON "session"("userId");

CREATE TABLE IF NOT EXISTS "account" (
  "id" TEXT PRIMARY KEY,
  "accountId" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "userId" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "accessToken" TEXT,
  "refreshToken" TEXT,
  "idToken" TEXT,
  "accessTokenExpiresAt" TIMESTAMPTZ,
  "refreshTokenExpiresAt" TIMESTAMPTZ,
  "scope" TEXT,
  "password" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL,
  "updatedAt" TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS "account_userId_idx" ON "account"("userId");

CREATE TABLE IF NOT EXISTS "verification" (
  "id" TEXT PRIMARY KEY,
  "identifier" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "expiresAt" TIMESTAMPTZ NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL,
  "updatedAt" TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS "verification_identifier_idx" ON "verification"("identifier");

CREATE TABLE IF NOT EXISTS "jwks" (
  "id" TEXT PRIMARY KEY,
  "publicKey" TEXT NOT NULL,
  "privateKey" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL,
  "expiresAt" TIMESTAMPTZ,
  "alg" TEXT,
  "crv" TEXT
);

CREATE TABLE IF NOT EXISTS "oauthClient" (
  "id" TEXT PRIMARY KEY,
  "clientId" TEXT NOT NULL UNIQUE,
  "clientSecret" TEXT,
  "clientDiscoveryId" TEXT,
  "disabled" BOOLEAN DEFAULT FALSE,
  "skipConsent" BOOLEAN,
  "enableEndSession" BOOLEAN,
  "subjectType" TEXT,
  "scopes" TEXT[],
  "clientCredentialsScopes" TEXT[] DEFAULT '{}',
  "userId" TEXT REFERENCES "user"("id"),
  "createdAt" TIMESTAMPTZ,
  "updatedAt" TIMESTAMPTZ,
  "name" TEXT,
  "uri" TEXT,
  "icon" TEXT,
  "contacts" TEXT[],
  "tos" TEXT,
  "policy" TEXT,
  "softwareId" TEXT,
  "softwareVersion" TEXT,
  "softwareStatement" TEXT,
  "redirectUris" TEXT[] NOT NULL,
  "postLogoutRedirectUris" TEXT[],
  "backchannelLogoutUri" TEXT,
  "backchannelLogoutSessionRequired" BOOLEAN,
  "tokenEndpointAuthMethod" TEXT,
  "applicationType" TEXT,
  "jwks" TEXT,
  "jwksUri" TEXT,
  "grantTypes" TEXT[],
  "responseTypes" TEXT[],
  "requirePKCE" BOOLEAN,
  "dpopBoundAccessTokens" BOOLEAN DEFAULT FALSE,
  "referenceId" TEXT,
  "metadata" JSONB
);
CREATE INDEX IF NOT EXISTS "oauthClient_userId_idx" ON "oauthClient"("userId");

CREATE TABLE IF NOT EXISTS "oauthResource" (
  "id" TEXT PRIMARY KEY,
  "identifier" TEXT NOT NULL UNIQUE,
  "name" TEXT NOT NULL,
  "accessTokenTtl" INTEGER,
  "refreshTokenTtl" INTEGER,
  "signingAlgorithm" TEXT,
  "signingKeyId" TEXT,
  "allowedScopes" TEXT[],
  "customClaims" JSONB,
  "dpopBoundAccessTokensRequired" BOOLEAN DEFAULT FALSE,
  "disabled" BOOLEAN DEFAULT FALSE,
  "createdAt" TIMESTAMPTZ,
  "updatedAt" TIMESTAMPTZ,
  "policyVersion" INTEGER DEFAULT 1,
  "metadata" JSONB
);

CREATE TABLE IF NOT EXISTS "oauthClientResource" (
  "id" TEXT PRIMARY KEY,
  "clientId" TEXT NOT NULL REFERENCES "oauthClient"("clientId") ON DELETE CASCADE,
  "resourceId" TEXT NOT NULL REFERENCES "oauthResource"("identifier") ON DELETE CASCADE,
  "metadata" JSONB,
  "createdAt" TIMESTAMPTZ,
  CONSTRAINT "oauthClientResource_clientId_resourceId_uidx" UNIQUE ("clientId", "resourceId")
);
CREATE INDEX IF NOT EXISTS "oauthClientResource_clientId_idx" ON "oauthClientResource"("clientId");
CREATE INDEX IF NOT EXISTS "oauthClientResource_resourceId_idx" ON "oauthClientResource"("resourceId");

CREATE TABLE IF NOT EXISTS "oauthRefreshToken" (
  "id" TEXT PRIMARY KEY,
  "token" TEXT NOT NULL UNIQUE,
  "clientId" TEXT NOT NULL REFERENCES "oauthClient"("clientId"),
  "sessionId" TEXT REFERENCES "session"("id") ON DELETE SET NULL,
  "userId" TEXT NOT NULL REFERENCES "user"("id"),
  "referenceId" TEXT,
  "authorizationCodeId" TEXT,
  "resources" TEXT[],
  "requestedUserInfoClaims" TEXT[],
  "expiresAt" TIMESTAMPTZ NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL,
  "revoked" TIMESTAMPTZ,
  "rotatedAt" TIMESTAMPTZ,
  "rotationReplayResponse" TEXT,
  "rotationReplayExpiresAt" TIMESTAMPTZ,
  "authTime" TIMESTAMPTZ,
  "confirmation" JSONB,
  "scopes" TEXT[] NOT NULL
);
CREATE INDEX IF NOT EXISTS "oauthRefreshToken_clientId_idx" ON "oauthRefreshToken"("clientId");
CREATE INDEX IF NOT EXISTS "oauthRefreshToken_sessionId_idx" ON "oauthRefreshToken"("sessionId");
CREATE INDEX IF NOT EXISTS "oauthRefreshToken_userId_idx" ON "oauthRefreshToken"("userId");
CREATE INDEX IF NOT EXISTS "oauthRefreshToken_authorizationCodeId_idx" ON "oauthRefreshToken"("authorizationCodeId");

CREATE TABLE IF NOT EXISTS "oauthAccessToken" (
  "id" TEXT PRIMARY KEY,
  "token" TEXT UNIQUE,
  "clientId" TEXT NOT NULL REFERENCES "oauthClient"("clientId"),
  "sessionId" TEXT REFERENCES "session"("id") ON DELETE SET NULL,
  "userId" TEXT REFERENCES "user"("id"),
  "referenceId" TEXT,
  "authorizationCodeId" TEXT,
  "resources" TEXT[],
  "requestedUserInfoClaims" TEXT[],
  "refreshId" TEXT REFERENCES "oauthRefreshToken"("id"),
  "expiresAt" TIMESTAMPTZ NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL,
  "revoked" TIMESTAMPTZ,
  "confirmation" JSONB,
  "scopes" TEXT[] NOT NULL
);
CREATE INDEX IF NOT EXISTS "oauthAccessToken_clientId_idx" ON "oauthAccessToken"("clientId");
CREATE INDEX IF NOT EXISTS "oauthAccessToken_sessionId_idx" ON "oauthAccessToken"("sessionId");
CREATE INDEX IF NOT EXISTS "oauthAccessToken_userId_idx" ON "oauthAccessToken"("userId");
CREATE INDEX IF NOT EXISTS "oauthAccessToken_authorizationCodeId_idx" ON "oauthAccessToken"("authorizationCodeId");
CREATE INDEX IF NOT EXISTS "oauthAccessToken_refreshId_idx" ON "oauthAccessToken"("refreshId");

CREATE TABLE IF NOT EXISTS "oauthConsent" (
  "id" TEXT PRIMARY KEY,
  "clientId" TEXT NOT NULL REFERENCES "oauthClient"("clientId"),
  "userId" TEXT REFERENCES "user"("id"),
  "referenceId" TEXT,
  "resources" TEXT[],
  "requestedUserInfoClaims" TEXT[],
  "scopes" TEXT[] NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL,
  "updatedAt" TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS "oauthConsent_clientId_idx" ON "oauthConsent"("clientId");
CREATE INDEX IF NOT EXISTS "oauthConsent_userId_idx" ON "oauthConsent"("userId");

CREATE TABLE IF NOT EXISTS "oauthClientAssertion" (
  "id" TEXT PRIMARY KEY,
  "expiresAt" TIMESTAMPTZ NOT NULL
);
