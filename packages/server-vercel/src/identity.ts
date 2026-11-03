const PROFILE =
  /^https?:\/\/(?:www\.)?goodreads\.com\/user\/show\/(\d+)(?:[/-].*)?$/i;

export function parseGoodreadsIdentity(value: string): {
  userId: string;
  profileUrl: string;
} {
  const trimmed = value.trim();
  const userId = /^\d+$/.test(trimmed) ? trimmed : PROFILE.exec(trimmed)?.[1];
  if (!userId) {
    throw new Error(
      "Enter a Goodreads user ID or a goodreads.com/user/show profile URL.",
    );
  }
  return {
    userId,
    profileUrl: `https://www.goodreads.com/user/show/${userId}`,
  };
}

export function cleanRssKey(
  value: string | null | undefined,
): string | undefined {
  const key = value?.trim();
  if (!key) return undefined;
  if (!/^[A-Za-z0-9_-]{6,256}$/.test(key)) {
    throw new Error("The RSS key contains unexpected characters.");
  }
  return key;
}
