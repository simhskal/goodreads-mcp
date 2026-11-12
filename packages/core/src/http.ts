export const UPSTREAM_TIMEOUT_MS = 10_000;
export const RSS_MAX_BYTES = 2_000_000;
export const OPEN_LIBRARY_MAX_BYTES = 1_000_000;

const MAX_REDIRECTS = 3;
const MAX_REDIRECT_LOCATION_LENGTH = 2_048;

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export interface BoundedResponse {
  status: number;
  ok: boolean;
  text: string;
}

export interface BoundedFetchOptions {
  allowedHosts: readonly string[];
  maxBytes: number;
  fetch?: typeof globalThis.fetch;
  signal?: AbortSignal;
  headers?: HeadersInit;
  timeoutMs?: number;
}

export async function fetchTextBounded(
  input: string | URL,
  options: BoundedFetchOptions,
): Promise<BoundedResponse> {
  const fetcher = options.fetch ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? UPSTREAM_TIMEOUT_MS;
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  if (options.signal) {
    if (options.signal.aborted) controller.abort(options.signal.reason);
    else {
      options.signal.addEventListener(
        "abort",
        () => controller.abort(options.signal?.reason),
        { once: true },
      );
    }
  }

  try {
    let current = new URL(input);
    assertFetchUrl(current, options.allowedHosts, false);

    for (let redirects = 0; ; redirects += 1) {
      const init: RequestInit = {
        redirect: "manual",
        signal: controller.signal,
      };
      if (options.headers) init.headers = options.headers;
      const response = await fetcher(current, init);
      if (!REDIRECT_STATUSES.has(response.status)) {
        if (!response.ok) {
          await discard(response);
          return { status: response.status, ok: false, text: "" };
        }
        return {
          status: response.status,
          ok: true,
          text: await readLimitedText(response, options.maxBytes),
        };
      }

      await discard(response);
      if (redirects >= MAX_REDIRECTS) throw new Error("Too many redirects.");
      const location = response.headers.get("location")?.trim();
      if (!location) throw new Error("Redirect was missing a location.");
      if (location.length > MAX_REDIRECT_LOCATION_LENGTH) {
        throw new Error("Redirect target is not allowed.");
      }
      try {
        current = new URL(location, current);
      } catch {
        throw new Error("Redirect target is not allowed.");
      }
      assertFetchUrl(current, options.allowedHosts, true);
    }
  } catch (error) {
    if (timedOut) throw new Error("The upstream request timed out.");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function assertFetchUrl(
  url: URL,
  allowedHosts: readonly string[],
  redirect: boolean,
): void {
  const host = url.hostname.replace(/\.$/, "").toLowerCase();
  const allowed = allowedHosts.some((domain) => {
    const normalized = domain.toLowerCase();
    return host === normalized || host.endsWith(`.${normalized}`);
  });
  if (url.protocol !== "https:" || url.username || url.password || !allowed) {
    throw new Error(
      redirect
        ? "Redirect target is not allowed."
        : "Outbound request URL is not allowed.",
    );
  }
}

async function readLimitedText(
  response: Response,
  maxBytes: number,
): Promise<string> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    await discard(response);
    throw new Error("The upstream response exceeded the size limit.");
  }
  if (!response.body) {
    const text = await response.text();
    if (text.length > maxBytes) {
      throw new Error("The upstream response exceeded the size limit.");
    }
    return text;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let received = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > maxBytes) {
        throw new Error("The upstream response exceeded the size limit.");
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return text;
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  }
}

async function discard(response: Response): Promise<void> {
  await response.body?.cancel().catch(() => undefined);
}
