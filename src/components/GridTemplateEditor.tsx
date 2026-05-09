import { useCallback, useRef, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  Grid3x3,
  GripVertical,
  HelpCircle,
  Plus,
  RotateCcw,
  X,
} from "lucide-react";
import { Dialog, DialogPortal, DialogOverlay } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { GridCell, GridTemplate } from "../types";
import {
  EDITOR_COLS,
  sortCellsReadingOrder,
  templateFromUniform,
} from "../gridTemplate";

interface Props {
  template: GridTemplate;
  cols: number;
  rows: number;
  onSave: (template: GridTemplate) => void;
  onClose: () => void;
}

// Helpers

/**
 * Distribute EDITOR_COLS equally across `count` cells.
 * The last cell absorbs any rounding remainder so the total is always exact.
 *
 * @param count - Number of cells in the row.
 * @returns Array of `count` widths that sum to EDITOR_COLS.
 */
const equalWeights = (count: number): number[] => {
  if (count <= 0) return [];
  const base = Math.floor(EDITOR_COLS / count);
  const remainder = EDITOR_COLS - base * count;
  return Array.from({ length: count }, (_, i) =>
    i < remainder ? base + 1 : base,
  );
};

/**
 * Repack a row's cells: assign equal widths then recompute x positions.
 *
 * @param rowCells - Cells in left-to-right order.
 * @returns Updated cells with w and x set so they fill the full row.
 */
const rebalanceRow = (rowCells: GridCell[]): GridCell[] => {
  const weights = equalWeights(rowCells.length);
  let cumX = 0;
  return rowCells.map((c, i) => {
    const cell = { ...c, w: weights[i], x: cumX };
    cumX += weights[i];
    return cell;
  });
};

/** Return the distinct sorted row indices present in the cell list. */
const getRowIndices = (cells: GridCell[]): number[] =>
  [...new Set(cells.map((c) => c.y))].sort((a, b) => a - b);

/** Return cells in a given row, sorted left-to-right. */
const getRowCells = (cells: GridCell[], rowY: number): GridCell[] =>
  cells.filter((c) => c.y === rowY).sort((a, b) => a.x - b.x);

/**
 * Renumber all row y values so they are contiguous starting from 0.
 *
 * @param cells - Cell list to renumber.
 * @returns New cell array with y values remapped to 0, 1, 2 …
 */
const renumberRows = (cells: GridCell[]): GridCell[] => {
  const oldRows = getRowIndices(cells);
  const remap = new Map(oldRows.map((y, i) => [y, i]));
  return cells.map((c) => ({ ...c, y: remap.get(c.y) ?? c.y }));
};

export default function GridTemplateEditor({
  template,
  cols,
  rows,
  onSave,
  onClose,
}: Props) {
  const [cells, setCells] = useState<GridCell[]>(() => {
    // Normalise on init: rebalance each row and renumber.
    const rows = getRowIndices(template.cells);
    const normalised: GridCell[] = [];
    for (const y of rows) {
      const row = getRowCells(template.cells, y);
      normalised.push(...rebalanceRow(row).map((c) => ({ ...c, y })));
    }
    return renumberRows(normalised);
  });

  const [showHelp, setShowHelp] = useState<boolean>(false);

  // Row drag-and-drop state
  /** y index of the row currently being dragged, or null. */
  const [dragRowY, setDragRowY] = useState<number | null>(null);
  /**
   * y index of the row that the dragged row will be inserted *before*.
   * null = insert after the last row.
   */
  const [dropBeforeY, setDropBeforeY] = useState<number | null | undefined>(
    undefined,
  );

  /** Refs to each rendered row element, keyed by row y index. */
  const rowRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const canvasRef = useRef<HTMLDivElement>(null);

  /**
   * Given a pointer clientY, determine which row the pointer is in the top
   * half of (drop before that row) or the bottom half of (drop after it).
   * Returns the y index to insert before, or null to insert at the end.
   */
  const computeDropTarget = useCallback(
    (clientY: number): number | null => {
      const rowIndices = getRowIndices(cells);
      for (const y of rowIndices) {
        const el = rowRefs.current.get(y);
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        if (clientY < rect.top + rect.height / 2) return y;
      }
      return null; // after last row
    },
    [cells],
  );

  const handleRowDragStart = useCallback(
    (e: React.PointerEvent, rowY: number) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      setDragRowY(rowY);
      setDropBeforeY(computeDropTarget(e.clientY));
    },
    [computeDropTarget],
  );

  const handleRowDragMove = useCallback(
    (e: React.PointerEvent) => {
      if (dragRowY === null) return;
      setDropBeforeY(computeDropTarget(e.clientY));
    },
    [dragRowY, computeDropTarget],
  );

  const handleRowDragEnd = useCallback(() => {
    if (dragRowY === null) {
      setDragRowY(null);
      setDropBeforeY(undefined);
      return;
    }

    setCells((prev) => {
      const rowIndices = getRowIndices(prev);
      if (rowIndices.length < 2) return prev;

      // Build ordered list of y values, remove dragged row, insert at target
      const order = [...rowIndices];
      const fromIdx = order.indexOf(dragRowY);
      if (fromIdx === -1) return prev;
      order.splice(fromIdx, 1);

      let insertIdx: number;
      if (dropBeforeY === null || dropBeforeY === undefined) {
        insertIdx = order.length; // append at end
      } else {
        insertIdx = order.indexOf(dropBeforeY);
        if (insertIdx === -1) insertIdx = order.length;
      }
      order.splice(insertIdx, 0, dragRowY);

      // Remap each cell's y to its new position in the order
      const remap = new Map(order.map((oldY, newY) => [oldY, newY]));
      return prev.map((c) => ({ ...c, y: remap.get(c.y) ?? c.y }));
    });

    setDragRowY(null);
    setDropBeforeY(undefined);
  }, [dragRowY, dropBeforeY]);

  // Add / Remove rows and cells
  /** Append a new row below all existing rows with one full-width cell. */
  const handleAddRow = useCallback(() => {
    setCells((prev) => {
      const rows = getRowIndices(prev);
      const nextY = rows.length > 0 ? Math.max(...rows) + 1 : 0;
      return [
        ...prev,
        { id: crypto.randomUUID(), x: 0, y: nextY, w: EDITOR_COLS, h: 1 },
      ];
    });
  }, []);

  /**
   * Add a cell to a row, then rebalance all cells in that row equally.
   *
   * @param rowY - Target row y index.
   */
  const handleAddCellToRow = useCallback((rowY: number) => {
    setCells((prev) => {
      const rowCells = getRowCells(prev, rowY);
      if (rowCells.length >= EDITOR_COLS) return prev;
      const newCell: GridCell = {
        id: crypto.randomUUID(),
        x: 0,
        y: rowY,
        w: 1,
        h: 1,
      };
      const rebalanced = rebalanceRow([...rowCells, newCell]);
      return [...prev.filter((c) => c.y !== rowY), ...rebalanced];
    });
  }, []);

  /**
   * Remove a cell. Rebalances the remaining cells in that row equally.
   * If it was the last cell, the row is removed and rows are renumbered.
   *
   * @param id - Cell id to remove.
   */
  const handleRemoveCell = useCallback((id: string) => {
    setCells((prev) => {
      const target = prev.find((c) => c.id === id);
      if (!target) return prev;
      const remaining = getRowCells(prev, target.y).filter((c) => c.id !== id);
      if (remaining.length === 0) {
        return renumberRows(prev.filter((c) => c.id !== id));
      }
      const rebalanced = rebalanceRow(remaining);
      return renumberRows([
        ...prev.filter((c) => c.y !== target.y),
        ...rebalanced,
      ]);
    });
  }, []);

  // Reset

  // Replace the existing `handleReset`
  const handleReset = useCallback(() => {
    setCells(templateFromUniform(cols, rows).cells);
  }, [cols, rows]);

  const handleSave = useCallback(() => {
    onSave({ cols: EDITOR_COLS, cells });
  }, [cells, onSave]);

  // Render
  const rowIndices = getRowIndices(cells);
  const cellCount = cells.length;
  const sortedForLabels = sortCellsReadingOrder(cells);
  const cellOrder = new Map(sortedForLabels.map((c, idx) => [c.id, idx + 1]));

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Content
          className="bg-background fixed top-1/2 left-1/2 z-50 flex max-h-[92vh] w-[min(96vw,900px)] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-lg border p-4 shadow-lg sm:p-6"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <DialogPrimitive.Title className="sr-only">
            Grid Template Editor
          </DialogPrimitive.Title>
          {/* Header */}
          <div className="flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-base font-semibold sm:text-lg">
              <Grid3x3 className="size-5 shrink-0" />
              Grid Template Editor
            </h2>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowHelp((v: boolean) => !v)}
                title="How does the template grid work?"
                aria-pressed={showHelp}
              >
                <HelpCircle className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                title="Close (Esc)"
              >
                <X className="size-4" />
              </Button>
            </div>
          </div>

          {/* Collapsible help panel */}
          {showHelp && (
            <div className="bg-muted/30 text-muted-foreground flex flex-col gap-2 rounded-md border p-3 text-sm">
              <p>
                Each row spans the full width, with cells sharing it{" "}
                <strong className="text-foreground">equally</strong>. More cells
                = narrower; fewer = wider. Cell{" "}
                <strong className="text-foreground">height</strong> auto-adjusts
                from width and aspect ratio, so output stays proportional.
              </p>
              <p>
                Cells are numbered in timestamp order: top-to-bottom,
                left-to-right. This also drives the{" "}
                <strong className="text-foreground">Timestamp Editor</strong>
                —after changing the template, requeue tasks to apply the new
                cell count.
              </p>
              <p>
                Templates are saved in{" "}
                <strong className="text-foreground">presets</strong>. Save once,
                reload anytime, and tweak other settings without rebuilding.
              </p>
            </div>
          )}

          {/* Scrollable canvas */}
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
            <div
              ref={canvasRef}
              className="flex flex-col gap-2"
              onPointerMove={handleRowDragMove}
              onPointerUp={handleRowDragEnd}
              onPointerCancel={handleRowDragEnd}
            >
              {rowIndices.map((rowY) => {
                const rowCells = getRowCells(cells, rowY);
                const isDraggingThis = dragRowY === rowY;
                const isDropTarget =
                  dropBeforeY === rowY &&
                  dragRowY !== null &&
                  dragRowY !== rowY;
                const isDropTargetAfter =
                  dropBeforeY === null &&
                  rowY === rowIndices[rowIndices.length - 1] &&
                  dragRowY !== null &&
                  dragRowY !== rowY;

                return (
                  <div
                    key={rowY}
                    ref={(el) => {
                      if (el) rowRefs.current.set(rowY, el);
                      else rowRefs.current.delete(rowY);
                    }}
                    className={cn(
                      "bg-muted/30 flex items-stretch gap-2 rounded-md border p-2 transition-all",
                      isDraggingThis && "opacity-40",
                      isDropTarget && "border-primary border-t-4",
                      isDropTargetAfter && "border-primary border-b-4",
                    )}
                  >
                    {/* Row drag handle */}
                    <div
                      className="text-muted-foreground hover:bg-accent flex w-8 shrink-0 cursor-grab items-center justify-center rounded touch-none active:cursor-grabbing"
                      title="Drag to reorder row"
                      onPointerDown={(e) => handleRowDragStart(e, rowY)}
                    >
                      <GripVertical className="size-4" />
                    </div>

                    {/* Cells + inline add button */}
                    <div className="flex flex-1 items-stretch gap-2">
                      {rowCells.map((cell) => {
                        const num = cellOrder.get(cell.id) ?? "?";
                        return (
                          <div
                            key={cell.id}
                            className="bg-card group relative flex h-16 items-center justify-center rounded border"
                            style={{ flex: `${cell.w} 0 0` }}
                          >
                            <span className="text-foreground font-mono text-base font-semibold tabular-nums">
                              {num}
                            </span>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="absolute top-1 right-1 size-6 opacity-75 lg:opacity-0 border lg:border-0 border-input/50 lg:transition-opacity group-hover:opacity-100"
                              title="Remove this cell"
                              onClick={() => handleRemoveCell(cell.id)}
                            >
                              <X className="size-3" />
                            </Button>
                          </div>
                        );
                      })}

                      {/* Inline "+" add-cell button at the end of the row */}
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-16 w-12 shrink-0 border-dashed"
                        onClick={() => handleAddCellToRow(rowY)}
                        disabled={rowCells.length >= EDITOR_COLS}
                        title="Add a cell to this row — all cells will share the width equally"
                      >
                        <Plus className="size-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}

              {/* Empty state */}
              {rowIndices.length === 0 && (
                <div className="text-muted-foreground rounded-md border border-dashed p-8 text-center text-sm">
                  No rows yet — click{" "}
                  <strong className="text-foreground">+ Add Row</strong> to
                  start.
                </div>
              )}
            </div>

            {/* Bottom toolbar — Add Row + Reset */}
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={handleAddRow}
                title="Append a new full-width row"
              >
                <Plus className="size-4" />
                Add Row
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleReset}
                title={`Reset to a uniform ${cols}×${rows} grid`}
              >
                <RotateCcw className="size-4" />
                Reset ({cols}×{rows})
              </Button>
              {cellCount > 0 && (
                <span className="text-muted-foreground ml-auto text-xs">
                  {cellCount} cell{cellCount !== 1 ? "s" : ""} across{" "}
                  {rowIndices.length} row{rowIndices.length !== 1 ? "s" : ""}
                </span>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 border-t pt-4">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant="default"
              disabled={cellCount === 0}
              onClick={handleSave}
              title={
                cellCount === 0 ? "Add at least one row first" : "Save template"
              }
            >
              Save Template
            </Button>
          </div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
