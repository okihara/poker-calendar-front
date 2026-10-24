import type { Tournament } from "../lib/data";
import { isClosingSoon, isExpired } from "../lib/filters";
import { fmtHM } from "../lib/time";
import { MultBadge, SatelliteBadge } from "./Badges";

type Props = {
  rows: Tournament[];
  now: Date;
  onOpen: (t: Tournament) => void;
  onShopClick: (shopName: string) => void;
};

// 100000 → "10万", 505000 → "50.5万"
function fmtMan(n: number) {
  return n >= 10000 ? `${Math.round(n / 1000) / 10}万` : n.toLocaleString();
}

// スマホ用の高密度リスト（1件2〜3行）
export function TournamentList({ rows, now, onOpen, onShopClick }: Props) {
  return (
    <ul className="divide-y divide-slate-200 bg-white">
      {rows.map((t) => {
        const closing = isClosingSoon(t, now);
        return (
          <li
            key={t.id + t.title}
            onClick={() => t.link && onOpen(t)}
            className={`flex gap-3 px-4 py-2.5 ${t.link ? "cursor-pointer active:bg-slate-100" : ""} ${isExpired(t, now) ? "opacity-45" : ""}`}
          >
            <div className="w-12 shrink-0 pt-0.5 text-center leading-tight tabular-nums">
              <div className="text-[17px] font-bold">{fmtHM(t.start)}</div>
              {t.lateReg && (
                <div className={`mt-0.5 text-xs ${closing ? "font-bold text-red-600" : "text-orange-600"}`}>
                  <div className="text-[10px] font-normal text-slate-400">締切</div>
                  {fmtHM(t.lateReg)}
                </div>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <div className="line-clamp-2 text-[15px] font-semibold leading-snug">{t.title || "タイトルなし"}</div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-slate-500">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onShopClick(t.shopName);
                  }}
                  className="max-w-full truncate text-left text-slate-600 underline decoration-slate-300 underline-offset-2"
                >
                  {t.shopName}
                </button>
                {t.area && <span>· {t.area}</span>}
                {t.entryFee != null && <span className="tabular-nums">· ¥{t.entryFee.toLocaleString()}</span>}
                {t.totalPrize != null && <span className="tabular-nums">· 賞金{fmtMan(t.totalPrize)}</span>}
              </div>
            </div>

            <div className="flex shrink-0 flex-col items-end gap-1 pt-0.5">
              <MultBadge multiplier={t.multiplier} />
              {t.isSatellite && <SatelliteBadge />}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
