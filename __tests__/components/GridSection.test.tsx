/**
 * Tests for the GridSection component.
 *
 * Verifies custom grid template toggle behavior:
 * - Editor receives cols×rows as starting size when no template exists
 * - Unsaved template triggers discard confirmation dialog
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import GridSection from "@/components/control/GridSection";
import { DEFAULTS } from "@/constants";
import type { SavedOptions, AppSettings } from "@/types";

// -- Mocks --

vi.mock("@/components/GridTemplateEditor", () => ({
  default: function MockGridTemplateEditor({
    template,
    cols,
    rows,
    onSave,
  }: {
    template: { cells: { id: string }[] };
    cols: number;
    rows: number;
    onSave: (tpl: { cells: { id: string }[] }) => void;
    onClose: () => void;
  }) {
    return (
      <div data-testid="grid-template-editor">
        <span data-testid="editor-cols">cols: {cols}</span>
        <span data-testid="editor-rows">rows: {rows}</span>
        <span data-testid="editor-cell-count">
          cells: {template.cells.length}
        </span>
        <button data-testid="editor-save" onClick={() => onSave(template)}>
          Save
        </button>
      </div>
    );
  },
}));

vi.mock("@/components/ui/alert-dialog", () => ({
  AlertDialog: ({
    open,
    children,
  }: {
    open: boolean;
    children: React.ReactNode;
    onOpenChange: (open: boolean) => void;
  }) => (open ? <div data-testid="alert-dialog">{children}</div> : null),
  AlertDialogContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="alert-dialog-content">{children}</div>
  ),
  AlertDialogHeader: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  AlertDialogTitle: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  AlertDialogDescription: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  AlertDialogFooter: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  AlertDialogAction: ({
    children,
    onClick,
  }: {
    children: React.ReactNode;
    onClick: () => void;
  }) => (
    <button data-testid="alert-dialog-action" onClick={onClick}>
      {children}
    </button>
  ),
  AlertDialogCancel: () => (
    <button data-testid="alert-dialog-cancel">Cancel</button>
  ),
}));

vi.mock("@/components/ui/checkbox", () => ({
  Checkbox: ({
    checked,
    onCheckedChange,
    id,
  }: {
    checked: boolean;
    id?: string;
    onCheckedChange: (v: boolean | "indeterminate") => void;
  }) => (
    <input
      type="checkbox"
      data-testid={`checkbox-${id}`}
      checked={checked}
      onChange={() => onCheckedChange(!checked)}
    />
  ),
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    onClick,
    variant,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    variant?: string;
  }) => (
    <button data-testid={`button-${variant}`} onClick={onClick}>
      {children}
    </button>
  ),
}));

vi.mock("@/components/control/Section", () => ({
  default: ({
    children,
    label,
  }: {
    children: React.ReactNode;
    label: string;
    expanded: boolean;
    onToggle: () => void;
  }) => <div data-testid={`section-${label.toLowerCase()}`}>{children}</div>,
}));

vi.mock("@/components/control/RangeNumberInput", () => ({
  default: () => <input data-testid="range-number-input" />,
}));

vi.mock("@/components/ui/field", () => ({
  Field: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  FieldLabel: ({
    children,
    htmlFor,
  }: {
    children: React.ReactNode;
    htmlFor?: string;
  }) => <label htmlFor={htmlFor}>{children}</label>,
}));

// -- Helpers --

function createDefaultOpts(overrides?: Partial<SavedOptions>): SavedOptions {
  return {
    width: 1920,
    cols: 4,
    rows: 3,
    spacing: 4,
    tcPosition: "disabled",
    header: true,
    bgColor: "#000000",
    textColor: "#FFFFFF",
    animated: false,
    animDuration: 10,
    animFps: 24,
    webpMethod: 4,
    webpQuality: 75,
    vrMode: "disabled",
    fontFamily: DEFAULTS.fontFamily,
    tcFontSizeAuto: DEFAULTS.tcFontSizeAuto,
    tcFontSize: DEFAULTS.tcFontSize,
    headerFontSizeAuto: DEFAULTS.headerFontSizeAuto,
    headerFontSize: DEFAULTS.headerFontSize,
    sectionStates: { grid: true, style: true, modes: true },
    ...(overrides || {}),
  };
}

function createDefaultPresets(): AppSettings["presets"] {
  return {
    entries: {},
    lastUsed: null,
  };
}

// -- Tests --

describe("GridSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = "";
  });

  describe("editor initialization", () => {
    it.each([
      { cols: 2, rows: 2, expectedCells: 4 },
      { cols: 4, rows: 3, expectedCells: 12 },
      { cols: 6, rows: 5, expectedCells: 30 },
      { cols: 1, rows: 8, expectedCells: 8 },
    ])(
      "initializes editor with $cols x $rows grid ($expectedCells cells) when enabling custom grid",
      ({ cols, rows, expectedCells }) => {
        const setOpts = vi.fn();
        const opts = createDefaultOpts({ cols, rows });
        const presets = createDefaultPresets();

        render(
          <GridSection
            opts={opts}
            setOpts={setOpts}
            presets={presets}
            expanded={true}
            onToggle={() => {}}
          />,
        );

        // Click the checkbox to enable custom grid
        const checkbox = screen.getByTestId("checkbox-cp-tpl-toggle");
        fireEvent.click(checkbox);

        // setOpts should have been called to initialize the template
        expect(setOpts).toHaveBeenCalled();

        // The editor should be visible
        expect(screen.getByTestId("grid-template-editor")).toBeTruthy();

        // It should receive the cols and rows values from GridSection
        expect(screen.getByTestId("editor-cols")).toHaveTextContent(
          `cols: ${cols}`,
        );
        expect(screen.getByTestId("editor-rows")).toHaveTextContent(
          `rows: ${rows}`,
        );

        // Cell count must match cols * rows
        expect(screen.getByTestId("editor-cell-count")).toHaveTextContent(
          `cells: ${expectedCells}`,
        );
      },
    );
  });

  describe("discard confirmation", () => {
    it("shows discard dialog when disabling custom grid with unsaved template", () => {
      const setOpts = vi.fn();
      const unsavedTemplate = {
        cols: 60,
        cells: [
          { id: "a", x: 0, y: 0, w: 30, h: 1 },
          { id: "b", x: 30, y: 0, w: 30, h: 1 },
          { id: "c", x: 0, y: 1, w: 30, h: 1 },
          { id: "d", x: 30, y: 1, w: 30, h: 1 },
        ],
      };
      const opts = createDefaultOpts({ gridTemplate: unsavedTemplate });
      const presets = createDefaultPresets();

      render(
        <GridSection
          opts={opts}
          setOpts={setOpts}
          presets={presets}
          expanded={true}
          onToggle={() => {}}
        />,
      );

      // Uncheck the checkbox to disable custom grid
      const checkbox = screen.getByTestId("checkbox-cp-tpl-toggle");
      fireEvent.click(checkbox);

      // Confirm dialog should appear
      expect(screen.getByTestId("alert-dialog")).toBeTruthy();
      expect(screen.getByText("Discard unsaved template?")).toBeTruthy();
      expect(
        screen.getByText(
          /The current grid template is not saved in any preset/,
        ),
      ).toBeTruthy();

      // setOpts should NOT have been called yet (template still active)
      expect(setOpts).not.toHaveBeenCalled();
    });

    it("discards template when user confirms discard", () => {
      const setOpts = vi.fn();
      const unsavedTemplate = {
        cols: 60,
        cells: [
          { id: "a", x: 0, y: 0, w: 30, h: 1 },
          { id: "b", x: 30, y: 0, w: 30, h: 1 },
        ],
      };
      const opts = createDefaultOpts({ gridTemplate: unsavedTemplate });
      const presets = createDefaultPresets();

      render(
        <GridSection
          opts={opts}
          setOpts={setOpts}
          presets={presets}
          expanded={true}
          onToggle={() => {}}
        />,
      );

      // Trigger discard dialog
      const checkbox = screen.getByTestId("checkbox-cp-tpl-toggle");
      fireEvent.click(checkbox);

      // Confirm discard
      const discardBtn = screen.getByTestId("alert-dialog-action");
      fireEvent.click(discardBtn);

      expect(setOpts).toHaveBeenCalledWith(
        expect.objectContaining({ gridTemplate: undefined }),
      );
    });

    it("does not show discard dialog when template matches saved preset", () => {
      const setOpts = vi.fn();
      const savedTemplate = {
        cols: 60,
        cells: [
          { id: "a", x: 0, y: 0, w: 30, h: 1 },
          { id: "b", x: 30, y: 0, w: 30, h: 1 },
        ],
      };
      const opts = createDefaultOpts({ gridTemplate: savedTemplate });
      const presets: AppSettings["presets"] = {
        entries: {
          myPreset: {
            width: 1920,
            cols: 4,
            rows: 3,
            spacing: 4,
            tcPosition: "disabled" as const,
            header: true,
            bgColor: "#000000",
            textColor: "#FFFFFF",
            animated: false,
            animDuration: 10,
            animFps: 24,
            webpMethod: 4,
            webpQuality: 75,
            vrMode: "disabled" as const,
            fontFamily: DEFAULTS.fontFamily,
            tcFontSizeAuto: DEFAULTS.tcFontSizeAuto,
            tcFontSize: DEFAULTS.tcFontSize,
            headerFontSizeAuto: DEFAULTS.headerFontSizeAuto,
            headerFontSize: DEFAULTS.headerFontSize,
            gridTemplate: savedTemplate,
          },
        },
        lastUsed: "myPreset",
      };

      render(
        <GridSection
          opts={opts}
          setOpts={setOpts}
          presets={presets}
          expanded={true}
          onToggle={() => {}}
        />,
      );

      // Uncheck - no discard dialog since template matches preset
      const checkbox = screen.getByTestId("checkbox-cp-tpl-toggle");
      fireEvent.click(checkbox);

      expect(screen.queryByTestId("alert-dialog")).not.toBeTruthy();
      expect(setOpts).toHaveBeenCalledWith(
        expect.objectContaining({ gridTemplate: undefined }),
      );
    });
  });
});
