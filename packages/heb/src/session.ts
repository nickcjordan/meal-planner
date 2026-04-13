import puppeteer from "puppeteer-core";
import { saveHebCookies, getHebCookies } from "./cookies.js";

const CHROME_PATHS = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium-browser",
];

function findChrome(): string {
  // Allow override via env var
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;

  // Check common paths (puppeteer-core doesn't bundle Chrome)
  for (const p of CHROME_PATHS) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const fs = require("node:fs");
      if (fs.existsSync(p)) return p;
    } catch {
      // continue
    }
  }

  throw new Error(
    "Chrome not found. Set CHROME_PATH env var to your Chrome executable.",
  );
}

/** Max age before cookies are considered stale (10 minutes). */
const COOKIE_MAX_AGE_MS = 10 * 60 * 1000;

/**
 * Check if stored cookies are still fresh.
 */
export async function hasFreshCookies(): Promise<boolean> {
  const record = await getHebCookies();
  if (!record) return false;

  const age = Date.now() - new Date(record.capturedAt).getTime();
  return age < COOKIE_MAX_AGE_MS;
}

/**
 * Get fresh cookies, auto-refreshing via Puppeteer if stale.
 * Returns the cookie header string, or null if refresh failed.
 */
export async function getFreshCookies(
  storeId: string,
): Promise<string | null> {
  const record = await getHebCookies();

  if (record) {
    const age = Date.now() - new Date(record.capturedAt).getTime();
    if (age < COOKIE_MAX_AGE_MS && record.storeId === storeId) {
      return record.cookies;
    }
  }

  // Cookies are stale or missing — refresh via Puppeteer
  return refreshSession(storeId);
}

/**
 * Launch headless Chrome, navigate to HEB, extract session cookies.
 * Returns the cookie header string, or null if it failed.
 */
export async function refreshSession(
  storeId: string,
): Promise<string | null> {
  let browser;

  try {
    const chromePath = findChrome();

    browser = await puppeteer.launch({
      executablePath: chromePath,
      headless: true,
      args: [
        "--disable-blink-features=AutomationControlled",
        "--no-first-run",
        "--no-default-browser-check",
      ],
    });

    const page = await browser.newPage();

    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    );

    // Navigate to HEB — Imperva challenge auto-solved by real browser
    await page.goto("https://www.heb.com/", {
      waitUntil: "networkidle2",
      timeout: 30_000,
    });

    // Wait for reese84 token generation
    await new Promise((r) => setTimeout(r, 5000));

    // Set store context
    await page.setCookie({
      name: "CURR_SESSION_STORE",
      value: storeId,
      domain: ".heb.com",
    });

    // Navigate to trigger store cookie
    await page.goto("https://www.heb.com/search?q=milk", {
      waitUntil: "networkidle2",
      timeout: 30_000,
    });
    await new Promise((r) => setTimeout(r, 2000));

    // Extract cookies
    const cookies = await page.cookies("https://www.heb.com");
    const cookieHeader = cookies
      .map((c) => `${c.name}=${c.value}`)
      .join("; ");

    // Save to DynamoDB
    await saveHebCookies(cookieHeader, storeId);

    await browser.close();
    browser = undefined;

    return cookieHeader;
  } catch (err) {
    console.error("HEB session refresh failed:", err);
    return null;
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch {
        // ignore
      }
    }
  }
}
