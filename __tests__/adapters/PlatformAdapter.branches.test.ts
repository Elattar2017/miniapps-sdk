/**
 * PlatformAdapter Branches Test Suite
 * Covers: web/unknown platform, string version parsing, Android/web safe area
 * insets, dimension listeners, device capabilities for android/web.
 */

jest.mock("react-native");

import { Platform } from "react-native";
import {
  getCurrentPlatform,
  isIOS,
  isAndroid,
  isWeb,
  getPlatformVersion,
  onDimensionChange,
  getSafeAreaInsets,
  getDeviceCapabilities,
} from "../../src/adapters/PlatformAdapter";

beforeEach(() => {
  jest.spyOn(console, "log").mockImplementation(() => {});
  jest.spyOn(console, "warn").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { jest.restoreAllMocks(); });

describe("PlatformAdapter branches", () => {
  it("returns 'web' for Platform.OS='web'", () => {
    const orig = Platform.OS;
    (Platform as any).OS = "web";
    expect(getCurrentPlatform()).toBe("web");
    expect(isWeb()).toBe(true);
    expect(isIOS()).toBe(false);
    expect(isAndroid()).toBe(false);
    (Platform as any).OS = orig;
  });

  it("returns 'unknown' for unrecognized Platform.OS", () => {
    const orig = Platform.OS;
    (Platform as any).OS = "fuchsia";
    expect(getCurrentPlatform()).toBe("unknown");
    (Platform as any).OS = orig;
  });

  it("string version parsing returns 0 for non-numeric string", () => {
    const orig = Platform.Version;
    (Platform as any).Version = "abc.def";
    expect(getPlatformVersion()).toBe(0);
    (Platform as any).Version = orig;
  });

  it("returns 0 when Platform.Version is neither string nor number", () => {
    const orig = Platform.Version;
    (Platform as any).Version = undefined;
    expect(getPlatformVersion()).toBe(0);
    (Platform as any).Version = orig;
  });

  it("Android safe area insets (status bar height)", () => {
    const orig = Platform.OS;
    (Platform as any).OS = "android";
    const insets = getSafeAreaInsets();
    expect(insets.top).toBe(24);
    expect(insets.bottom).toBe(0);
    expect(insets.left).toBe(0);
    expect(insets.right).toBe(0);
    (Platform as any).OS = orig;
  });

  it("Web safe area insets (all zeros)", () => {
    const orig = Platform.OS;
    (Platform as any).OS = "web";
    const insets = getSafeAreaInsets();
    expect(insets.top).toBe(0);
    expect(insets.bottom).toBe(0);
    expect(insets.left).toBe(0);
    expect(insets.right).toBe(0);
    (Platform as any).OS = orig;
  });

  it("dimension listener add and remove", () => {
    const listener = jest.fn();
    const unsub = onDimensionChange(listener);
    expect(typeof unsub).toBe("function");
    unsub();
    expect(() => unsub()).not.toThrow();
  });

  it("getDeviceCapabilities for Android API 28", () => {
    const origOS = Platform.OS;
    const origVer = Platform.Version;
    (Platform as any).OS = "android";
    (Platform as any).Version = 28;
    const caps = getDeviceCapabilities();
    expect(caps.platform).toBe("android");
    expect(caps.version).toBe(28);
    expect(caps.hasNotch).toBe(false);
    expect(caps.supportsHaptics).toBe(true);
    expect(caps.supportsBiometrics).toBe(true);
    (Platform as any).OS = origOS;
    (Platform as any).Version = origVer;
  });
});
