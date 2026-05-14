import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ItemGroup, Item } from "@/components/ui/item-group";

interface CopyFieldProps {
  value: string;
  fieldType?: "input" | "textarea";
  rows?: number;
}

export function CopyField({
  value,
  fieldType = "input",
  rows = 3,
}: CopyFieldProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const el = document.createElement("textarea");
      el.value = value;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const commonProps = {
    readOnly: true,
    value,
    onFocus: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      e.target.select(),
    className: "font-mono text-xs flex-1 pr-12",
  };

  return (
    <ItemGroup className="w-full">
      <Item className="relative border-0">
        {fieldType === "textarea" ? (
          <Textarea {...commonProps} rows={rows} />
        ) : (
          <Input type="text" {...commonProps} />
        )}
        <Button
          variant="outline"
          size="icon"
          onClick={handleCopy}
          title={copied ? "Copied!" : "Copy to clipboard"}
          className="absolute right-0 top-1/2 -translate-y-1/2 h-full w-10 z-50 bg-background/80 hover:bg-background text-xs shadow-sm transition-all group-hover/item:bg-accent/50"
        >
          {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
        </Button>
      </Item>
    </ItemGroup>
  );
}
