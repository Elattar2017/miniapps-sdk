/**
 * ScreenRenderer Persistence Test Suite
 */
import React from "react";
import { create, act, ReactTestRenderer } from "react-test-renderer";
jest.mock("react-native");
jest.mock("../../src/kernel/KernelContext", () => { const a = jest.requireActual("../../src/kernel/KernelContext"); return { ...a, useKernel: jest.fn(), useSDKServices: jest.fn() }; });
jest.mock("../../src/components/SDKProvider", () => ({ useSDK: jest.fn() }));
jest.mock("../../src/adapters", () => ({ SDKView: "SDKView", SDKText: "SDKText", SDKScrollView: "SDKScrollView", SDKKeyboardAvoidingView: "SDKKeyboardAvoidingView", SDKActivityIndicator: "SDKActivityIndicator", SDKTouchableOpacity: "SDKTouchableOpacity", getDefaultSafeAreaInsets: () => ({ top: 44, bottom: 34, left: 0, right: 0 }) }));
const mockSD: Record<string, string | undefined> = {};
jest.mock("../../src/adapters/StorageAdapter", () => ({
  createStorageAdapter: jest.fn(() => ({
    getString: jest.fn((k: string) => mockSD[k]),
    setString: jest.fn((k: string, v: string) => { mockSD[k] = v; }),
    getNumber: jest.fn(), setNumber: jest.fn(), getBoolean: jest.fn(), setBoolean: jest.fn(),
    delete: jest.fn(), contains: jest.fn(), getAllKeys: jest.fn().mockReturnValue([]),
    clearAll: jest.fn(), query: jest.fn(), execute: jest.fn(),
  })),
}));
jest.mock("../../src/modules/ModuleContext", () => ({
  ModuleContext: jest.fn().mockImplementation(() => {
    const s = new Map<string, unknown>();
    return {
      setState: jest.fn((k: string, v: unknown) => s.set(k, v)),
      getState: jest.fn((k: string) => s.get(k)),
      getAllKeys: jest.fn(() => Array.from(s.keys())),
      clearState: jest.fn(() => s.clear()),
      createStateProxy: jest.fn(() => ({})),
    };
  }),
}));
import { useKernel, useSDKServices } from "../../src/kernel/KernelContext";
import { useSDK } from "../../src/components/SDKProvider";
import { ScreenRenderer } from "../../src/components/ScreenRenderer";
let mN: any, mIB: any, mDB: any, mPE: any, mMR: any, mML: any, mSI: any, mEE: any, mAP: any;
function setup() {
  mN = { navigate: jest.fn(), goBack: jest.fn().mockReturnValue(true), getCurrentRoute: jest.fn(), reset: jest.fn(), getState: jest.fn().mockReturnValue({ routes: [], currentIndex: -1 }), addListener: jest.fn().mockReturnValue(jest.fn()), dispose: jest.fn() };
  mIB = { emit: jest.fn().mockResolvedValue(undefined) };
  mDB = { publish: jest.fn() };
  mPE = { evaluate: jest.fn().mockResolvedValue({ allowed: true }) };
  mMR = { get: jest.fn() };
  mAP = { request: jest.fn().mockResolvedValue({ ok: true, status: 200, data: { id: 1 }, headers: {}, latencyMs: 10 }) };
  (useKernel as jest.Mock).mockReturnValue({
    config: { tenantId: "t", userId: "u1", apiBaseUrl: "https://api.test.com", authToken: "tok", zones: {},
      designTokens: { colors: { primary: "#06C", background: "#FFF" }, typography: { fontFamily: "System", baseFontSize: 14 }, spacing: { unit: 4 }, borderRadius: { default: 8 } } },
    state: "ACTIVE", status: { state: "ACTIVE", moduleCount: 0 }, kernel: {},
    dataBus: mDB, intentBridge: mIB, policyEngine: mPE, moduleRegistry: mMR, navigator: mN,
  });
  (useSDKServices as jest.Mock).mockReturnValue({ dataBus: mDB, intentBridge: mIB, policyEngine: mPE, moduleRegistry: mMR, navigator: mN, apiProxy: mAP });
  mML = { loadScreen: jest.fn().mockResolvedValue({ id: "s1", title: "T", body: { type: "text", value: "Hi" } }), loadModuleList: jest.fn(), loadManifest: jest.fn().mockResolvedValue({ id: 'test-module' }) };
  mSI = { interpretScreen: jest.fn().mockReturnValue(React.createElement("View", null, "Content")) };
  mEE = { isExpression: jest.fn().mockReturnValue(false), resolveExpressions: jest.fn((v: string) => v), evaluate: jest.fn(), resolveObjectExpressions: jest.fn((o: any) => o) };
  (useSDK as jest.Mock).mockReturnValue({ moduleLoader: mML, schemaInterpreter: mSI, expressionEngine: mEE, moduleRegistry: mMR });
}
beforeEach(() => {
  jest.spyOn(console, "log").mockImplementation(() => {});
  jest.spyOn(console, "warn").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});
  jest.clearAllMocks();
  Object.keys(mockSD).forEach(k => delete mockSD[k]);
  setup();
});
afterEach(() => { jest.restoreAllMocks(); });
function mkS(o?: Record<string, unknown>) { const p = { moduleId: "m1", screenId: "s1", onNavigate: jest.fn(), onBack: jest.fn(), ...o }; return { el: React.createElement(ScreenRenderer, p as any), p }; }
async function rw(el: React.ReactElement) { let t: ReactTestRenderer; await act(async () => { t = create(el); }); return t!; }
describe("ScreenRenderer persistence", () => {
  it("restores persisted state on mount", async () => {
    mockSD["__module_state__"] = JSON.stringify({ name: "Bob" });
    const { el } = mkS();
    await rw(el);
    const lc = mSI.interpretScreen.mock.calls;
    expect(lc[lc.length - 1]?.[1]?.state).toEqual(expect.objectContaining({ name: "Bob" }));
  });

  it("corrupt saved state JSON: caught, starts fresh", async () => {
    mockSD["__module_state__"] = "not-valid{{";
    const { el } = mkS();
    const t = await rw(el);
    expect(t.root.findAll((e: any) => e.children?.includes("Content")).length).toBeGreaterThan(0);
  });

  it("unmount persists current state", async () => {
    const { el } = mkS();
    const t = await rw(el);
    act(() => { mSI.interpretScreen.mock.calls[mSI.interpretScreen.mock.calls.length - 1]?.[1]?.onStateChange("c", 42); });
    act(() => { t.unmount(); });
    expect(mockSD["__module_state__"]).toBeDefined();
    expect(JSON.parse(mockSD["__module_state__"]!).c).toBe(42);
  });

  it("cancelled flag prevents state update after unmount", async () => {
    mML.loadScreen.mockImplementation(async () => { await new Promise(r => setTimeout(r, 50)); throw new Error("late"); });
    const { el } = mkS();
    let t: ReactTestRenderer; act(() => { t = create(el); });
    act(() => { t!.unmount(); });
    await act(async () => { await new Promise(r => setTimeout(r, 100)); });
  });

  it("data source fetch error: caught, logged", async () => {
    mAP.request.mockRejectedValue(new Error("down"));
    mML.loadScreen.mockResolvedValue({ id: "s1", title: "T", body: { type: "text", value: "Hi" }, dataSources: { items: { api: "/api/x", method: "GET" } } });
    const { el } = mkS();
    const t = await rw(el);
    await act(async () => { await new Promise(r => setTimeout(r, 50)); });
    expect(t.root.findAll((e: any) => e.children?.includes("Content")).length).toBeGreaterThan(0);
  });

  it("schema load cancellation on unmount", async () => {
    let res: (v: any) => void;
    mML.loadScreen.mockReturnValue(new Promise(r => { res = r; }));
    const { el } = mkS();
    let t: ReactTestRenderer; act(() => { t = create(el); });
    act(() => { t!.unmount(); });
    res!({ id: "s1", title: "T", body: { type: "text", value: "X" } });
    await act(async () => { await new Promise(r => setTimeout(r, 10)); });
  });

  it("multiple rapid re-renders: second screenId", async () => {
    let r1: (v: any) => void; let r2: (v: any) => void;
    mML.loadScreen.mockReturnValueOnce(new Promise(r => { r1 = r; })).mockReturnValueOnce(new Promise(r => { r2 = r; }));
    const { el } = mkS();
    let t: ReactTestRenderer; act(() => { t = create(el); });
    act(() => { t!.update(React.createElement(ScreenRenderer, { moduleId: "m1", screenId: "s2", onNavigate: jest.fn(), onBack: jest.fn() } as any)); });
    r2!({ id: "s2", title: "S2", body: { type: "text", value: "V2" } });
    await act(async () => { await new Promise(r => setTimeout(r, 10)); });
    r1!({ id: "s1", title: "S1", body: { type: "text", value: "V1" } });
    await act(async () => { await new Promise(r => setTimeout(r, 10)); });
  });

  it("api_submit onError fires on exception", async () => {
    mAP.request.mockRejectedValue(new Error("err"));
    const { el } = mkS();
    const t = await rw(el);
    await act(async () => {
      const lc = mSI.interpretScreen.mock.calls;
      lc[lc.length - 1]?.[1]?.onAction({ action: "api_submit", api: "/api/f", onError: { action: "show_loading" } });
      await new Promise(r => setTimeout(r, 50));
    });
    expect(mDB.publish).toHaveBeenCalledWith("sdk:action:dispatched", expect.objectContaining({ action: "show_loading" }));
  });
});
