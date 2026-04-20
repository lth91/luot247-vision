import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface SourceOption {
  key: string | null;
  label: string;
}

const OPTIONS: SourceOption[] = [
  { key: null,         label: "All" },
  { key: "reuters",    label: "Reuters" },
  { key: "ap",         label: "AP" },
  { key: "bbc",        label: "BBC" },
  { key: "cnn",        label: "CNN" },
  { key: "aljazeera",  label: "Al Jazeera" },
  { key: "gdelt",      label: "GDELT" },
];

interface Props {
  value: string | null;
  onChange: (v: string | null) => void;
}

export function IranSourceFilter({ value, onChange }: Props) {
  return (
    <div className="flex flex-wrap gap-2">
      {OPTIONS.map(opt => (
        <Button
          key={opt.key ?? "all"}
          size="sm"
          variant={value === opt.key ? "default" : "outline"}
          onClick={() => onChange(opt.key)}
          className={cn("h-7 px-3 text-xs")}
        >
          {opt.label}
        </Button>
      ))}
    </div>
  );
}
