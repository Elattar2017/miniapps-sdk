/**
 * SyncEngine Pull Method Test Suite
 *
 * Verifies that the SyncEngine uses POST (not GET) for pull requests,
 * sends the correct body with since timestamp, and targets the
 * correct URL.
 */

import { SyncEngine } from "../../../src/kernel/sync/SyncEngine";
import { ConflictResolver } from "../../../src/kernel/sync/ConflictResolver";
import type { IStorageBackend } from "../../../src/types";

// Suppress console output during tests
beforeEach(() => {
  jest.spyOn(console, "log").mockImplementation(() => {});
  jest.spyOn(console, "warn").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

function createMockStorage(): IStorageBackend {
  const store: Record<string, string> = {};
  return {
    getString: jest.fn((key: string) => store[key] ?? null),
    setString: jest.fn((key: string, value: string) => { store[key] = value; }),
    delete: jest.fn((key: string) => { delete store[key]; }),
    getAllKeys: jest.fn(() => Object.keys(store)),
    clearAll: jest.fn(() => {
      for (const k of Object.keys(store)) delete store[k];
    }),
  };
}

function createMockAPIProxy() {
  return {
    request: jest.fn().mockImplementation(async () => {
      return { ok: true, status: 200, data: { entries: [], collection: 'unknown' }, headers: {}, latencyMs: 50 };
    }),
    updateAuthToken: jest.fn(),
  };
}

function createEngine(apiProxy: ReturnType<typeof createMockAPIProxy>) {
  const storage = createMockStorage();
  const conflictResolver = new ConflictResolver({
    defaultStrategy: "server-wins",
    maxConflictQueueSize: 100,
    conflictTTL: 3600,
  });

  const engine = new SyncEngine(
    storage,
    apiProxy as unknown as import("../../../src/kernel/network/APIProxy").APIProxy,
    conflictResolver,
    undefined,
    { nodeId: "test-node" },
  );

  return engine;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SyncEngine pull method", () => {
  it("uses POST method (not GET) for pull requests", async () => {
    const apiProxy = createMockAPIProxy();
    const engine = createEngine(apiProxy);

    await engine.sync("tasks");

    // Find the pull call
    const pullCall = apiProxy.request.mock.calls.find(
      (call: unknown[]) => (call[0] as string).includes("/pull"),
    );

    expect(pullCall).toBeDefined();
    expect(pullCall[1]).toEqual(
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("sends body with since timestamp", async () => {
    const apiProxy = createMockAPIProxy();
    const engine = createEngine(apiProxy);

    await engine.sync("tasks");

    const pullCall = apiProxy.request.mock.calls.find(
      (call: unknown[]) => (call[0] as string).includes("/pull"),
    );

    expect(pullCall).toBeDefined();
    expect(pullCall[1]).toHaveProperty("body");
    expect(pullCall[1].body).toHaveProperty("since");
  });

  it("sends pull request to the correct URL", async () => {
    const apiProxy = createMockAPIProxy();
    const engine = createEngine(apiProxy);

    await engine.sync("documents");

    const pullCall = apiProxy.request.mock.calls.find(
      (call: unknown[]) => (call[0] as string).includes("/pull"),
    );

    expect(pullCall).toBeDefined();
    expect(pullCall[0]).toBe("/api/sync/documents/pull");
  });
});
