import { access, constants } from "node:fs/promises";
import { homedir } from "node:os";
import type {
  GoodreadsBrowser,
  GoodreadsCredentials,
  SetupPrompter,
} from "./setup.js";
import { parseGoodreadsRssKey, parseGoodreadsUserId } from "./setup.js";

const GOODREADS_HOME = "https://www.goodreads.com/";

export async function createGoodreadsBrowser(
  prompter: SetupPrompter,
): Promise<GoodreadsBrowser> {
  const executablePath = await findBrowserExecutable();
  if (!executablePath) {
    throw new Error(
      "Could not find Google Chrome or Chromium. Install a desktop browser and run setup again.",
    );
  }

  let playwright: typeof import("playwright-core");
  try {
    playwright = await import("playwright-core");
  } catch {
    throw new Error(
      "The browser setup dependency is unavailable. Reinstall goodreads-mcp and try again.",
    );
  }

  let browser: import("playwright-core").Browser | undefined;
  let page: import("playwright-core").Page | undefined;

  return {
    async open() {
      browser = await playwright.chromium.launch({
        executablePath,
        headless: false,
      });
      page = await browser.newPage();
      await page.goto(GOODREADS_HOME, { waitUntil: "domcontentloaded" });
    },
    async waitForUser() {
      await prompter.ask(
        "A Goodreads window is open. Sign in there yourself, then press Enter here. Your password is never read by this setup tool. ",
      );
    },
    async findCredentials(): Promise<GoodreadsCredentials> {
      if (!page) throw new Error("The Goodreads browser did not open.");

      const userId = await findUserIdThroughProfileMenu(page);
      if (!userId) {
        throw new Error(
          "Could not find your Goodreads profile URL after opening the account menu.",
        );
      }

      await page.goto(`https://www.goodreads.com/review/list/${userId}`, {
        waitUntil: "domcontentloaded",
      });
      const rssUrl = await waitForRssUrl(page);
      const rssKey = rssUrl ? parseGoodreadsRssKey(rssUrl) : undefined;

      return {
        userId,
        ...(rssKey ? { rssKey } : {}),
      };
    },
    async close() {
      await browser?.close();
    },
  };
}

async function findUserIdThroughProfileMenu(
  page: import("playwright-core").Page,
): Promise<string | undefined> {
  const accountMenu = await findVisibleLocator(
    page,
    [
      'button[aria-label*="account" i]',
      'button[aria-label*="profile" i]',
      'a[aria-label*="account" i]',
      '[data-testid*="avatar" i]',
      '[data-testid*="account" i]',
      "header button:has(img):last-child",
      "nav button:has(img):last-child",
      "button:has(img):last-child",
    ],
    "last",
  );

  if (!accountMenu) {
    throw new Error(
      "Could not find the Goodreads account menu/avatar after sign-in.",
    );
  }
  await accountMenu.click();

  const profileLink = await waitForVisibleLocator(
    page,
    [
      'a:has-text("Profile")',
      'button:has-text("Profile")',
      '[role="menuitem"]:has-text("Profile")',
    ],
    10_000,
  );
  if (!profileLink) {
    throw new Error(
      "Could not find the Profile option in the Goodreads account menu.",
    );
  }

  await profileLink.click();
  await page
    .waitForURL(
      (url) => /goodreads\.com\/user\/show\/\d+/i.test(url.toString()),
      { timeout: 10_000 },
    )
    .catch(() => undefined);

  return parseGoodreadsUserId(page.url()) ?? (await findUserIdOnPage(page));
}

async function findVisibleLocator(
  page: import("playwright-core").Page,
  selectors: string[],
  position: "first" | "last" = "first",
) {
  for (const selector of selectors) {
    const locator =
      position === "last"
        ? page.locator(selector).last()
        : page.locator(selector).first();
    if (await locator.isVisible().catch(() => false)) return locator;
  }
  return undefined;
}

async function waitForVisibleLocator(
  page: import("playwright-core").Page,
  selectors: string[],
  timeoutMs: number,
) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const locator = await findVisibleLocator(page, selectors);
    if (locator) return locator;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return undefined;
}

async function findUserIdOnPage(page: import("playwright-core").Page) {
  const href = await page
    .locator('a[href*="/user/show/"]')
    .first()
    .getAttribute("href")
    .catch(() => null);
  return href ? parseGoodreadsUserId(href) : undefined;
}

async function findRssUrl(page: import("playwright-core").Page) {
  return page
    .locator('a[href*="review/list_rss/"]')
    .first()
    .getAttribute("href")
    .catch(() => null);
}

async function waitForRssUrl(page: import("playwright-core").Page) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const href = await findRssUrl(page);
    if (href) return href;
    const currentUrl = page.url();
    if (currentUrl.includes("review/list_rss/")) return currentUrl;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("Could not find the Goodreads RSS link on My Books.");
}

async function findBrowserExecutable(): Promise<string | undefined> {
  const candidates = [
    process.env.GOODREADS_CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    `${homedir()}/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      await access(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Try the next standard browser location.
    }
  }
  return undefined;
}
