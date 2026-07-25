import { Grid3x3, Clapperboard, Scissors, Images } from "lucide-react";
import type { OutputMode } from "../../types";

interface ModeCard {
  value: OutputMode;
  title: string;
  description: string;
  icon: typeof Grid3x3;
}

const MODE_CARDS: ModeCard[] = [
  {
    value: "static",
    title: "Static Grid",
    description: "Grid of thumbnails (JPG)",
    icon: Grid3x3,
  },
  {
    value: "animated",
    title: "Animated Grid",
    description: "Animated grid (WebP/MP4)",
    icon: Clapperboard,
  },
  {
    value: "sequence",
    title: "Sequence",
    description: "Video segments (WebP/MP4)",
    icon: Scissors,
  },
  {
    value: "gallery",
    title: "Gallery",
    description: "Individual frames (JPG)",
    icon: Images,
  },
];

interface Props {
  value: OutputMode;
  onChange: (mode: OutputMode) => void;
}

export default function OutputModeCards({ value, onChange }: Props) {
  return (
    <div className="grid grid-cols-4 gap-2 sm:gap-3">
      {MODE_CARDS.map((card) => {
        const Icon = card.icon;
        const selected = value === card.value;
        return (
          <button
            key={card.value}
            type="button"
            className={`flex flex-col items-center justify-center gap-1 rounded-lg border-2 p-2 sm:p-3 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
              selected
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-card text-muted-foreground hover:border-primary/50 hover:text-foreground"
            }`}
            onClick={() => onChange(card.value)}
            title={card.description}
          >
            <Icon className="size-5 sm:size-6" />
            <span className="text-xs font-medium sm:text-sm">{card.title}</span>
            <span className="hidden text-[10px] sm:text-xs text-muted-foreground text-center leading-tight sm:block">
              {card.description}
            </span>
          </button>
        );
      })}
    </div>
  );
}
