/**
 * ImageComponent Handlers Test Suite
 * Covers onLoad and onError handlers, with and without action configs.
 */
import React from "react";
import { create, act, ReactTestRenderer } from "react-test-renderer";
import { ImageComponent } from "../../../src/schema/components/ImageComponent";
import type { RenderContext, SchemaNode } from "../../../src/types";

jest.mock("react-native");

function makeCtx(overrides?: Partial<RenderContext>): RenderContext {
  return {
    tenantId: "t", moduleId: "m", screenId: "s",
    data: {}, state: {}, user: { id: "u" },
    designTokens: { colors: { primary: "#0066CC", background: "#FFF" }, typography: { fontFamily: "System", baseFontSize: 14 }, spacing: { unit: 4 }, borderRadius: { default: 8 } },
    onAction: jest.fn(), onStateChange: jest.fn(),
    ...overrides,
  };
}

describe("ImageComponent handlers", () => {
  it("image with onLoad action: handler fires", () => {
    const onAction = jest.fn();
    const node: SchemaNode = { type: "image", source: "https://x.com/a.png", onLoad: { action: "analytics", event: "img_loaded" } };
    let tree: ReactTestRenderer;
    act(() => { tree = create(React.createElement(ImageComponent, { node, context: makeCtx({ onAction }) })); });
    const imgs = tree!.root.findAll((el: any) => el.props.onLoad);
    expect(imgs.length).toBeGreaterThan(0);
    act(() => { imgs[0].props.onLoad(); });
    expect(onAction).toHaveBeenCalledWith({ action: "analytics", event: "img_loaded" });
  });

  it("image with onError action: handler fires", () => {
    const onAction = jest.fn();
    const node: SchemaNode = { type: "image", source: "https://x.com/a.png", onError: { action: "analytics", event: "img_error" } };
    let tree: ReactTestRenderer;
    act(() => { tree = create(React.createElement(ImageComponent, { node, context: makeCtx({ onAction }) })); });
    const imgs = tree!.root.findAll((el: any) => el.props.onError);
    expect(imgs.length).toBeGreaterThan(0);
    act(() => { imgs[0].props.onError(); });
    expect(onAction).toHaveBeenCalledWith({ action: "analytics", event: "img_error" });
  });

  it("image without onLoad: no error on load event", () => {
    const onAction = jest.fn();
    const node: SchemaNode = { type: "image", source: "https://x.com/a.png" };
    let tree: ReactTestRenderer;
    act(() => { tree = create(React.createElement(ImageComponent, { node, context: makeCtx({ onAction }) })); });
    const imgs = tree!.root.findAll((el: any) => el.props.onLoad);
    expect(imgs.length).toBeGreaterThan(0);
    // Calling onLoad should not throw even without onLoad config
    act(() => { imgs[0].props.onLoad(); });
    expect(onAction).not.toHaveBeenCalled();
  });

  it("image without onError: no error on error event", () => {
    const onAction = jest.fn();
    const node: SchemaNode = { type: "image", source: "https://x.com/a.png" };
    let tree: ReactTestRenderer;
    act(() => { tree = create(React.createElement(ImageComponent, { node, context: makeCtx({ onAction }) })); });
    const imgs = tree!.root.findAll((el: any) => el.props.onError);
    expect(imgs.length).toBeGreaterThan(0);
    act(() => { imgs[0].props.onError(); });
    expect(onAction).not.toHaveBeenCalled();
  });

  it("onLoad handler calls onAction with correct config", () => {
    const onAction = jest.fn();
    const loadAction = { action: "navigate" as const, screen: "loaded" };
    const node: SchemaNode = { type: "image", source: "https://x.com/a.png", onLoad: loadAction };
    let tree: ReactTestRenderer;
    act(() => { tree = create(React.createElement(ImageComponent, { node, context: makeCtx({ onAction }) })); });
    const imgs = tree!.root.findAll((el: any) => el.props.onLoad);
    act(() => { imgs[0].props.onLoad(); });
    expect(onAction).toHaveBeenCalledWith(loadAction);
  });

  it("onError handler calls onAction with correct config", () => {
    const onAction = jest.fn();
    const errorAction = { action: "show_loading" as const };
    const node: SchemaNode = { type: "image", source: "https://x.com/a.png", onError: errorAction };
    let tree: ReactTestRenderer;
    act(() => { tree = create(React.createElement(ImageComponent, { node, context: makeCtx({ onAction }) })); });
    const imgs = tree!.root.findAll((el: any) => el.props.onError);
    act(() => { imgs[0].props.onError(); });
    expect(onAction).toHaveBeenCalledWith(errorAction);
  });
});
