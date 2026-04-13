/**
 * Spike 0a: Inspect heb-sdk-unofficial exports and API surface.
 *
 * This test verifies the SDK is importable and documents the actual
 * function signatures we'll depend on. No network calls.
 */
import { describe, it, expect } from "vitest";
import {
  HEBClient,
  createTokenSession,
  createSessionFromCookies,
  searchProducts,
  searchStores,
  setStore,
  getProductDetails,
  getProductImageUrl,
  isSessionValid,
  ENDPOINTS,
  MOBILE_GRAPHQL_HASHES,
} from "heb-sdk-unofficial";

describe("SDK exports exist", () => {
  it("exports HEBClient class", () => {
    expect(HEBClient).toBeDefined();
    expect(typeof HEBClient).toBe("function"); // class constructor
  });

  it("exports session factories", () => {
    expect(typeof createTokenSession).toBe("function");
    expect(typeof createSessionFromCookies).toBe("function");
    expect(typeof isSessionValid).toBe("function");
  });

  it("exports standalone functions for search and products", () => {
    expect(typeof searchProducts).toBe("function");
    expect(typeof searchStores).toBe("function");
    expect(typeof setStore).toBe("function");
    expect(typeof getProductDetails).toBe("function");
    expect(typeof getProductImageUrl).toBe("function");
  });

  it("exports API endpoints", () => {
    expect(ENDPOINTS.graphql).toBe("https://www.heb.com/graphql");
    expect(ENDPOINTS.graphqlMobile).toBe(
      "https://api-edge.heb-ecom-api.hebdigital-prd.com/graphql",
    );
  });

  it("exports mobile GraphQL hashes including ProductSearchPageV2", () => {
    expect(MOBILE_GRAPHQL_HASHES.ProductSearchPageV2).toBeDefined();
    expect(typeof MOBILE_GRAPHQL_HASHES.ProductSearchPageV2).toBe("string");
  });
});

describe("createTokenSession", () => {
  it("creates a bearer session from tokens", () => {
    const session = createTokenSession({
      accessToken: "fake-access-token",
      refreshToken: "fake-refresh-token",
    });

    expect(session).toBeDefined();
    expect(session.authMode).toBe("bearer");
    expect(session.tokens).toBeDefined();
    expect(session.tokens?.accessToken).toBe("fake-access-token");
    expect(session.tokens?.refreshToken).toBe("fake-refresh-token");
    expect(session.headers).toBeDefined();
    expect(session.headers.authorization).toContain("Bearer");
  });

  it("creates a session with custom endpoints", () => {
    const session = createTokenSession(
      { accessToken: "fake" },
      {
        endpoints: {
          graphql: "https://custom.example.com/graphql",
        },
      },
    );

    expect(session.endpoints?.graphql).toBe("https://custom.example.com/graphql");
  });
});

describe("HEBClient", () => {
  it("can be instantiated with a bearer session", () => {
    const session = createTokenSession({
      accessToken: "fake-access-token",
    });
    const client = new HEBClient(session);

    expect(client).toBeDefined();
    expect(client.session).toBe(session);
    expect(typeof client.search).toBe("function");
    expect(typeof client.getProduct).toBe("function");
    expect(typeof client.getImageUrl).toBe("function");
    expect(typeof client.getSessionInfo).toBe("function");
  });

  it("exposes session info", () => {
    const session = createTokenSession({
      accessToken: "fake-access-token",
    });
    const client = new HEBClient(session);
    const info = client.getSessionInfo();

    expect(info).toHaveProperty("storeId");
    expect(info).toHaveProperty("isValid");
    expect(info).toHaveProperty("shoppingContext");
  });
});

describe("getProductImageUrl", () => {
  it("builds image URL from product ID", () => {
    const url = getProductImageUrl("1875945");
    expect(url).toContain("1875945");
    expect(url).toContain("images.heb.com");
  });

  it("accepts custom size", () => {
    const url = getProductImageUrl("1875945", 500);
    expect(url).toContain("500");
  });
});
