import UploadLinks from "@/components/UploadLinks";
import type { TaskItem } from "@/types";
import type { UploadDestination } from "@/types";

interface Props {
  item: TaskItem;
  destinations: UploadDestination[];
}

export default function UploadResultsSection({ item, destinations }: Props) {
  const enabledDests = destinations.filter((d) => d.enabled);

  if (!enabledDests.some((d) => item.uploads?.[d.id]?.status === "done")) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2">
      {enabledDests.map((dest) => {
        const state = item.uploads?.[dest.id];
        if (state?.status !== "done" || !state.result) return null;
        return (
          <UploadLinks
            key={dest.id}
            destName={dest.name}
            result={state.result}
            filename={item.outputName ?? item.file.name}
            metadata={item.metadata}
          />
        );
      })}
    </div>
  );
}
