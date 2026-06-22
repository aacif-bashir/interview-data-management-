"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { STRATEGY_LABELS, type SplitStrategy } from "@/lib/paste/split";

export function StrategyPicker({
  value,
  onChange,
}: {
  value: SplitStrategy;
  onChange: (s: SplitStrategy) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Select
        value={value.kind}
        onValueChange={(kind) => {
          if (kind === "delimiter") onChange({ kind: "delimiter", value: "---" });
          else onChange({ kind } as SplitStrategy);
        }}
      >
        <SelectTrigger size="sm" className="flex-1">
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="popper">
          {(
            Object.keys(STRATEGY_LABELS) as SplitStrategy["kind"][]
          ).map((k) => (
            <SelectItem key={k} value={k}>
              {STRATEGY_LABELS[k]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {value.kind === "delimiter" && (
        <Input
          value={value.value}
          onChange={(e) => onChange({ kind: "delimiter", value: e.target.value })}
          placeholder="Delimiter line"
          className="h-8 w-28"
        />
      )}
    </div>
  );
}
