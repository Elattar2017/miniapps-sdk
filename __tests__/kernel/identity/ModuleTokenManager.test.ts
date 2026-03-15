/**
 * ModuleTokenManager Test Suite
 *
 * Tests for the module token factory flow: decryption,
 * token exchange, caching, and APIProxy integration.
 *
 * Flow: host authToken (via APIProxy) + moduleId → Token Factory → module token
 */

jest.mock("react-native");

import { ModuleTokenManager } from "../../../src/kernel/identity/ModuleTokenManager";
import type { ModuleManifest, ICryptoAdapter } from "../../../src/types";

// Suppress console output during tests
beforeEach(() => {
  jest.spyOn(console, "log").mockImplementation(() => {});
  jest.spyOn(console, "warn").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});
  jest.useFakeTimers({ now: 1700000000000 });
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
  (global as any).fetch = undefined;
});

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function createMockApiProxy() {
  return {
    setModuleToken: jest.fn(),
    removeModuleToken: jest.fn(),
    getModuleToken: jest.fn(),
    request: jest.fn(),
    requestAbsolute: jest.fn().mockResolvedValue({
      ok: true, status: 200, data: { token: 'default-token', expiresIn: 3600 }, headers: {}, latencyMs: 50,
    }),
  };
}

function createMockCryptoAdapter(): ICryptoAdapter {
  return {
    decrypt: jest.fn().mockResolvedValue("https://factory.example.com/token"),
    encrypt: jest.fn(),
    hash: jest.fn(),
    generateKey: jest.fn(),
    verifySignature: jest.fn(),
    secureStore: jest.fn(),
    secureRetrieve: jest.fn(),
    secureDelete: jest.fn(),
  };
}

function createMockDataBus() {
  return {
    publish: jest.fn(),
    subscribe: jest.fn(),
  };
}

function createManifest(overrides?: Partial<ModuleManifest>): ModuleManifest {
  return {
    id: "com.test.module",
    name: "Test Module",
    version: "1.0.0",
    description: "Test",
    icon: "test",
    category: "test",
    entryScreen: "main",
    screens: ["main"],
    permissions: { apis: [], storage: false },
    minSDKVersion: "1.0.0",
    signature: "dGVzdHNpZ25hdHVyZXRlc3RzaWduYXR1cmV0ZXN0c2ln",
    externalTokenFactoryURL: "ZW5jcnlwdGVkdXJs",
    apiDomains: ["api.example.com"],
    ...overrides,
  };
}

function mockApiSuccess(apiProxy: ReturnType<typeof createMockApiProxy>, token: string, expiresIn?: number) {
  const data: Record<string, unknown> = { token };
  if (expiresIn !== undefined) data.expiresIn = expiresIn;
  apiProxy.requestAbsolute.mockResolvedValue({
    ok: true, status: 200, data, headers: {}, latencyMs: 50,
  });
}

function mockApiError(apiProxy: ReturnType<typeof createMockApiProxy>, status: number) {
  apiProxy.requestAbsolute.mockResolvedValue({
    ok: false, status, data: { error: "failed" }, headers: {}, latencyMs: 50,
  });
}

function createManager(overrides?: {
  apiProxy?: ReturnType<typeof createMockApiProxy>;
  cryptoAdapter?: ICryptoAdapter;
  dataBus?: ReturnType<typeof createMockDataBus>;
  encryptionKey?: string;
}) {
  return new ModuleTokenManager({
    apiProxy: (overrides?.apiProxy ?? createMockApiProxy()) as any,
    cryptoAdapter: overrides?.cryptoAdapter ?? createMockCryptoAdapter(),
    dataBus: overrides?.dataBus as any,
    encryptionKey: overrides?.encryptionKey ?? "test-encryption-key",
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ModuleTokenManager", () => {
  describe("acquireToken", () => {
    it("returns acquired:false when manifest has no externalTokenFactoryURL", async () => {
      const mgr = createManager();
      const manifest = createManifest({ externalTokenFactoryURL: undefined });
      const result = await mgr.acquireToken(manifest);
      expect(result).toEqual({ acquired: false });
    });

    it("returns acquired:false with error when manifest has no apiDomains", async () => {
      const mgr = createManager();
      const manifest = createManifest({ apiDomains: undefined });
      const result = await mgr.acquireToken(manifest);
      expect(result.acquired).toBe(false);
      expect(result.error).toBe("No apiDomains declared");
    });

    it("returns acquired:false with error when apiDomains is empty", async () => {
      const mgr = createManager();
      const manifest = createManifest({ apiDomains: [] });
      const result = await mgr.acquireToken(manifest);
      expect(result.acquired).toBe(false);
      expect(result.error).toBe("No apiDomains declared");
    });

    it("decrypts factory URL and calls it with POST and moduleId", async () => {
      const crypto = createMockCryptoAdapter();
      const apiProxy = createMockApiProxy();
      mockApiSuccess(apiProxy, "factory-api-token");
      const mgr = createManager({ cryptoAdapter: crypto, apiProxy });
      const manifest = createManifest();
      const result = await mgr.acquireToken(manifest);

      expect(result.acquired).toBe(true);
      expect(result.token).toBe("factory-api-token");
      expect(crypto.decrypt).toHaveBeenCalledWith("ZW5jcnlwdGVkdXJs", "test-encryption-key");
      // Host authToken sent via APIProxy (skipAuth NOT set)
      expect(apiProxy.requestAbsolute).toHaveBeenCalledWith(
        "https://factory.example.com/token",
        expect.objectContaining({
          method: "POST",
          body: { moduleId: "com.test.module" },
        }),
      );
    });

    it("does NOT set skipAuth — host JWT is sent to factory", async () => {
      const apiProxy = createMockApiProxy();
      mockApiSuccess(apiProxy, "factory-api-token");
      const mgr = createManager({ apiProxy });
      await mgr.acquireToken(createManifest());

      const callArgs = apiProxy.requestAbsolute.mock.calls[0][1];
      expect(callArgs.skipAuth).toBeUndefined();
    });

    it("registers token with APIProxy on successful acquisition", async () => {
      const apiProxy = createMockApiProxy();
      mockApiSuccess(apiProxy, "factory-api-token");
      const mgr = createManager({ apiProxy });
      await mgr.acquireToken(createManifest());

      expect(apiProxy.setModuleToken).toHaveBeenCalledWith(
        "com.test.module",
        "factory-api-token",
        ["api.example.com"],
      );
    });

    it("uses cached token and does not call factory when cache is valid", async () => {
      const apiProxy = createMockApiProxy();
      mockApiSuccess(apiProxy, "factory-api-token");
      const mgr = createManager({ apiProxy });
      const manifest = createManifest();

      await mgr.acquireToken(manifest);
      expect(apiProxy.requestAbsolute).toHaveBeenCalledTimes(1);

      const result2 = await mgr.acquireToken(manifest);
      expect(result2.acquired).toBe(true);
      expect(result2.token).toBe("factory-api-token");
      expect(apiProxy.requestAbsolute).toHaveBeenCalledTimes(1);
    });

    it("calls factory when cached token is expired", async () => {
      const apiProxy = createMockApiProxy();
      mockApiSuccess(apiProxy, "token-v1", 10);
      const mgr = createManager({ apiProxy });
      const manifest = createManifest();

      await mgr.acquireToken(manifest);
      expect(apiProxy.requestAbsolute).toHaveBeenCalledTimes(1);

      jest.advanceTimersByTime(10001);

      mockApiSuccess(apiProxy, "token-v2", 3600);
      const result = await mgr.acquireToken(manifest);
      expect(result.token).toBe("token-v2");
    });

    it("returns error when factory returns HTTP error", async () => {
      const apiProxy = createMockApiProxy();
      mockApiError(apiProxy, 500);
      const mgr = createManager({ apiProxy });
      const result = await mgr.acquireToken(createManifest());

      expect(result.acquired).toBe(false);
      expect(result.error).toBe("Factory returned HTTP 500");
    });

    it("returns error when decrypt fails", async () => {
      const crypto = createMockCryptoAdapter();
      (crypto.decrypt as jest.Mock).mockRejectedValue(new Error("Decryption failed: key mismatch"));
      const mgr = createManager({ cryptoAdapter: crypto });
      const result = await mgr.acquireToken(createManifest());

      expect(result.acquired).toBe(false);
      expect(result.error).toContain("URL decryption failed");
    });

    it("publishes DataBus event on successful acquisition", async () => {
      const dataBus = createMockDataBus();
      const apiProxy = createMockApiProxy();
      mockApiSuccess(apiProxy, "factory-api-token");
      const mgr = createManager({ dataBus, apiProxy });
      await mgr.acquireToken(createManifest());

      expect(dataBus.publish).toHaveBeenCalledWith(
        "sdk:module:token:acquired",
        expect.objectContaining({ moduleId: "com.test.module", expiresAt: expect.any(Number) }),
      );
    });

    it("sends only moduleId in body (no moduleToken)", async () => {
      const apiProxy = createMockApiProxy();
      mockApiSuccess(apiProxy, "factory-api-token");
      const mgr = createManager({ apiProxy });
      const manifest = createManifest();
      await mgr.acquireToken(manifest);

      const callArgs = apiProxy.requestAbsolute.mock.calls[0][1];
      expect(callArgs.body).toEqual({ moduleId: manifest.id });
    });

    it("computes expiresAt correctly when factory provides expiresIn", async () => {
      const apiProxy = createMockApiProxy();
      mockApiSuccess(apiProxy, "factory-api-token", 7200);
      const mgr = createManager({ apiProxy });
      const result = await mgr.acquireToken(createManifest());

      expect(result.expiresAt).toBe(Date.now() + 7200 * 1000);
    });

    it("uses default TTL (3600s) when factory does not provide expiresIn", async () => {
      const apiProxy = createMockApiProxy();
      apiProxy.requestAbsolute.mockResolvedValue({
        ok: true, status: 200, data: { token: "factory-api-token" }, headers: {}, latencyMs: 50,
      });
      const mgr = createManager({ apiProxy });
      const result = await mgr.acquireToken(createManifest());

      expect(result.expiresAt).toBe(Date.now() + 3600 * 1000);
    });

    it("passes apiDomains from manifest to APIProxy.setModuleToken", async () => {
      const apiProxy = createMockApiProxy();
      mockApiSuccess(apiProxy, "factory-api-token");
      const mgr = createManager({ apiProxy });
      const manifest = createManifest({ apiDomains: ["a.com", "b.com"] });
      await mgr.acquireToken(manifest);

      expect(apiProxy.setModuleToken).toHaveBeenCalledWith(
        "com.test.module",
        "factory-api-token",
        ["a.com", "b.com"],
      );
    });

    it("returns error when factory response is missing token field", async () => {
      const apiProxy = createMockApiProxy();
      apiProxy.requestAbsolute.mockResolvedValue({
        ok: true, status: 200, data: { expiresIn: 3600 }, headers: {}, latencyMs: 50,
      });
      const mgr = createManager({ apiProxy });
      const result = await mgr.acquireToken(createManifest());

      expect(result.acquired).toBe(false);
      expect(result.error).toBe("Factory response missing token field");
    });

    it("second acquireToken uses cache without factory call", async () => {
      const apiProxy = createMockApiProxy();
      mockApiSuccess(apiProxy, "cached-token");
      const mgr = createManager({ apiProxy });
      const manifest = createManifest();

      const r1 = await mgr.acquireToken(manifest);
      expect(r1.acquired).toBe(true);

      const r2 = await mgr.acquireToken(manifest);
      expect(r2.acquired).toBe(true);
      expect(r2.token).toBe("cached-token");
      expect(apiProxy.requestAbsolute).toHaveBeenCalledTimes(1);
    });

    it("decrypts URL with the configured encryption key", async () => {
      const crypto = createMockCryptoAdapter();
      const mgr = createManager({ cryptoAdapter: crypto, encryptionKey: "my-secret-key" });
      await mgr.acquireToken(createManifest());

      expect(crypto.decrypt).toHaveBeenCalledWith("ZW5jcnlwdGVkdXJs", "my-secret-key");
    });

    it("stores token in cache for future access", async () => {
      const apiProxy = createMockApiProxy();
      mockApiSuccess(apiProxy, "stored-token");
      const mgr = createManager({ apiProxy });
      const manifest = createManifest();
      await mgr.acquireToken(manifest);

      expect(mgr.getToken(manifest.id)).toBe("stored-token");
    });
  });

  describe("invalidateToken", () => {
    it("removes from cache and calls APIProxy.removeModuleToken", async () => {
      const apiProxy = createMockApiProxy();
      mockApiSuccess(apiProxy, "token-to-remove");
      const mgr = createManager({ apiProxy });
      const manifest = createManifest();

      await mgr.acquireToken(manifest);
      mgr.invalidateToken(manifest.id);

      expect(apiProxy.removeModuleToken).toHaveBeenCalledWith("com.test.module");
      expect(mgr.getToken(manifest.id)).toBeNull();
    });
  });

  describe("getToken", () => {
    it("returns cached token when not expired", async () => {
      const apiProxy = createMockApiProxy();
      mockApiSuccess(apiProxy, "valid-token", 3600);
      const mgr = createManager({ apiProxy });
      await mgr.acquireToken(createManifest());

      expect(mgr.getToken("com.test.module")).toBe("valid-token");
    });

    it("returns null when token is expired", async () => {
      const apiProxy = createMockApiProxy();
      mockApiSuccess(apiProxy, "expiring-token", 5);
      const mgr = createManager({ apiProxy });
      await mgr.acquireToken(createManifest());

      jest.advanceTimersByTime(6000);
      expect(mgr.getToken("com.test.module")).toBeNull();
    });

    it("returns null when no token is stored", () => {
      const mgr = createManager();
      expect(mgr.getToken("com.nonexistent.module")).toBeNull();
    });
  });

  describe("refreshToken", () => {
    it("invalidates existing token then re-acquires from factory", async () => {
      const apiProxy = createMockApiProxy();
      mockApiSuccess(apiProxy, "original-token");
      const mgr = createManager({ apiProxy });
      const manifest = createManifest();

      await mgr.acquireToken(manifest);
      expect(mgr.getToken(manifest.id)).toBe("original-token");

      mockApiSuccess(apiProxy, "refreshed-token");
      const result = await mgr.refreshToken(manifest);

      expect(result.acquired).toBe(true);
      expect(result.token).toBe("refreshed-token");
      expect(apiProxy.removeModuleToken).toHaveBeenCalledWith("com.test.module");
    });
  });
});
