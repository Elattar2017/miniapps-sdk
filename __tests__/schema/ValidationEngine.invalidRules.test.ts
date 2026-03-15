/**
 * ValidationEngine Invalid Rules Test Suite
 * Covers uncovered branches: unknown rule type, NaN values, non-string pattern,
 * invalid regex, non-string for email/phone rules.
 */
import { ValidationEngine } from "../../src/schema/ValidationEngine";
import type { ValidationRule } from "../../src/types";

beforeEach(() => {
  jest.spyOn(console, "log").mockImplementation(() => {});
  jest.spyOn(console, "warn").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { jest.restoreAllMocks(); });

describe("ValidationEngine invalid rules", () => {
  let engine: ValidationEngine;
  beforeEach(() => { engine = new ValidationEngine(); });

  it("unknown rule type is skipped gracefully", () => {
    const rules: ValidationRule[] = [{ rule: "unknown_rule" as any }];
    const result = engine.validate("hello", rules);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("min rule with NaN rule value logs warning and passes", () => {
    const rules: ValidationRule[] = [{ rule: "min", value: "not-a-number" }];
    const result = engine.validate(5, rules);
    expect(result.valid).toBe(true);
  });

  it("min rule with non-numeric field value passes (not validated)", () => {
    const rules: ValidationRule[] = [{ rule: "min", value: 5 }];
    const result = engine.validate("abc", rules);
    expect(result.valid).toBe(true);
  });

  it("max rule with NaN rule value logs warning and passes", () => {
    const rules: ValidationRule[] = [{ rule: "max", value: "xyz" }];
    const result = engine.validate(5, rules);
    expect(result.valid).toBe(true);
  });

  it("minLength rule with NaN rule value logs warning and passes", () => {
    const rules: ValidationRule[] = [{ rule: "minLength", value: "abc" }];
    const result = engine.validate("hello", rules);
    expect(result.valid).toBe(true);
  });

  it("maxLength rule with NaN rule value logs warning and passes", () => {
    const rules: ValidationRule[] = [{ rule: "maxLength", value: "abc" }];
    const result = engine.validate("hello", rules);
    expect(result.valid).toBe(true);
  });

  it("pattern rule with non-string value logs warning and passes", () => {
    const rules: ValidationRule[] = [{ rule: "pattern", value: 123 as any }];
    const result = engine.validate("hello", rules);
    expect(result.valid).toBe(true);
  });

  it("pattern rule with invalid regex logs warning and passes", () => {
    const rules: ValidationRule[] = [{ rule: "pattern", value: "[invalid(" }];
    const result = engine.validate("hello", rules);
    expect(result.valid).toBe(true);
  });

  it("email rule on non-string (number) value validates stringified form", () => {
    const rules: ValidationRule[] = [{ rule: "email" }];
    const result = engine.validate(12345, rules);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("email");
  });

  it("phone rule on non-string (number) value validates stringified form", () => {
    const rules: ValidationRule[] = [{ rule: "phone" }];
    const result = engine.validate(123, rules);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("phone");
  });
});
