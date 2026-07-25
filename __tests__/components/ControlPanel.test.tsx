/**
 * Tests for the ControlPanel component.
 *
 * Verifies rendering, section state management, and sub-component composition.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import ControlPanel from "@/components/ControlPanel";
import { createTestOpts, createTestPresets } from "../helpers/mockServices";
import type { SavedOptions } from "@/types";

// Mock sub-components
vi.mock("@/components/control/PresetsRow", () => ({
  default: function MockPresetsRow({ opts }: { opts: SavedOptions }) {
    return (
      <div data-testid="presets-row">
        PresetsRow: {opts.cols}x{opts.rows}
      </div>
    );
  },
}));

vi.mock("@/components/control/GridSection", () => ({
  default: function MockGridSection({
    expanded,
    onToggle,
  }: {
    expanded: boolean;
    onToggle: () => void;
  }) {
    return (
      <div data-testid="grid-section">
        <span>GridSection {expanded ? "expanded" : "collapsed"}</span>
        <button data-testid="grid-toggle" onClick={onToggle}>
          Toggle Grid
        </button>
      </div>
    );
  },
}));

vi.mock("@/components/control/OutputModesSection", () => ({
  default: function MockOutputModesSection({
    expanded,
    onToggle,
  }: {
    expanded: boolean;
    onToggle: () => void;
  }) {
    return (
      <div data-testid="modes-section">
        <span>ModesSection {expanded ? "expanded" : "collapsed"}</span>
        <button data-testid="modes-toggle" onClick={onToggle}>
          Toggle Modes
        </button>
      </div>
    );
  },
}));

vi.mock("@/components/control/OverlaysSection", () => ({
  default: function MockOverlaysSection({
    expanded,
    onToggle,
  }: {
    expanded: boolean;
    onToggle: () => void;
  }) {
    return (
      <div data-testid="overlays-section">
        <span>OverlaysSection {expanded ? "expanded" : "collapsed"}</span>
        <button data-testid="overlays-toggle" onClick={onToggle}>
          Toggle Overlays
        </button>
      </div>
    );
  },
}));

vi.mock("@/components/control/StyleSection", () => ({
  default: function MockStyleSection({
    expanded,
    onToggle,
  }: {
    expanded: boolean;
    onToggle: () => void;
  }) {
    return (
      <div data-testid="style-section">
        <span>StyleSection {expanded ? "expanded" : "collapsed"}</span>
        <button data-testid="style-toggle" onClick={onToggle}>
          Toggle Style
        </button>
      </div>
    );
  },
}));

vi.mock("@/components/ui/card", () => ({
  Card: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="card">{children}</div>
  ),
  CardContent: ({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => <div className={className}>{children}</div>,
}));

describe("ControlPanel", () => {
  const defaultOpts = createTestOpts({
    sectionStates: { grid: true, style: true, modes: true, overlays: true },
  });
  const presets = createTestPresets();

  it("renders all sections", () => {
    render(
      <ControlPanel
        opts={defaultOpts}
        setOpts={() => {}}
        presets={presets}
        setPresets={() => {}}
      />,
    );
    expect(screen.getByTestId("presets-row")).toBeDefined();
    expect(screen.getByTestId("grid-section")).toBeDefined();
    expect(screen.getByTestId("modes-section")).toBeDefined();
    expect(screen.getByTestId("overlays-section")).toBeDefined();
    expect(screen.getByTestId("style-section")).toBeDefined();
  });

  it("shows section title", () => {
    render(
      <ControlPanel
        opts={defaultOpts}
        setOpts={() => {}}
        presets={presets}
        setPresets={() => {}}
      />,
    );
    expect(screen.getByText("Generation Options")).toBeDefined();
  });

  it("passes expanded state to sections", () => {
    render(
      <ControlPanel
        opts={defaultOpts}
        setOpts={() => {}}
        presets={presets}
        setPresets={() => {}}
      />,
    );
    expect(screen.getByText("GridSection expanded")).toBeDefined();
    expect(screen.getByText("ModesSection expanded")).toBeDefined();
    expect(screen.getByText("StyleSection expanded")).toBeDefined();
  });

  it("uses collapsed section states from opts", () => {
    const collapsedOpts: SavedOptions = {
      ...defaultOpts,
      sectionStates: {
        grid: false,
        style: false,
        modes: false,
        overlays: false,
      },
    };
    render(
      <ControlPanel
        opts={collapsedOpts}
        setOpts={() => {}}
        presets={presets}
        setPresets={() => {}}
      />,
    );
    expect(screen.getByText("GridSection collapsed")).toBeDefined();
    expect(screen.getByText("ModesSection collapsed")).toBeDefined();
    expect(screen.getByText("StyleSection collapsed")).toBeDefined();
  });

  it("defaults to all expanded when sectionStates is missing", () => {
    const optsWithoutStates = { ...defaultOpts, sectionStates: undefined };
    render(
      <ControlPanel
        opts={optsWithoutStates}
        setOpts={() => {}}
        presets={presets}
        setPresets={() => {}}
      />,
    );
    expect(screen.getByText("GridSection expanded")).toBeDefined();
    expect(screen.getByText("ModesSection expanded")).toBeDefined();
    expect(screen.getByText("StyleSection expanded")).toBeDefined();
  });

  it("calls setOpts when grid section is toggled", async () => {
    const setOpts = vi.fn();
    render(
      <ControlPanel
        opts={defaultOpts}
        setOpts={setOpts}
        presets={presets}
        setPresets={() => {}}
      />,
    );
    const { fireEvent } = await import("@testing-library/react");
    fireEvent.click(screen.getByTestId("grid-toggle"));
    expect(setOpts).toHaveBeenCalled();
    // setOpts now receives a function updater
    const updaterFn = setOpts.mock.calls[0][0];
    expect(typeof updaterFn).toBe("function");
    const result = updaterFn(defaultOpts) as SavedOptions;
    expect(result.sectionStates?.grid).toBe(false);
  });

  it("calls setOpts when modes section is toggled", async () => {
    const setOpts = vi.fn();
    render(
      <ControlPanel
        opts={defaultOpts}
        setOpts={setOpts}
        presets={presets}
        setPresets={() => {}}
      />,
    );
    const { fireEvent } = await import("@testing-library/react");
    fireEvent.click(screen.getByTestId("modes-toggle"));
    expect(setOpts).toHaveBeenCalled();
    const updaterFn = setOpts.mock.calls[0][0];
    expect(typeof updaterFn).toBe("function");
    const result = updaterFn(defaultOpts) as SavedOptions;
    expect(result.sectionStates?.modes).toBe(false);
  });

  it("calls setOpts when style section is toggled", async () => {
    const setOpts = vi.fn();
    render(
      <ControlPanel
        opts={defaultOpts}
        setOpts={setOpts}
        presets={presets}
        setPresets={() => {}}
      />,
    );
    const { fireEvent } = await import("@testing-library/react");
    fireEvent.click(screen.getByTestId("style-toggle"));
    expect(setOpts).toHaveBeenCalled();
    const updaterFn = setOpts.mock.calls[0][0];
    expect(typeof updaterFn).toBe("function");
    const result = updaterFn(defaultOpts) as SavedOptions;
    expect(result.sectionStates?.style).toBe(false);
  });
});
