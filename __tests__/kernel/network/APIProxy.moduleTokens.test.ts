/**
 * APIProxy Module Token Tests
 *
 * Tests for module-specific token registration, domain matching,
 * and token injection in API requests.
 */

import { APIProxy } from "../../../src/kernel/network/APIProxy";
import type { APIProxyConfig } from "../../../src/types";

// Suppress console output during tests
beforeEach(() => {
  mockFetch.mockClear();
  jest.spyOn(console, "log").mockImplementation(() => {});
  jest.spyOn(console, "warn").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Mock fetch + AbortController
// ---------------------------------------------------------------------------

const mockFetch = jest.fn();
(global as any).fetch = mockFetch;

// Ensure AbortController is available in test environment
if (typeof AbortController === "undefined") {
  (global as any).AbortController = class {
    signal = {};
    abort() {}
  };
}

/** Build a mock Response object */
function mockResponse(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): Response {
  const headersInstance = new Map(Object.entries(headers));
  return {
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn().mockResolvedValue(body),
    headers: {
      forEach: (cb: (value: string, key: string) => void) => {
        headersInstance.forEach((value, key) => cb(value, key));
      },
    },
  } as unknown as Response;
}

function createProxy(overrides?: Partial<APIProxyConfig>): APIProxy {
  return new APIProxy({
    baseUrl: "https://api.host.com",
    authToken: "default-auth-token",
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("APIProxy - Module Tokens", () => {
  describe("setModuleToken / getModuleToken / removeModuleToken", () => {
    it("stores token for moduleId", () => {
      const proxy = createProxy();
      proxy.setModuleToken("com.test.mod", "mod-token", ["api.example.com"]);
      expect(proxy.getModuleToken("com.test.mod")).toBe("mod-token");
    });

    it("removes token for moduleId", () => {
      const proxy = createProxy();
      proxy.setModuleToken("com.test.mod", "mod-token", ["api.example.com"]);
      proxy.removeModuleToken("com.test.mod");
      expect(proxy.getModuleToken("com.test.mod")).toBeUndefined();
    });

    it("returns undefined for unknown moduleId", () => {
      const proxy = createProxy();
      expect(proxy.getModuleToken("com.unknown")).toBeUndefined();
    });

    it("overwrites previous token for same moduleId", () => {
      const proxy = createProxy();
      proxy.setModuleToken("com.test.mod", "token-v1", ["a.com"]);
      proxy.setModuleToken("com.test.mod", "token-v2", ["b.com"]);
      expect(proxy.getModuleToken("com.test.mod")).toBe("token-v2");
    });
  });

  describe("request() with module tokens", () => {
    it("uses module token for matching domain", async () => {
      mockFetch.mockResolvedValueOnce(mockResponse(200, { ok: true }));
      const proxy = createProxy({ baseUrl: "https://api.example.com" });
      proxy.setModuleToken("com.test.mod", "module-specific-token", ["api.example.com"]);

      await proxy.request("/data");

      const callHeaders = mockFetch.mock.calls[0][1].headers;
      expect(callHeaders["Authorization"]).toBe("Bearer module-specific-token");
    });

    it("uses default auth token for non-matching domain", async () => {
      mockFetch.mockResolvedValueOnce(mockResponse(200, { ok: true }));
      const proxy = createProxy({ baseUrl: "https://api.host.com" });
      proxy.setModuleToken("com.test.mod", "module-token", ["api.other.com"]);

      await proxy.request("/data");

      const callHeaders = mockFetch.mock.calls[0][1].headers;
      expect(callHeaders["Authorization"]).toBe("Bearer default-auth-token");
    });

    it("selects correct token when multiple modules registered", async () => {
      mockFetch.mockResolvedValueOnce(mockResponse(200, { ok: true }));
      const proxy = createProxy({ baseUrl: "https://api.vendorb.com" });
      proxy.setModuleToken("com.vendor.a", "token-a", ["api.vendora.com"]);
      proxy.setModuleToken("com.vendor.b", "token-b", ["api.vendorb.com"]);

      await proxy.request("/resource");

      const callHeaders = mockFetch.mock.calls[0][1].headers;
      expect(callHeaders["Authorization"]).toBe("Bearer token-b");
    });

    it("does not inject module token when skipAuth is true", async () => {
      mockFetch.mockResolvedValueOnce(mockResponse(200, { ok: true }));
      const proxy = createProxy({ baseUrl: "https://api.example.com" });
      proxy.setModuleToken("com.test.mod", "module-token", ["api.example.com"]);

      await proxy.request("/data", { skipAuth: true });

      const callHeaders = mockFetch.mock.calls[0][1].headers;
      expect(callHeaders["Authorization"]).toBeUndefined();
    });

    it("matches subdomains (api.example.com matches example.com domain)", async () => {
      mockFetch.mockResolvedValueOnce(mockResponse(200, { ok: true }));
      const proxy = createProxy({ baseUrl: "https://api.example.com" });
      proxy.setModuleToken("com.test.mod", "subdomain-token", ["example.com"]);

      await proxy.request("/data");

      const callHeaders = mockFetch.mock.calls[0][1].headers;
      expect(callHeaders["Authorization"]).toBe("Bearer subdomain-token");
    });
  });
});
