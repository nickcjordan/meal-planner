/**
 * Spike 0b: Test PKCE OAuth flow against HEB's auth server.
 *
 * This is an INTERACTIVE test — it opens a browser for HEB login.
 * Run manually with: npx vitest run src/__tests__/spike-oauth.test.ts
 *
 * What we're validating:
 * 1. Can we build a valid PKCE auth URL for HEB?
 * 2. Does HEB's auth server accept our custom redirect URI?
 * 3. Can we exchange the auth code for tokens?
 * 4. What does the token response look like?
 *
 * Known HEB OAuth details (reverse-engineered from iOS app):
 * - Client ID: myheb-ios-prd
 * - Auth endpoint: https://accounts.heb.com/oidc/auth
 * - Token endpoint: https://accounts.heb.com/oidc/token
 */
import { describe, it, expect } from "vitest";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomBytes, createHash } from "node:crypto";
import { URL, URLSearchParams } from "node:url";

// --- PKCE helpers (standard OAuth 2.0) ---

function generateCodeVerifier(): string {
  // 32 bytes = 43 chars in base64url
  return randomBytes(32).toString("base64url");
}

function generateCodeChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

function generateState(): string {
  return randomBytes(16).toString("base64url");
}

// --- HEB OAuth constants ---

const HEB_CLIENT_ID = "myheb-ios-prd";
const HEB_AUTH_ENDPOINT = "https://accounts.heb.com/oidc/auth";
const HEB_TOKEN_ENDPOINT = "https://accounts.heb.com/oidc/token";
const REDIRECT_PORT = 9876;
const REDIRECT_URI = `http://localhost:${REDIRECT_PORT}/callback`;

// --- Tests ---

describe("PKCE utilities", () => {
  it("generates a valid code verifier (43-128 chars, base64url)", () => {
    const verifier = generateCodeVerifier();
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(verifier.length).toBeLessThanOrEqual(128);
    // base64url charset: [A-Za-z0-9_-]
    expect(verifier).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("generates a code challenge from verifier", () => {
    const verifier = generateCodeVerifier();
    const challenge = generateCodeChallenge(verifier);
    expect(challenge).toBeDefined();
    expect(challenge.length).toBeGreaterThan(0);
    expect(challenge).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("generates unique state values", () => {
    const state1 = generateState();
    const state2 = generateState();
    expect(state1).not.toBe(state2);
  });
});

describe("HEB auth URL construction", () => {
  it("builds a valid PKCE authorization URL", () => {
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);
    const state = generateState();

    const authUrl = new URL(HEB_AUTH_ENDPOINT);
    authUrl.searchParams.set("client_id", HEB_CLIENT_ID);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
    authUrl.searchParams.set("state", state);
    authUrl.searchParams.set("code_challenge", codeChallenge);
    authUrl.searchParams.set("code_challenge_method", "S256");
    authUrl.searchParams.set("scope", "openid profile email");

    const urlStr = authUrl.toString();
    expect(urlStr).toContain("accounts.heb.com");
    expect(urlStr).toContain("client_id=myheb-ios-prd");
    expect(urlStr).toContain("response_type=code");
    expect(urlStr).toContain("code_challenge_method=S256");
    expect(urlStr).toContain(`state=${state}`);

    // Log for manual testing
    console.log("\n=== HEB OAuth Authorization URL ===");
    console.log(urlStr);
    console.log("===================================\n");
    console.log("Code verifier (save this for token exchange):", codeVerifier);
    console.log("State:", state);
  });
});

/**
 * INTERACTIVE TEST: Full PKCE flow with local callback server.
 *
 * This test:
 * 1. Generates PKCE params
 * 2. Prints the auth URL for you to open in a browser
 * 3. Starts a local HTTP server to capture the callback
 * 4. Waits for HEB to redirect back with an auth code
 * 5. Exchanges the code for tokens
 *
 * Run with a longer timeout:
 *   npx vitest run src/__tests__/spike-oauth.test.ts --test-timeout=120000
 *
 * Skip in CI by checking for HEB_SPIKE_INTERACTIVE env var.
 */
describe.skipIf(!process.env.HEB_SPIKE_INTERACTIVE)("interactive PKCE flow", () => {
  it(
    "completes full OAuth PKCE flow and obtains tokens",
    async () => {
      // Step 1: Generate PKCE params
      const codeVerifier = generateCodeVerifier();
      const codeChallenge = generateCodeChallenge(codeVerifier);
      const state = generateState();

      // Step 2: Build auth URL
      const authUrl = new URL(HEB_AUTH_ENDPOINT);
      authUrl.searchParams.set("client_id", HEB_CLIENT_ID);
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
      authUrl.searchParams.set("state", state);
      authUrl.searchParams.set("code_challenge", codeChallenge);
      authUrl.searchParams.set("code_challenge_method", "S256");
      authUrl.searchParams.set("scope", "openid profile email");

      console.log("\n╔══════════════════════════════════════════════════════╗");
      console.log("║          HEB OAuth PKCE Interactive Test             ║");
      console.log("╠══════════════════════════════════════════════════════╣");
      console.log("║ 1. Open this URL in your browser:                   ║");
      console.log("╚══════════════════════════════════════════════════════╝\n");
      console.log(authUrl.toString());
      console.log("\nWaiting for callback on http://localhost:" + REDIRECT_PORT + "/callback ...\n");

      // Step 3: Start local server to capture callback
      const { code, callbackState } = await waitForCallback(state);

      expect(callbackState).toBe(state);
      expect(code).toBeDefined();
      expect(code.length).toBeGreaterThan(0);

      console.log("\n✓ Received auth code:", code.substring(0, 20) + "...");
      console.log("✓ State matches:", callbackState === state);

      // Step 4: Exchange code for tokens
      console.log("\nExchanging code for tokens...");

      const tokenResponse = await fetch(HEB_TOKEN_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          client_id: HEB_CLIENT_ID,
          code,
          redirect_uri: REDIRECT_URI,
          code_verifier: codeVerifier,
        }).toString(),
      });

      console.log("Token endpoint status:", tokenResponse.status);

      const tokenBody = await tokenResponse.text();

      if (tokenResponse.ok) {
        const tokens = JSON.parse(tokenBody);
        console.log("\n✓ TOKEN EXCHANGE SUCCEEDED!");
        console.log("Token response keys:", Object.keys(tokens));
        console.log("token_type:", tokens.token_type);
        console.log("expires_in:", tokens.expires_in);
        console.log("scope:", tokens.scope);
        console.log("access_token length:", tokens.access_token?.length);
        console.log("refresh_token length:", tokens.refresh_token?.length);
        console.log("id_token length:", tokens.id_token?.length);

        // Save tokens to a temp file for the next spike test
        const { writeFileSync, mkdirSync } = await import("node:fs");
        const tokenData = {
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          idToken: tokens.id_token,
          expiresIn: tokens.expires_in,
          tokenType: tokens.token_type,
          obtainedAt: new Date().toISOString(),
        };
        mkdirSync("tmp", { recursive: true });
        writeFileSync("tmp/heb-tokens.json", JSON.stringify(tokenData, null, 2));
        console.log("\nTokens saved to packages/heb/tmp/heb-tokens.json");

        expect(tokens.access_token).toBeDefined();
      } else {
        console.log("\n✗ TOKEN EXCHANGE FAILED");
        console.log("Response:", tokenBody);

        // Still useful — log the error so we know what happened
        const errorData = JSON.parse(tokenBody).error ?? tokenBody;
        console.log("Error:", errorData);

        // Don't fail the test — we want to see the error output
        // but do record what happened
        expect(tokenResponse.ok).toBe(true);
      }
    },
    { timeout: 120_000 },
  ); // 2 minute timeout for human interaction
});

/**
 * Start a local HTTP server and wait for HEB to redirect back.
 * Returns the auth code and state from the callback URL.
 */
function waitForCallback(
  _expectedState: string,
): Promise<{ code: string; callbackState: string }> {
  return new Promise((resolve, reject) => {
    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      const url = new URL(req.url ?? "/", `http://localhost:${REDIRECT_PORT}`);

      if (url.pathname === "/callback") {
        const code = url.searchParams.get("code");
        const callbackState = url.searchParams.get("state");
        const error = url.searchParams.get("error");
        const errorDescription = url.searchParams.get("error_description");

        if (error) {
          res.writeHead(400, { "Content-Type": "text/html" });
          res.end(`<h1>OAuth Error</h1><p>${error}: ${errorDescription}</p>`);
          server.close();
          reject(new Error(`OAuth error: ${error} - ${errorDescription}`));
          return;
        }

        if (!code) {
          res.writeHead(400, { "Content-Type": "text/html" });
          res.end("<h1>Missing auth code</h1>");
          server.close();
          reject(new Error("No auth code in callback"));
          return;
        }

        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(
          "<h1>Success!</h1><p>Auth code received. You can close this tab.</p>",
        );
        server.close();
        resolve({ code, callbackState: callbackState ?? "" });
      } else {
        res.writeHead(404);
        res.end("Not found");
      }
    });

    server.listen(REDIRECT_PORT, () => {
      console.log(`Callback server listening on port ${REDIRECT_PORT}`);
    });

    // Timeout after 2 minutes
    setTimeout(() => {
      server.close();
      reject(new Error("Timeout waiting for OAuth callback"));
    }, 115_000);
  });
}
