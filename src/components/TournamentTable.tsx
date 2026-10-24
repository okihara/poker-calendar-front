import type { Tournament } from "../lib/data";
import { isClosingSoon, isExpired, type Sort, type SortKey } from "../lib/filters";
import { fmtTime } from "../lib/time";
import { MultBadge, SatelliteBadge, multRowClass } from "./Badges";

type Props = {
  rows: Tournament[];
  now: Date;
  sort: Sort;
  onSort: (key: SortKey) => void;
  onOpen: (t: Tournament) => void;
  onShopClick: (shopName: string) => void;
};

const COLUMNS: { key: SortKey; label: string; numeric?: boolean }[] = [
  { key: "start", label: "開始" },
  { key: "lateReg", label: "レイト" },
  { key: "area", label: "エリア" },
  { key: "shopName", label: "店名" },
  { key: "title", label: "タイトル" },
  { key: "entryFee", label: "参加費", numeric: true },
  { key: "addOn", label: "アドオン", numeric: true },
  { key: "totalPrize", label: "賞金総額", numeric: true },
  { key: "multiplier", label: "倍率", numeric: true },
];

const num = (n: number | null) => (n != null ? n.toLocaleString() : "");

// PC用テーブル
export function TournamentTable({ rows, now, sort, onSort, onOpen, onShopClick }: Props) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full min-w-[960px] text-sm">
        <thead className="bg-slate-50 text-left text-xs text-slate-500">
          <tr>
            {COLUMNS.map((c) => (
              <th
                key={c.key}
                onClick={() => onSort(c.key)}
                className={`cursor-pointer select-none whitespace-nowrap px-3 py-2.5 font-semibold hover:text-slate-900 ${c.numeric ? "text-right" : ""}`}
              >
                {c.label}
                <span className="ml-1 text-slate-400">{sort.key === c.key ? (sort.dir === "asc" ? "▲" : "▼") : "↕"}</span>
              </th>
            ))}
            <th className="px-3 py-2.5 font-semibold">プライズ概要</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((t) => (
            <tr key={t.id + t.title} className={`align-top ${multRowClass(t.multiplier)} hover:brightness-[0.97] ${isExpired(t, now) ? "opacity-45" : ""}`}>
              <td className="whitespace-nowrap px-3 py-2.5 font-semibold tabular-nums">{fmtTime(t.start)}</td>
              <td className={`whitespace-nowrap px-3 py-2.5 tabular-nums ${isClosingSoon(t, now) ? "font-bold text-red-600" : "text-orange-600"}`}>
                {fmtTime(t.lateReg)}
              </td>
              <td className="whitespace-nowrap px-3 py-2.5">{t.area}</td>
              <td className="px-3 py-2.5">
                <button type="button" onClick={() => onShopClick(t.shopName)} className="text-left text-slate-700 underline decoration-slate-300 underline-offset-2 hover:decoration-slate-500">
                  {t.shopName}
                </button>
              </td>
              <td className="px-3 py-2.5">
                {t.isSatellite && <span className="mr-1.5"><SatelliteBadge /></span>}
                {t.link ? (
                  <a
                    href={t.link}
                    onClick={(e) => {
                      if (e.metaKey || e.ctrlKey || e.shiftKey) return;
                      e.preventDefault();
                      onOpen(t);
                    }}
                    className="font-medium text-blue-700 hover:underline"
                  >
                    {t.title}
                  </a>
                ) : (
                  t.title
                )}
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums">{num(t.entryFee)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{num(t.addOn)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{t.totalPrize ? num(t.totalPrize) : "不明"}</td>
              <td className="px-3 py-2.5 text-right"><MultBadge multiplier={t.multiplier} /></td>
              <td className="px-3 py-2.5 text-xs text-slate-500">{t.prizeText}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
