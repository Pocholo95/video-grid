/**
 * Tests for the PresetsRow component.
 *
 * Verifies preset save/rename dialog behavior:
 * - Input is prefilled with current preset name and text is selected
 * - Input is empty when <Default Preset> is selected
 * - Delete button is disabled while save dialog is open
 * - Preset entries are sorted alphabetically
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  act,
  waitFor,
} from "@testing-library/react";
import PresetsRow from "@/components/control/PresetsRow";
import { DEFAULTS, PRESETS_DEFAULT_VALUE } from "@/constants";
import type { SavedOptions, AppSettings } from "@/types";

// -- Mocks --

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    onClick,
    variant,
    size,
    disabled,
    title,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    variant?: string;
    size?: string;
    disabled?: boolean;
    title?: string;
  }) => (
    <button
      data-testid={`button-${variant || "default"}-${size || "normal"}`}
      onClick={onClick}
      disabled={disabled}
      title={title}
    >
      {children}
    </button>
  ),
}));

vi.mock("@/components/ui/input", () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input data-testid="preset-name-input" {...props} />
  ),
}));

vi.mock("@/components/ui/select", () => ({
  Select: ({
    value,
    disabled,
    children,
  }: {
    value: string;
    disabled?: boolean;
    children: React.ReactNode;
  }) => (
    <div
      data-testid="select"
      data-value={value}
      data-disabled={disabled ? "true" : "false"}
    >
      {children}
    </div>
  ),
  SelectTrigger: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="select-trigger">{children}</div>
  ),
  SelectValue: ({ className }: { className?: string }) => (
    <span className={className} data-testid="select-value" />
  ),
  SelectContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="select-content">{children}</div>
  ),
  SelectItem: ({
    children,
    value,
  }: {
    children: React.ReactNode;
    value: string;
  }) => (
    <div data-testid={`select-item-${value}`} data-value={value}>
      {children}
    </div>
  ),
  SelectItemDescription: ({
    children,
    className,
    title,
  }: {
    children: React.ReactNode;
    className?: string;
    title?: string;
  }) => (
    <span className={className} title={title}>
      {children}
    </span>
  ),
}));

vi.mock("@/components/ui/popover", () => ({
  Popover: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="popover-trigger">{children}</div>
  ),
  PopoverContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="popover-content">{children}</div>
  ),
}));

// Mock lucide-react icons
vi.mock("lucide-react", () => ({
  Save: () => <span data-testid="icon-save">Save</span>,
  Trash2: () => <span data-testid="icon-trash">Trash</span>,
  Check: () => <span data-testid="icon-check">Check</span>,
  X: () => <span data-testid="icon-x">X</span>,
  ListRestart: () => <span data-testid="icon-list-restart">ListRestart</span>,
}));

// Mock presets module
const mockSavePreset = vi.fn();
const mockLoadPresets = vi.fn();
const mockGetPresetSummary = vi.fn(() => "Static · 1920px · Grid: 3×4");

vi.mock("@/presets", () => ({
  savePreset: () => mockSavePreset(),
  deletePreset: vi.fn(),
  loadPresets: () => mockLoadPresets(),
  getPresetSummary: () => mockGetPresetSummary(),
}));

// -- Helpers --

function createDefaultOpts(overrides?: Partial<SavedOptions>): SavedOptions {
  return {
    width: 1920,
    cols: 3,
    rows: 4,
    spacing: 0,
    tcPosition: "top-left",
    bgColor: "#000000",
    textColor: "#ffffff",
    header: true,
    animSegments: DEFAULTS.animSegments,
    sequenceMode: DEFAULTS.sequenceMode,
    animFormat: DEFAULTS.animFormat,
    animDuration: DEFAULTS.animDuration,
    animFps: DEFAULTS.animFps,
    webpMethod: DEFAULTS.webpMethod,
    webpQuality: DEFAULTS.webpQuality,
    vrMode: DEFAULTS.vrMode,
    fontFamily: DEFAULTS.fontFamily,
    tcFontSizeAuto: DEFAULTS.tcFontSizeAuto,
    tcFontSize: DEFAULTS.tcFontSize,
    headerFontSizeAuto: DEFAULTS.headerFontSizeAuto,
    headerFontSize: DEFAULTS.headerFontSize,
    ...(overrides || {}),
  };
}

function renderPresetsRow(opts: SavedOptions, presets: AppSettings["presets"]) {
  const setOpts = vi.fn();
  const setPresets = vi.fn();

  mockLoadPresets.mockReturnValue(presets.entries);

  return {
    ...render(
      <PresetsRow
        opts={opts}
        setOpts={setOpts}
        presets={presets}
        setPresets={setPresets}
      />,
    ),
    setOpts,
    setPresets,
  };
}

// -- Tests --

describe("PresetsRow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = "";
  });

  describe("save dialog name selection", () => {
    it("prefills and selects the input when a preset is selected", async () => {
      const opts = createDefaultOpts();
      const presets: AppSettings["presets"] = {
        entries: {
          MyPreset: opts,
        },
        lastUsed: "MyPreset",
      };

      renderPresetsRow(opts, presets);

      // Click the save button to open the save dialog
      const saveButton = screen.getByTitle("Save / add preset");
      act(() => {
        fireEvent.click(saveButton);
      });

      // Input should be visible and prefilled
      const input = screen.getByTestId("preset-name-input") as HTMLInputElement;
      expect(input).toBeTruthy();
      expect(input).toHaveValue("MyPreset");

      // Wait for the setTimeout in openSave to set the selection range
      await waitFor(() => {
        expect(input.selectionStart).toBe(0);
        expect(input.selectionEnd).toBe("MyPreset".length);
      });
    });

    it("shows empty input when <Default Preset> is selected", () => {
      const opts = createDefaultOpts();
      const presets: AppSettings["presets"] = {
        entries: {
          MyPreset: opts,
        },
        lastUsed: null, // Default preset
      };

      renderPresetsRow(opts, presets);

      // Click the save button to open the save dialog
      const saveButton = screen.getByTitle("Save / add preset");
      act(() => {
        fireEvent.click(saveButton);
      });

      // Input should be visible
      const input = screen.getByTestId("preset-name-input") as HTMLInputElement;
      expect(input).toBeTruthy();

      // Input should be empty
      expect(input).toHaveValue("");

      // Cursor should be at the start (no selection since empty)
      expect(input.selectionStart).toBe(0);
      expect(input.selectionEnd).toBe(0);
    });

    it("prefills with preset name when saving over existing preset", () => {
      const opts = createDefaultOpts({ width: 1280 });
      const presets: AppSettings["presets"] = {
        entries: {
          ExistingPreset: createDefaultOpts(),
          AnotherPreset: createDefaultOpts(),
        },
        lastUsed: "ExistingPreset",
      };

      renderPresetsRow(opts, presets);

      const saveButton = screen.getByTitle("Save / add preset");
      act(() => {
        fireEvent.click(saveButton);
      });

      const input = screen.getByTestId("preset-name-input");
      expect(input).toHaveValue("ExistingPreset");
    });
  });

  describe("delete button", () => {
    it("is disabled when save dialog is open", () => {
      const opts = createDefaultOpts();
      const presets: AppSettings["presets"] = {
        entries: {
          MyPreset: opts,
        },
        lastUsed: "MyPreset",
      };

      renderPresetsRow(opts, presets);

      const deleteButton = screen.getByTitle("Delete selected preset");

      // Initially enabled
      expect(deleteButton).not.toBeDisabled();

      // Open save dialog
      const saveButton = screen.getByTitle("Save / add preset");
      act(() => {
        fireEvent.click(saveButton);
      });

      // Should now be disabled
      expect(deleteButton).toBeDisabled();
    });

    it("is disabled when no preset is selected", () => {
      const opts = createDefaultOpts();
      const presets: AppSettings["presets"] = {
        entries: {
          MyPreset: opts,
        },
        lastUsed: null,
      };

      renderPresetsRow(opts, presets);

      const deleteButton = screen.getByTitle("Delete selected preset");
      expect(deleteButton).toBeDisabled();
    });

    it("selects the alphabetically next preset after deletion", () => {
      const optsA = createDefaultOpts({ width: 1000 });
      const optsB = createDefaultOpts({ width: 2000 });
      const optsC = createDefaultOpts({ width: 3000 });

      // Delete "Beta" — should select "Gamma" (next in sorted order)
      mockLoadPresets.mockReturnValue({ Alpha: optsA, Gamma: optsC });

      const presets: AppSettings["presets"] = {
        entries: {
          Alpha: optsA,
          Beta: optsB,
          Gamma: optsC,
        },
        lastUsed: "Beta",
      };

      const { setOpts, setPresets } = renderPresetsRow(optsB, presets);

      const deleteButton = screen.getByTitle("Delete selected preset");
      act(() => {
        fireEvent.click(deleteButton);
      });

      // Should have selected "Gamma" (preset next after "Beta")
      expect(setOpts).toHaveBeenCalledWith(optsC);
      expect(setPresets).toHaveBeenCalledWith(
        expect.objectContaining({ lastUsed: "Gamma" }),
      );
    });

    it("selects the alphabetically previous preset when deleting the last in list", () => {
      const optsA = createDefaultOpts({ width: 1000 });
      const optsB = createDefaultOpts({ width: 2000 });

      // Delete "Gamma" (last) — should select "Beta" (previous in sorted order)
      mockLoadPresets.mockReturnValue({ Alpha: optsA, Beta: optsB });

      const presets: AppSettings["presets"] = {
        entries: {
          Alpha: optsA,
          Beta: optsB,
          Gamma: createDefaultOpts({ width: 3000 }),
        },
        lastUsed: "Gamma",
      };

      const { setOpts, setPresets } = renderPresetsRow(
        createDefaultOpts({ width: 3000 }),
        presets,
      );

      const deleteButton = screen.getByTitle("Delete selected preset");
      act(() => {
        fireEvent.click(deleteButton);
      });

      // Should have selected "Beta" (preset before "Gamma")
      expect(setOpts).toHaveBeenCalledWith(optsB);
      expect(setPresets).toHaveBeenCalledWith(
        expect.objectContaining({ lastUsed: "Beta" }),
      );
    });

    it("falls back to default preset when deleting the last preset", () => {
      const optsA = createDefaultOpts({ width: 1000 });

      mockLoadPresets.mockReturnValue({});

      const presets: AppSettings["presets"] = {
        entries: {
          OnlyPreset: optsA,
        },
        lastUsed: "OnlyPreset",
      };

      const { setOpts, setPresets } = renderPresetsRow(optsA, presets);

      const deleteButton = screen.getByTitle("Delete selected preset");
      act(() => {
        fireEvent.click(deleteButton);
      });

      // Should have fallen back to default
      expect(setOpts).toHaveBeenCalledWith(DEFAULTS);
      expect(setPresets).toHaveBeenCalledWith(
        expect.objectContaining({ lastUsed: null }),
      );
    });
  });

  describe("preset entries ordering", () => {
    it("renders preset entries in alphabetical order", () => {
      const opts = createDefaultOpts();
      const presets: AppSettings["presets"] = {
        entries: {
          Zebra: opts,
          Alpha: opts,
          Mango: opts,
          Beta: opts,
        },
        lastUsed: null,
      };

      renderPresetsRow(opts, presets);

      // Get all select items (excluding default preset)
      const items = document.querySelectorAll('[data-testid^="select-item-"]');
      const values = Array.from(items).map((el) =>
        el.getAttribute("data-value"),
      );

      // First item should be the default preset
      expect(values[0]).toBe(PRESETS_DEFAULT_VALUE);

      // Remaining items should be sorted alphabetically
      const presetNames = values.slice(1);
      expect(presetNames).toEqual(["Alpha", "Beta", "Mango", "Zebra"]);
    });

    it("keeps <Default Preset> at the top regardless of alphabetical order", () => {
      const opts = createDefaultOpts();
      const presets: AppSettings["presets"] = {
        entries: {
          "@BeforeDefault": opts,
          AAA: opts,
          ZZZ: opts,
        },
        lastUsed: null,
      };

      renderPresetsRow(opts, presets);

      const items = document.querySelectorAll('[data-testid^="select-item-"]');
      const values = Array.from(items).map((el) =>
        el.getAttribute("data-value"),
      );

      // Default preset should always be first
      expect(values[0]).toBe(PRESETS_DEFAULT_VALUE);

      // Rest should be sorted
      expect(values.slice(1)).toEqual(["@BeforeDefault", "AAA", "ZZZ"]);
    });
  });

  describe("save dialog interactions", () => {
    it("closes dialog on Escape key", () => {
      const opts = createDefaultOpts();
      const presets: AppSettings["presets"] = {
        entries: {
          MyPreset: opts,
        },
        lastUsed: "MyPreset",
      };

      renderPresetsRow(opts, presets);

      // Open save dialog
      const saveButton = screen.getByTitle("Save / add preset");
      act(() => {
        fireEvent.click(saveButton);
      });

      expect(screen.getByTestId("preset-name-input")).toBeTruthy();

      // Press Escape
      const input = screen.getByTestId("preset-name-input");
      fireEvent.keyDown(input, { key: "Escape" });

      // Dialog should be closed
      expect(screen.queryByTestId("preset-name-input")).not.toBeTruthy();
    });

    it("confirms save on Enter key", () => {
      const opts = createDefaultOpts();
      const presets: AppSettings["presets"] = {
        entries: {},
        lastUsed: null,
      };

      renderPresetsRow(opts, presets);

      // Open save dialog
      const saveButton = screen.getByTitle("Save / add preset");
      act(() => {
        fireEvent.click(saveButton);
      });

      const input = screen.getByTestId("preset-name-input");

      // Type a name
      fireEvent.change(input, { target: { value: "NewPreset" } });

      // Press Enter
      fireEvent.keyDown(input, { key: "Enter" });

      // savePreset should have been called
      expect(mockSavePreset).toHaveBeenCalled();
    });

    it("disables confirm button when input is empty", () => {
      const opts = createDefaultOpts();
      const presets: AppSettings["presets"] = {
        entries: {},
        lastUsed: null,
      };

      renderPresetsRow(opts, presets);

      // Open save dialog
      const saveButton = screen.getByTitle("Save / add preset");
      act(() => {
        fireEvent.click(saveButton);
      });

      const confirmButton = screen.getByTitle("Confirm");
      expect(confirmButton).toBeDisabled();
    });
  });
});
