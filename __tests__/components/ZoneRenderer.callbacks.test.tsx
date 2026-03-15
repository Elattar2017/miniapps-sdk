/**
 * ZoneRenderer Callbacks Test Suite
 */
import React from "react";
import { create, act, ReactTestRenderer } from "react-test-renderer";
jest.mock("react-native");
const mockNav = { navigate: jest.fn(), goBack: jest.fn().mockReturnValue(true), getCurrentRoute: jest.fn().mockReturnValue(undefined), reset: jest.fn(), getState: jest.fn().mockReturnValue({ routes: [], currentIndex: -1 }), addListener: jest.fn().mockReturnValue(jest.fn()) };
const mockDB = { publish: jest.fn(), subscribe: jest.fn().mockReturnValue(jest.fn()) };
const mockIB = { emit: jest.fn().mockResolvedValue(undefined) };
const mockPE = { evaluate: jest.fn().mockResolvedValue({ allowed: true }) };
const mockMR = { get: jest.fn() };
const onOpenSpy = jest.fn();
const onCloseSpy = jest.fn();
const cfg: Record<string, unknown> = {
  tenantId: "t", userId: "u1", apiBaseUrl: "https://api.test.com", authToken: "tok",
  onModuleOpen: onOpenSpy, onModuleClose: onCloseSpy,
  zones: {
    actions: { type: "actions" as const, position: "top" as const, height: 120 },
    main: { type: "fill" as const, position: "fill" as const, flex: 1 },
    dash: { type: "dashboard" as const, position: "fill" as const, emptyMessage: "Pick" },
  },
  designTokens: { colors: { primary: "#0066CC", background: "#FFF" }, typography: { fontFamily: "System", baseFontSize: 14 }, spacing: { unit: 4 }, borderRadius: { default: 8 } },
};
function mkKV(o?: Record<string, unknown>) { return { config: cfg, state: "ACTIVE", status: { state: "ACTIVE", moduleCount: 0 }, kernel: {}, dataBus: mockDB, intentBridge: mockIB, policyEngine: mockPE, moduleRegistry: mockMR, navigator: mockNav, ...o }; }
jest.mock("../../src/kernel/KernelContext", () => { const a = jest.requireActual("../../src/kernel/KernelContext"); return { ...a, useKernel: jest.fn(() => mkKV()), useSDKServices: jest.fn(() => ({ dataBus: mockDB, intentBridge: mockIB, policyEngine: mockPE, moduleRegistry: mockMR, navigator: mockNav })) }; });
let azP: Record<string, unknown> = {};
jest.mock("../../src/components/ActionZone", () => ({ ActionZone: (p: Record<string, unknown>) => { azP = p; return React.createElement("View", { testID: "AZ", zoneId: p.zoneId }); } }));
let srP: Record<string, unknown> = {};
jest.mock("../../src/components/ScreenRenderer", () => ({ ScreenRenderer: (p: Record<string, unknown>) => { srP = p; return React.createElement("View", { testID: "SR", moduleId: p.moduleId, screenId: p.screenId }); } }));
import { ZoneRenderer } from "../../src/components/ZoneRenderer";
import { useKernel, useSDKServices } from "../../src/kernel/KernelContext";
beforeEach(() => { jest.spyOn(console, "log").mockImplementation(() => {}); jest.spyOn(console, "warn").mockImplementation(() => {}); jest.spyOn(console, "error").mockImplementation(() => {}); jest.clearAllMocks(); azP = {}; srP = {}; mockNav.getCurrentRoute.mockReturnValue(undefined); mockNav.getState.mockReturnValue({ routes: [], currentIndex: -1 }); mockNav.addListener.mockReturnValue(jest.fn()); (useKernel as jest.Mock).mockReturnValue(mkKV()); (useSDKServices as jest.Mock).mockReturnValue({ dataBus: mockDB, intentBridge: mockIB, policyEngine: mockPE, moduleRegistry: mockMR, navigator: mockNav }); });
afterEach(() => { jest.restoreAllMocks(); });
describe("ZoneRenderer callbacks", () => {
  it("handleModuleOpen triggers navigate and publishes", () => {
    let t: ReactTestRenderer; act(() => { t = create(React.createElement(ZoneRenderer, { zoneId: "actions" })); });
    expect(azP.onModuleOpen).toBeDefined();
    act(() => { (azP.onModuleOpen as Function)("com.v.b", "home"); });
    expect(mockNav.navigate).toHaveBeenCalledWith({ moduleId: "com.v.b", screenId: "home" });
    expect(mockDB.publish).toHaveBeenCalledWith("sdk:module:opened", { moduleId: "com.v.b", screenId: "home", zoneId: "actions" });
    expect(onOpenSpy).toHaveBeenCalledWith("com.v.b");
  });
  it("handleModuleClose clears module and publishes", () => {
    mockNav.getCurrentRoute.mockReturnValue({ moduleId: "com.v.b", screenId: "home" });
    let t: ReactTestRenderer; act(() => { t = create(React.createElement(ZoneRenderer, { zoneId: "main" })); });
    act(() => { (srP.onBack as Function)(); });
    expect(mockNav.reset).toHaveBeenCalled();
    expect(mockDB.publish).toHaveBeenCalledWith("sdk:module:closed", { moduleId: "com.v.b", zoneId: "main" });
    expect(onCloseSpy).toHaveBeenCalledWith("com.v.b");
  });
  it("handleNavigate updates screen", () => {
    mockNav.getCurrentRoute.mockReturnValue({ moduleId: "com.v.b", screenId: "home" });
    let t: ReactTestRenderer; act(() => { t = create(React.createElement(ZoneRenderer, { zoneId: "main" })); });
    act(() => { (srP.onNavigate as Function)("detail"); });
    expect(mockNav.navigate).toHaveBeenCalledWith({ moduleId: "com.v.b", screenId: "detail" });
  });
  it("open -> navigate -> back flow", () => {
    let t: ReactTestRenderer; act(() => { t = create(React.createElement(ZoneRenderer, { zoneId: "actions" })); });
    act(() => { (azP.onModuleOpen as Function)("com.v.r", "ov"); });
    mockNav.getCurrentRoute.mockReturnValue({ moduleId: "com.v.r", screenId: "ov" });
    let f: ReactTestRenderer; act(() => { f = create(React.createElement(ZoneRenderer, { zoneId: "main" })); });
    act(() => { (srP.onNavigate as Function)("d"); });
    act(() => { (srP.onBack as Function)(); });
    expect(mockNav.reset).toHaveBeenCalled();
  });
  it("zone type change re-renders", () => {
    let t: ReactTestRenderer; act(() => { t = create(React.createElement(ZoneRenderer, { zoneId: "dash" })); });
    expect(t!.root.findAll((e: any) => e.children?.includes("Pick")).length).toBeGreaterThan(0);
    mockNav.getCurrentRoute.mockReturnValue({ moduleId: "x", screenId: "y" });
    act(() => { t.update(React.createElement(ZoneRenderer, { zoneId: "dash" })); });
    expect(t!.toJSON()).toBeTruthy();
  });
  it("multiple zones independent", () => {
    let a: ReactTestRenderer; let m: ReactTestRenderer;
    act(() => { a = create(React.createElement(ZoneRenderer, { zoneId: "actions" })); });
    act(() => { m = create(React.createElement(ZoneRenderer, { zoneId: "main" })); });
    expect(a!.root.findAll((e: any) => e.props.testID === "AZ").length).toBe(1);
    expect(m!.root.findAll((e: any) => e.props.testID === "SR").length).toBe(0);
  });
  it("onModuleOpen prop called correctly", () => {
    let t: ReactTestRenderer; act(() => { t = create(React.createElement(ZoneRenderer, { zoneId: "actions" })); });
    act(() => { (azP.onModuleOpen as Function)("com.v.bill", "main"); });
    expect(onOpenSpy).toHaveBeenCalledTimes(1);
    expect(onOpenSpy).toHaveBeenCalledWith("com.v.bill");
  });
  it("active module shows ScreenRenderer", () => {
    mockNav.getCurrentRoute.mockReturnValue({ moduleId: "com.v.b", screenId: "home" });
    let t: ReactTestRenderer; act(() => { t = create(React.createElement(ZoneRenderer, { zoneId: "main" })); });
    const sr = t!.root.findAll((e: any) => e.props.testID === "SR");
    expect(sr.length).toBe(1);
    expect(sr[0].props.moduleId).toBe("com.v.b");
  });
});
