import UploadLinks from "@/components/UploadLinks";
import type { TaskItem, UploadDestination } from "@/types";
import { useUploadStore } from "@/store/uploadStore";

interface Props {
  item: TaskItem;
  destinations: UploadDestination[];
}

export default function UploadResultsSection({ item, destinations }: Props) {
  const enabledDests = destinations.filter((d) => d.enabled);
  const clearUploadResult = useUploadStore((s) => s.clearUploadResult);

  if (!enabledDests.some((d) => item.uploads?.[d.id]?.status === "done")) {
    return null;
  }

  const handleDelete = (destId: string) => {
    clearUploadResult(item.id, destId);
  };

  return (
    <div className="flex flex-col gap-2">
      {enabledDests.map((dest) => {
        const state = item.uploads?.[dest.id];
        if (state?.status !== "done" || !state.result) return null;
        return (
          <UploadLinks
            key={dest.id}
            dest={dest}
            result={state.result}
            filename={item.outputName ?? item.file.name}
            metadata={item.metadata}
            onDelete={handleDelete}
          />
        );
      })}
    </div>
  );
}
