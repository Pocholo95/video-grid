import { useState } from "react";
import { Grid3x3 } from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
import { Field, FieldLabel } from "@/components/ui/field";
import Section from "./Section";
import RangeNumberInput from "./RangeNumberInput";
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
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <Field>
            <FieldLabel htmlFor="cp-width">Output width (px)</FieldLabel>
            <RangeNumberInput
              id="cp-width"
              value={opts.width}
              min={240}
              max={3840}
              step={10}
              onChange={(v) => setOpts({ ...opts, width: v })}
              suffix="px"
              unbounded
              hardMin={240}
              hardMax={16384}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="cp-spacing">Cell spacing (px)</FieldLabel>
            <RangeNumberInput
              id="cp-spacing"
              value={opts.spacing}
              min={0}
              max={48}
              onChange={(v) => setOpts({ ...opts, spacing: v })}
              suffix="px"
            />
          </Field>
        </div>
        {!isCustomTemplate && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <Field>
              <FieldLabel htmlFor="cp-cols">Grid columns</FieldLabel>
              <RangeNumberInput
                id="cp-cols"
                value={opts.cols}
                min={1}
                max={12}
                onChange={(v) => setOpts({ ...opts, cols: v })}
                unbounded
                hardMax={50}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="cp-rows">Grid rows</FieldLabel>
              <RangeNumberInput
                id="cp-rows"
                value={opts.rows}
                min={1}
                max={12}
                onChange={(v) => setOpts({ ...opts, rows: v })}
                unbounded
                hardMax={50}
              />
            </Field>
          </div>
        )}
        <div className="bg-muted/30 flex flex-col gap-3 rounded-md border p-3 sm:col-span-2">
          <Field orientation="horizontal">
            <Switch
              id="cp-tpl-toggle"
              label="Custom grid template"
              checked={isCustomTemplate}
              onCheckedChange={handleToggleTemplate}
            />
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
                <Grid3x3 className="size-4" />
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
