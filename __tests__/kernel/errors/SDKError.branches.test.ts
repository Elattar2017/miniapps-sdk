/**
 * SDKError Branches Test Suite
 * Covers constructor with all options, missing options (defaults),
 * entry lookup, and factory methods (kernel, network, module).
 */
import { SDKError } from "../../../src/kernel/errors/SDKError";
import { ErrorCategory } from "../../../src/types";

describe("SDKError branches", () => {
  it("constructor with all options sets category, code, recoverable", () => {
    const cause = new Error("root cause");
    const err = new SDKError("SDK-9999", "test error", {
      category: ErrorCategory.MODULE,
      severity: "warning",
      resolution: "Try again",
      context: { key: "val" },
      cause,
    });
    expect(err.code).toBe("SDK-9999");
    expect(err.message).toBe("test error");
    expect(err.category).toBe(ErrorCategory.MODULE);
    expect(err.severity).toBe("warning");
    expect(err.resolution).toBe("Try again");
    expect(err.context).toEqual({ key: "val" });
    expect(err.cause).toBe(cause);
    expect(err.timestamp).toBeGreaterThan(0);
    expect(err.name).toBe("SDKError");
  });

  it("constructor with missing options uses defaults", () => {
    const err = new SDKError("SDK-9998", "bare error");
    expect(err.category).toBe(ErrorCategory.KERNEL);
    expect(err.severity).toBe("error");
    expect(err.resolution).toBe("Check SDK documentation");
    expect(err.context).toEqual({});
    expect(err.cause).toBeUndefined();
  });

  it("constructor with known code inherits entry defaults", () => {
    // SDK-1002 is AUTH_TOKEN_INVALID
    const err = new SDKError("SDK-1002", "invalid token");
    expect(err.category).toBe(ErrorCategory.AUTH);
    expect(err.severity).toBe("fatal");
    expect(err.resolution).toContain("JWT");
  });

  it("SDKError.kernel() factory returns correct category", () => {
    const err = SDKError.kernel("boot failed");
    expect(err.code).toBe("SDK-1800");
    expect(err.category).toBe(ErrorCategory.KERNEL);
    expect(err.severity).toBe("fatal");
    expect(err.message).toBe("boot failed");
  });

  it("SDKError.network() factory returns correct category", () => {
    const err = SDKError.network("timeout");
    expect(err.code).toBe("SDK-1400");
    expect(err.category).toBe(ErrorCategory.NETWORK);
    expect(err.message).toBe("timeout");
  });

  it("SDKError.module() factory returns correct category", () => {
    const err = SDKError.module("load failed", { context: { moduleId: "m1" } });
    expect(err.code).toBe("SDK-1101");
    expect(err.category).toBe(ErrorCategory.MODULE);
    expect(err.message).toBe("load failed");
    expect(err.context).toEqual({ moduleId: "m1" });
  });

  it("toJSON serializes all fields", () => {
    const err = new SDKError("SDK-1200", "parse error");
    const json = err.toJSON();
    expect(json.name).toBe("SDKError");
    expect(json.code).toBe("SDK-1200");
    expect(json.message).toBe("parse error");
    expect(json.category).toBeDefined();
    expect(json.severity).toBeDefined();
    expect(json.resolution).toBeDefined();
    expect(json.timestamp).toBeDefined();
  });
});
