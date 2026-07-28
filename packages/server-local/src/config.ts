export interface LocalServerConfig {
  userId: string;
  rssKey?: string;
}

export function readConfig(
  env: NodeJS.ProcessEnv = process.env,
): LocalServerConfig {
  const userId = env.GOODREADS_USER_ID?.trim();
  const rssKey = env.GOODREADS_RSS_KEY?.trim();

  if (!userId) {
    throw new Error(
      "GOODREADS_USER_ID is required. Set it to the numeric ID from your Goodreads profile URL.",
    );
  }

  if (!/^\d+$/.test(userId)) {
    throw new Error(
      "GOODREADS_USER_ID must contain only digits (for example, 12345678).",
    );
  }

  return {
    userId,
    ...(rssKey ? { rssKey } : {}),
  };
}
