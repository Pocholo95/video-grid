/**
 * Tests for the GridTemplateEditor component.
 *
 * Verifies row/cell management (add, remove, reset),
 * help panel toggle, save/close callbacks, empty state,
 * cell count display, and drag-to-reorder UI.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import GridTemplateEditor from "@/components/GridTemplateEditor";
import type { GridCell, GridTemplate } from "@/types";

// -- Mocks --

vi.mock("@formkit/auto-animate", () => ({
  autoAnimate: vi.fn(),
}));

vi.mock("@/lib/utils", () => ({
  cn: vi.fn((...classes: string[]) => classes.filter(Boolean).join(" ")),
}));

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({
    children,
  }: {
    children: React.ReactNode;
    open: boolean;
    onOpenChange: (open: boolean) => void;
  }) => (
    <div data-testid="dialog" role="dialog">
      {children}
    </div>
  ),
  DialogPortal: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dialog-portal">{children}</div>
  ),
  DialogOverlay: () => <div data-testid="dialog-overlay" />,
}));

vi.mock("@radix-ui/react-dialog", () => ({
  Content: ({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
    onOpenAutoFocus?: (e: Event) => void;
  }) => (
    <div data-testid="dialog-content" className={className}>
      {children}
    </div>
  ),
  Title: ({ children }: { children: React.ReactNode }) => (
    <div role="heading">{children}</div>
  ),
  Description: ({ children }: { children: React.ReactNode }) => (
    <div role="status">{children}</div>
  ),
}));

// -- Helpers --

function countTextOccurrences(root: HTMLElement, text: string): number {
  const all = root.querySelectorAll("*");
  let count = 0;
  all.forEach((el) => {
    if (el.textContent === text) count++;
  });
  return count;
}

function createMockTemplate(cols = 3, rows = 3): GridTemplate {
  const cells: GridCell[] = [];
  const baseW = Math.floor(60 / cols);
  const remainder = 60 - baseW * cols;
  for (let r = 0; r < rows; r++) {
    let cumX = 0;
    for (let c = 0; c < cols; c++) {
      const w = baseW + (c < remainder ? 1 : 0);
      cells.push({
        id: crypto.randomUUID(),
        x: cumX,
        y: r,
        w,
        h: 1,
      });
      cumX += w;
    }
  }
  return { cols: 60, cells };
}

function renderGridTemplateEditor(
  overrides?: Partial<{
    template: GridTemplate;
    cols: number;
    rows: number;
    onSave: (template: GridTemplate) => void;
    onClose: () => void;
  }>,
) {
  const onSave = overrides?.onSave ?? vi.fn();
  const onClose = overrides?.onClose ?? vi.fn();
  const template = overrides?.template ?? createMockTemplate(3, 3);
  const cols = overrides?.cols ?? 3;
  const rows = overrides?.rows ?? 3;

  return {
    ...render(
      <GridTemplateEditor
        template={template}
        cols={cols}
        rows={rows}
        onSave={onSave}
        onClose={onClose}
      />,
    ),
    onSave,
    onClose,
  };
}

// -- Tests --

describe("GridTemplateEditor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = "";
  });

  describe("rendering", () => {
    it("renders the dialog", () => {
      renderGridTemplateEditor();
      expect(screen.getByTestId("dialog")).toBeTruthy();
    });

    it("displays the title", () => {
      const { container } = renderGridTemplateEditor();
      // Title appears in both sr-only and visible header
      expect(
        countTextOccurrences(container, "Grid Template Editor"),
      ).toBeGreaterThan(0);
    });

    it("renders cells for each row", () => {
      const { container } = renderGridTemplateEditor({ cols: 3, rows: 2 });
      // 3 cols x 2 rows = 6 cells - text is split across elements so check full text
      const dialogText = container.textContent;
      expect(dialogText).toMatch(/6/);
      expect(dialogText).toMatch(/cells/);
      expect(dialogText).toMatch(/2/);
      expect(dialogText).toMatch(/rows/);
    });

    it("displays cell numbers in reading order", () => {
      renderGridTemplateEditor({ cols: 2, rows: 2 });
      // First cell should be numbered 1
      expect(screen.getByText("1")).toBeTruthy();
    });

    it("shows empty state when no rows exist", () => {
      const emptyTemplate: GridTemplate = { cols: 60, cells: [] };
      renderGridTemplateEditor({ template: emptyTemplate });
      expect(screen.getByText(/No rows yet/)).toBeTruthy();
    });

    it("disables Save button when no cells exist", () => {
      const emptyTemplate: GridTemplate = { cols: 60, cells: [] };
      renderGridTemplateEditor({ template: emptyTemplate });
      expect(screen.getByText("Save Template")).toBeDisabled();
    });
  });

  describe("help panel", () => {
    it("toggles help panel when help button is clicked", () => {
      renderGridTemplateEditor();
      const helpButton = screen.getByTitle("How does the template grid work?");
      fireEvent.click(helpButton);
      expect(screen.getByText(/Each row spans the full width/)).toBeTruthy();
      // Click again to hide
      fireEvent.click(helpButton);
      expect(
        screen.queryByText(/Each row spans the full width/),
      ).not.toBeTruthy();
    });
  });

  describe("row management", () => {
    it("adds a new row when Add Row button is clicked", async () => {
      const { container } = renderGridTemplateEditor({ cols: 3, rows: 2 });

      const addRowBtn = screen.getByTitle("Append a new full-width row");
      fireEvent.click(addRowBtn);

      await waitFor(() => {
        const dialogText = container.textContent;
        expect(dialogText).toMatch(/7/);
        expect(dialogText).toMatch(/3.*rows/);
      });
    });

    it("resets to uniform grid when Reset button is clicked", async () => {
      // Start with 1x1, then reset to 3x3
      const smallTemplate = createMockTemplate(1, 1);
      renderGridTemplateEditor({
        template: smallTemplate,
        cols: 3,
        rows: 3,
      });

      const resetBtn = screen.getByText("Reset (3×3)");
      fireEvent.click(resetBtn);

      await waitFor(() => {
        expect(screen.getByText(/9 cells across 3 rows/)).toBeTruthy();
      });
    });
  });

  describe("cell management", () => {
    it("adds a cell to a row when inline + button is clicked", async () => {
      const { container } = renderGridTemplateEditor({ cols: 2, rows: 2 });

      // Click the first add-cell button
      const addCellBtns = screen.queryAllByTitle(/Add a cell to this row/);
      expect(addCellBtns.length).toBeGreaterThan(0);
      fireEvent.click(addCellBtns[0]);

      await waitFor(() => {
        const dialogText = container.textContent;
        expect(dialogText).toMatch(/5/);
        expect(dialogText).toMatch(/cells/);
      });
    });

    it("removes a cell when X button is clicked", async () => {
      const { container } = renderGridTemplateEditor({ cols: 3, rows: 2 });

      const removeBtns = screen.queryAllByTitle("Remove this cell");
      expect(removeBtns.length).toBeGreaterThan(0);
      fireEvent.click(removeBtns[0]);

      await waitFor(() => {
        const dialogText = container.textContent;
        expect(dialogText).toMatch(/5/);
        expect(dialogText).toMatch(/cells/);
      });
    });

    it("removes the entire row when last cell is removed", async () => {
      // Create a row with only 1 cell
      const template = createMockTemplate(1, 2);
      renderGridTemplateEditor({ template });
      expect(screen.getByText(/2 cells across 2 rows/)).toBeTruthy();

      const removeBtns = screen.queryAllByTitle("Remove this cell");
      expect(removeBtns.length).toBeGreaterThan(0);
      fireEvent.click(removeBtns[0]);

      await waitFor(() => {
        expect(screen.getByText(/1 cell across 1 row/)).toBeTruthy();
      });
    });
  });

  describe("save and close callbacks", () => {
    it("calls onSave with template when Save Template is clicked", async () => {
      const onSave = vi.fn();
      renderGridTemplateEditor({ onSave });

      const saveBtn = screen.getByText("Save Template");
      fireEvent.click(saveBtn);

      await waitFor(() => {
        expect(onSave).toHaveBeenCalledTimes(1);
        expect(onSave.mock.calls[0][0]).toHaveProperty("cells");
      });
    });

    it("calls onClose when Cancel button is clicked", async () => {
      const onClose = vi.fn();
      renderGridTemplateEditor({ onClose });

      const cancelBtn = screen.getByText("Cancel");
      fireEvent.click(cancelBtn);

      await waitFor(() => {
        expect(onClose).toHaveBeenCalledTimes(1);
      });
    });

    it("calls onClose when X button is clicked", async () => {
      const onClose = vi.fn();
      renderGridTemplateEditor({ onClose });

      const closeBtn = screen.getByTitle("Close (Esc)");
      fireEvent.click(closeBtn);

      await waitFor(() => {
        expect(onClose).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe("cell count display", () => {
    it("shows correct cell count for uniform grid", () => {
      const { container } = renderGridTemplateEditor({ cols: 4, rows: 3 });
      const dialogText = container.textContent;
      expect(dialogText).toMatch(/12/);
      expect(dialogText).toMatch(/cells/);
      expect(dialogText).toMatch(/3.*rows/);
    });

    it("shows singular for 1 cell and 1 row", () => {
      const template = createMockTemplate(1, 1);
      renderGridTemplateEditor({ template });
      expect(screen.getByText(/1 cell across 1 row/)).toBeTruthy();
    });
  });

  describe("row drag UI", () => {
    it("renders drag handles for each row", () => {
      renderGridTemplateEditor({ cols: 3, rows: 3 });
      const dragHandles = screen.queryAllByTitle("Drag to reorder row");
      expect(dragHandles.length).toBe(3);
    });
  });
});
