import { multTier, type MultKey } from "../lib/filters";

// 倍率帯ごとの色（バッジ・フィルターチップで共通）
export const MULT_COLORS: Record<MultKey, string> = {
  "10-19": "bg-emerald-50 text-emerald-700 ring-emerald-200",
  "20-29": "bg-blue-50 text-blue-700 ring-blue-200",
  "30-39": "bg-violet-50 text-violet-700 ring-violet-200",
  "40-49": "bg-rose-50 text-rose-700 ring-rose-200",
  "50plus": "bg-amber-50 text-amber-800 ring-amber-300",
};

const pill = "inline-block whitespace-nowrap rounded-md px-1.5 py-0.5 text-xs font-semibold ring-1 ring-inset tabular-nums";

export function MultBadge({ multiplier }: { multiplier: number | null }) {
  if (multiplier == null) return null;
  const tier = multTier(multiplier);
  const color = tier ? MULT_COLORS[tier.key] : "bg-slate-50 text-slate-500 ring-slate-200";
  return <span className={`${pill} ${color}`}>x{multiplier.toFixed(1)}</span>;
}

export function SatelliteBadge() {
  return <span className={`${pill} bg-teal-50 text-teal-700 ring-teal-200`}>サテ</span>;
}
