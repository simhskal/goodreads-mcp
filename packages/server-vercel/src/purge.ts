import type { Database } from "./repository.js";
import { LibraryRepository } from "./repository.js";

const HOUR_MS = 60 * 60 * 1000;

export interface PurgeResult {
  anonymousUsers: number;
  oauthClients: number;
  rateLimitBuckets: number;
}

export function hoursFromEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw || !/^\d+$/.test(raw)) return fallback;
  const value = Number(raw);
  if (value < 1 || value > 24 * 365) return fallback;
  return value;
}

export function purgeCutoffs(now: Date): {
  anonymousUsers: Date;
  oauthClients: Date;
  rateLimits: Date;
} {
  return {
    anonymousUsers: new Date(
      now.getTime() - hoursFromEnv("ABUSE_ANONYMOUS_TTL_HOURS", 24) * HOUR_MS,
    ),
    oauthClients: new Date(
      now.getTime() -
        hoursFromEnv("ABUSE_OAUTH_CLIENT_TTL_HOURS", 24 * 7) * HOUR_MS,
    ),
    rateLimits: new Date(now.getTime() - 24 * HOUR_MS),
  };
}

export async function purgeStaleAccounts(
  db: Database,
  now = new Date(),
): Promise<PurgeResult> {
  const repository = new LibraryRepository(db);
  const cutoffs = purgeCutoffs(now);
  const anonymousUsers = await repository.purgeUnusedAnonymousUsers(
    cutoffs.anonymousUsers,
  );
  const oauthClients = await repository.purgeUnusedOauthClients(
    cutoffs.oauthClients,
  );
  const rateLimitBuckets = await repository.purgeExpiredRateLimits(
    cutoffs.rateLimits,
  );
  return { anonymousUsers, oauthClients, rateLimitBuckets };
}
