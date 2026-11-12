const EXACT_PUBLIC_MESSAGES = new Set([
  "A CSV field exceeds the length limit.",
  "A CSV row has too many columns.",
  "CSV exports are limited to 50000 books.",
  "CSV exports must be no larger than 10 MB.",
  "Connect a Goodreads account before using this tool.",
  "Enter a Goodreads user ID or a goodreads.com/user/show profile URL.",
  "Goodreads RSS key is too long.",
  "Goodreads user ID is too long.",
  "Goodreads user ID must contain only digits",
  "Invalid CSV: unterminated quoted field",
  "Invalid Goodreads CSV: expected Title and Author columns",
  "Invalid Goodreads RSS document",
  "Invalid shelf name.",
  "ISBN must be a valid ISBN-10 or ISBN-13",
  "Open Library returned invalid JSON.",
  "Outbound request URL is not allowed.",
  "Provide either isbn or title.",
  "Provide isbn or title.",
  "Redirect target is not allowed.",
  "Redirect was missing a location.",
  "The OAuth request is missing or expired.",
  "The RSS key contains unexpected characters.",
  "The account:write OAuth scope is required.",
  "The upstream request timed out.",
  "The upstream response exceeded the size limit.",
  "Too many books to import.",
  "Too many redirects.",
  "X-Goodreads-RSS-Key is too long.",
  "X-Goodreads-User-ID is required. Configure it in your MCP client's HTTP headers.",
  "X-Goodreads-User-ID must be at most 20 digits.",
  "X-Goodreads-User-ID must contain only digits.",
  "limit must be a non-negative integer",
]);

const PUBLIC_MESSAGE_PATTERNS = [
  /^Goodreads RSS request failed \(\d{3}\)$/,
  /^Goodreads RSS returned HTTP \d{3}\.$/,
  /^Open Library request failed \(\d{3}\)$/,
];

export function safeClientMessage(error: unknown): string | undefined {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : undefined;
  if (!raw || raw.length > 500) return undefined;
  if (EXACT_PUBLIC_MESSAGES.has(raw)) return raw;
  if (PUBLIC_MESSAGE_PATTERNS.some((pattern) => pattern.test(raw))) return raw;
  return undefined;
}

export function clientFacingMessage(error: unknown, fallback: string): string {
  const safe = safeClientMessage(error);
  if (safe) return safe;
  logInternalError(error);
  return fallback;
}

export function logInternalError(error: unknown): void {
  console.error("goodreads-mcp error", describeError(error));
}

export function redactSecrets(value: string): string {
  return value.replace(
    /(^|[^A-Za-z0-9_])(key(?:=|%3[Dd]))[^&\s#'"]+/gi,
    "$1$2redacted",
  );
}

function describeError(error: unknown, depth = 0): unknown {
  if (depth > 3) return "truncated";
  if (error instanceof Error) {
    const described: {
      name: string;
      message: string;
      stack?: string;
      cause?: unknown;
    } = {
      name: error.name,
      message: redactSecrets(error.message),
    };
    if (error.stack) described.stack = redactSecrets(error.stack);
    if (error.cause !== undefined) {
      described.cause = describeError(error.cause, depth + 1);
    }
    return described;
  }
  if (typeof error === "string") return redactSecrets(error);
  return "unknown failure";
}
