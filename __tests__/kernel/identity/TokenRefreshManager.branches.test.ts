/**
 * TokenRefreshManager Branches Test Suite
 * Covers: scheduleRefresh when isMonitoring becomes false, finally block,
 * refresh during ongoing refresh, stop clears timer, short TTL, error with backoff.
 */
import { TokenRefreshManager } from "../../../src/kernel/identity/TokenRefreshManager";
import { JWTValidator } from "../../../src/kernel/identity/JWTValidator";
import { CircuitBreaker } from "../../../src/kernel/errors/CircuitBreaker";

jest.mock("../../../src/kernel/identity/JWTValidator", () => ({
  JWTValidator: jest.fn().mockImplementation(() => ({
    getTimeToExpiry: jest.fn().mockReturnValue(500),
    validate: jest.fn().mockReturnValue({ valid: true }),
    decode: jest.fn(),
    isExpired: jest.fn().mockReturnValue(false),
  })),
}));

jest.mock("../../../src/kernel/errors/CircuitBreaker", () => {
  const { CircuitBreaker: Real } = jest.requireActual("../../../src/kernel/errors/CircuitBreaker");
  return { CircuitBreaker: jest.fn().mockImplementation((c?: any) => new Real({ ...c, resetTimeout: 100 })) };
});

jest.mock("../../../src/constants/defaults", () => {
  const actual = jest.requireActual("../../../src/constants/defaults");
  return { ...actual, TOKEN_REFRESH: { ...actual.TOKEN_REFRESH, MIN_RETRY_DELAY: 10, MAX_RETRY_DELAY: 100, BACKOFF_MULTIPLIER: 2, REFRESH_AT_PERCENTAGE: 0.8 } };
});

beforeEach(() => {
  jest.spyOn(console, "log").mockImplementation(() => {});
  jest.spyOn(console, "warn").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { jest.restoreAllMocks(); });

const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

function getValidator(): any {
  const M = JWTValidator as jest.MockedClass<typeof JWTValidator>;
  return M.mock.results[M.mock.results.length - 1]?.value;
}

describe("TokenRefreshManager branches", () => {
  let cb: jest.Mock<Promise<string>>;
  beforeEach(() => { jest.clearAllMocks(); cb = jest.fn().mockResolvedValue("new-tok"); });

  it("scheduleRefresh resolves immediately when isMonitoring becomes false", async () => {
    const mgr = new TokenRefreshManager(cb);
    const v = getValidator();
    v.getTimeToExpiry.mockReturnValue(200);
    mgr.startMonitoring("tok");
    // Stop monitoring before the scheduled refresh fires
    await wait(10);
    mgr.stopMonitoring();
    await wait(250);
    // Callback should not have been called since we stopped monitoring
    expect(cb).not.toHaveBeenCalled();
  });

  it("finally block resolves the schedule promise after refresh", async () => {
    const mgr = new TokenRefreshManager(cb);
    const v = getValidator();
    v.getTimeToExpiry.mockReturnValue(50);
    cb.mockImplementation(async () => { v.getTimeToExpiry.mockReturnValue(60000); return "fresh"; });
    mgr.startMonitoring("tok");
    await wait(150);
    // The scheduled refresh should have completed and resolved
    expect(cb).toHaveBeenCalledTimes(1);
    mgr.stopMonitoring();
  });

  it("refresh during ongoing refresh is handled by sequential execution", async () => {
    const mgr = new TokenRefreshManager(cb);
    const v = getValidator();
    v.getTimeToExpiry.mockReturnValue(60000);
    cb.mockImplementation(async () => { await wait(30); v.getTimeToExpiry.mockReturnValue(60000); return "tok"; });
    const p1 = mgr.refreshNow();
    const p2 = mgr.refreshNow();
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toBe("tok");
    expect(r2).toBe("tok");
    mgr.stopMonitoring();
  });

  it("stop monitoring clears scheduled timer", async () => {
    const mgr = new TokenRefreshManager(cb);
    const v = getValidator();
    v.getTimeToExpiry.mockReturnValue(300);
    mgr.startMonitoring("tok");
    await wait(10);
    mgr.stopMonitoring();
    await wait(350);
    expect(cb).not.toHaveBeenCalled();
  });

  it("token expiry with short TTL triggers near-immediate refresh", async () => {
    const mgr = new TokenRefreshManager(cb);
    const v = getValidator();
    v.getTimeToExpiry.mockReturnValue(10); // very short TTL
    cb.mockImplementation(async () => { v.getTimeToExpiry.mockReturnValue(60000); return "quick"; });
    mgr.startMonitoring("short-tok");
    await wait(50);
    expect(cb).toHaveBeenCalled();
    mgr.stopMonitoring();
  });

  it("error during refresh retries with backoff", async () => {
    const mgr = new TokenRefreshManager(cb);
    cb.mockRejectedValueOnce(new Error("fail1")).mockResolvedValue("recovered");
    const result = await mgr.refreshNow();
    expect(result).toBe("recovered");
    expect(cb).toHaveBeenCalledTimes(2);
  });
});
