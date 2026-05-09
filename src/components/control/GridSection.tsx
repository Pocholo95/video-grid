import { useState } from "react";
import { LayoutGrid } from "lucide-react";
import { templateFromUniform } from "../../gridTemplate";
import GridTemplateEditor from "../GridTemplateEditor";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import Section from "./Section";
import type { AppSettings, GridTemplate, SavedOptions } from "../../types";

interface Props {
  opts: SavedOptions;
  setOpts: (o: SavedOptions) => void;
  presets: AppSettings["presets"];
  expanded: boolean;
  onToggle: () => void;
}

export default function GridSection({
  opts,
  setOpts,
  presets,
  expanded,
  onToggle,
}: Props) {
  const [showTemplateEditor, setShowTemplateEditor] = useState(false);
  const [confirmDiscardTemplate, setConfirmDiscardTemplate] = useState(false);

  const numField = (
    key: "width" | "cols" | "rows" | "spacing",
    minVal: number = -Infinity,
    maxVal: number = Infinity,
  ) => {
    const clamp = (num: number) => Math.max(minVal, Math.min(maxVal, num));

    return {
      // Display current raw/clamped state
      value: String(opts[key]),
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
        // Capture raw input freely - no clamping here
        setOpts({ ...opts, [key]: Number(e.target.value) || 0 });
      },
      onBlur: () => {
        // Clamp on blur, update state/display
        setOpts({
          ...opts,
          [key]: clamp(opts[key]),
        });
      },
      min: minVal,
      max: maxVal,
    };
  };

  const hasTemplate = !!(
    opts.gridTemplate && opts.gridTemplate.cells.length > 0
  );
  const isCustomTemplate = hasTemplate;

  const handleToggleTemplate = (checked: boolean | "indeterminate") => {
    if (checked === true) {
      setOpts({
        ...opts,
        gridTemplate: templateFromUniform(
          Math.max(1, opts.cols),
          Math.max(1, opts.rows),
        ),
      });
      setShowTemplateEditor(true);
    } else {
      const currentTemplate = opts.gridTemplate;
      const presetName = presets.lastUsed;
      const presetTemplate =
        presetName && presets.entries[presetName]
          ? presets.entries[presetName].gridTemplate
          : undefined;

      const hasUnsavedTemplate =
        currentTemplate &&
        JSON.stringify(currentTemplate) !== JSON.stringify(presetTemplate);

      if (hasUnsavedTemplate) {
        setConfirmDiscardTemplate(true);
        return;
      }
      setOpts({ ...opts, gridTemplate: undefined });
    }
  };

  const confirmDiscardAndDisableTemplate = () => {
    setOpts({ ...opts, gridTemplate: undefined });
    setConfirmDiscardTemplate(false);
  };

  const handleSaveTemplate = (tpl: GridTemplate) => {
    setOpts({ ...opts, gridTemplate: tpl });
    setShowTemplateEditor(false);
  };

  const editorTemplate =
    opts.gridTemplate && opts.gridTemplate.cells.length > 0
      ? opts.gridTemplate
      : templateFromUniform(Math.max(1, opts.cols), Math.max(1, opts.rows));

  const cellCount = opts.gridTemplate?.cells.length ?? 0;
  const rowCount = opts.gridTemplate
    ? new Set(opts.gridTemplate.cells.map((c) => c.y)).size
    : 0;

  return (
    <>
      <Section label="Grid" expanded={expanded} onToggle={onToggle}>
        <Field>
          <FieldLabel htmlFor="cp-width">Output width (px)</FieldLabel>
          <Input
            id="cp-width"
            type="number"
            step={1}
            {...numField("width", 240)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="cp-spacing">Frame spacing (px)</FieldLabel>
          <Input
            id="cp-spacing"
            type="number"
            step={1}
            {...numField("spacing", 0)}
          />
        </Field>
        {!isCustomTemplate && (
          <>
            <Field>
              <FieldLabel htmlFor="cp-cols">Grid columns</FieldLabel>
              <Input
                id="cp-cols"
                type="number"
                step={1}
                {...numField("cols", 1)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="cp-rows">Grid rows</FieldLabel>
              <Input
                id="cp-rows"
                type="number"
                step={1}
                {...numField("rows", 1)}
              />
            </Field>
          </>
        )}
        <div className="bg-muted/30 flex flex-col gap-3 rounded-md border p-3 sm:col-span-2">
          <Field orientation="horizontal">
            <Checkbox
              id="cp-tpl-toggle"
              checked={isCustomTemplate}
              onCheckedChange={handleToggleTemplate}
            />
            <FieldLabel htmlFor="cp-tpl-toggle">
              Custom grid template
            </FieldLabel>
          </Field>
          {isCustomTemplate && opts.gridTemplate && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-muted-foreground text-sm">
                {cellCount} cell{cellCount !== 1 ? "s" : ""} · {rowCount} row
                {rowCount !== 1 ? "s" : ""}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowTemplateEditor(true)}
                title="Open template editor"
              >
                <LayoutGrid className="size-4" />
                Edit Template
              </Button>
            </div>
          )}
        </div>
      </Section>

      {showTemplateEditor && (
        <GridTemplateEditor
          template={editorTemplate}
          cols={Math.max(1, opts.cols)}
          rows={Math.max(1, opts.rows)}
          onSave={handleSaveTemplate}
          onClose={() => setShowTemplateEditor(false)}
        />
      )}

      <AlertDialog
        open={confirmDiscardTemplate}
        onOpenChange={setConfirmDiscardTemplate}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved template?</AlertDialogTitle>
            <AlertDialogDescription>
              The current grid template is not saved in any preset. Disabling
              this will discard it. Continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDiscardAndDisableTemplate}>
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
