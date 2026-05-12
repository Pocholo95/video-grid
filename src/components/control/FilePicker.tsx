import * as React from "react";
import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Upload } from "lucide-react";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

interface Props {
  onFilesChange: (files: File[]) => void;
}
/**
 * File Picker replacement that supports click and dropping files in its active area.
 */
export default function FilePicker({ onFilesChange }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = React.useState(false);
  const [successAnim, setSuccessAnim] = React.useState(false);

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setIsDragOver(true);
  };

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);

    const files = Array.from(e.dataTransfer.files).filter((file) =>
      file.type.startsWith("video/"),
    );
    if (files.length) {
      onFilesChange(files);
      setSuccessAnim(true);
      setTimeout(() => setSuccessAnim(false), 400);
    }
  };

  const handleButtonClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    fileInputRef.current?.click();
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []) as File[];
    if (files.length) {
      onFilesChange(files);
      e.target.value = "";
      setSuccessAnim(true);
      setTimeout(() => setSuccessAnim(false), 400);
    }
  };

  return (
    <Field className="h-full flex flex-col">
      <FieldLabel>Drop or click to add video files</FieldLabel>
      <div
        className={`
  relative w-full flex-1 cursor-pointer rounded-md border-2 border-dashed p-0 transition-all duration-300
  ${
    isDragOver
      ? "border-primary bg-primary/10 ring-2 ring-primary/30 shadow-lg"
      : successAnim
        ? "border-emerald-500/60 bg-emerald-50/30 ring-2 ring-emerald-500/40 shadow-md shadow-emerald-200/30 animate-[pulse_1s_ease-in-out_2] fill-mode-[forwards]"
        : "border-input hover:border-ring hover:bg-accent/50"
  }
`}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <Input
          ref={fileInputRef}
          type="file"
          accept="video/*"
          multiple
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          onChange={handleInputChange}
        />
        <Button
          type="button"
          variant="ghost"
          className="h-full w-full justify-center gap-2 border-none bg-transparent p-2 shadow-none hover:bg-transparent"
          onClick={handleButtonClick}
        >
          <Upload className="h-4 w-4 shrink-0" />
          <span className="text-sm font-medium">Add videos</span>
        </Button>
      </div>
    </Field>
  );
}
