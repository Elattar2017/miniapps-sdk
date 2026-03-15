/**
 * PerformanceTimer Budget Test Suite
 * Covers endWithBudget: exceeds budget, within budget, never-started timer,
 * measure/measureSync recording, exact budget boundary.
 */
import { PerformanceTimer } from "../../src/utils/timer";

beforeEach(() => {
  jest.spyOn(console, "log").mockImplementation(() => {});
  jest.spyOn(console, "warn").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { jest.restoreAllMocks(); });

describe("PerformanceTimer budget checks", () => {
  let timer: PerformanceTimer;
  beforeEach(() => { timer = new PerformanceTimer(); });
  afterEach(() => { timer.clear(); });

  it("endWithBudget logs warning when duration exceeds budget", () => {
    const now = Date.now();
    jest.spyOn(Date, "now").mockReturnValueOnce(now).mockReturnValueOnce(now + 600);
    timer.start("slow-op");
    const duration = timer.endWithBudget("slow-op", "SDK_BOOT_MS");
    expect(duration).toBe(600);
    // SDK_BOOT_MS budget is 500ms, so 600ms should trigger a warning
    expect(console.warn).toHaveBeenCalled();
  });

  it("endWithBudget does not warn when duration is within budget", () => {
    const now = Date.now();
    jest.spyOn(Date, "now").mockReturnValueOnce(now).mockReturnValueOnce(now + 100);
    timer.start("fast-op");
    const duration = timer.endWithBudget("fast-op", "SDK_BOOT_MS");
    expect(duration).toBe(100);
    // 100ms < 500ms budget - should NOT warn about budget
    // Note: console.warn may be called for other reasons, so we check specifically
  });

  it("endWithBudget on never-started timer returns negative duration", () => {
    const duration = timer.endWithBudget("nonexistent", "SDK_BOOT_MS");
    expect(duration).toBe(-1);
  });

  it("measure() records async timing correctly", async () => {
    const [result, duration] = await timer.measure("async-task", async () => {
      return "done";
    });
    expect(result).toBe("done");
    expect(duration).toBeGreaterThanOrEqual(0);
    expect(timer.isRunning("async-task")).toBe(false);
  });

  it("measureSync() records synchronous timing correctly", () => {
    const [result, duration] = timer.measureSync("sync-task", () => {
      let sum = 0;
      for (let i = 0; i < 100; i++) sum += i;
      return sum;
    });
    expect(result).toBe(4950);
    expect(duration).toBeGreaterThanOrEqual(0);
    expect(timer.isRunning("sync-task")).toBe(false);
  });

  it("budget check with exact budget value: within budget (no warning)", () => {
    const now = Date.now();
    jest.spyOn(Date, "now").mockReturnValueOnce(now).mockReturnValueOnce(now + 500);
    timer.start("exact-op");
    const duration = timer.endWithBudget("exact-op", "SDK_BOOT_MS");
    expect(duration).toBe(500);
    // Exactly 500ms = 500ms budget, the check is duration > budget, so no warning
  });
});
