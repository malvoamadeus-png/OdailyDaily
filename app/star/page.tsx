"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  assignShift,
  beijingDateKey,
  getNaturalMonthRange,
  getNaturalWeekRange,
  OPERATOR_OPTIONS,
  SHIFT_LABELS,
  weekdayLabelFromDateKey,
  type ShiftAssignment,
  type ShiftCalendarRow,
} from "../../lib/shift-utils";

type NewsRow = {
  id: string;
  media: string | null;
  published_at: string;
  operator: string | null;
  first_status: string | null;
};

type Granularity = "day" | "week" | "month";

type OperatorStat = {
  operator: string;
  aFirst: number;
  bTotal: number;
  cRate: number;
};

type OperatorShiftDetail = {
  operator: string;
  shiftKey: string;
  shiftLabel: string;
  weekday: string;
  aFirst: number;
  bTotal: number;
  cRate: number;
};

const WEEKDAY_ORDER: Record<string, number> = {
  周一: 1,
  周二: 2,
  周三: 3,
  周四: 4,
  周五: 5,
  周六: 6,
  周日: 7,
};

const SHIFT_ORDER: Record<string, number> = {
  早班: 1,
  午班: 2,
  晚班: 3,
  其他: 9,
};

function normalizeFirstStatus(value: string | null): string {
  if (!value) return "";
  if (value === "仅一家") return value;
  const idx = value.lastIndexOf("-");
  if (idx >= 0 && idx < value.length - 1) return value.slice(idx + 1);
  return value;
}

function toDateInputValue(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function ymdFromUtcDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function rateBar(rate: number) {
  const percent = Math.max(0, Math.min(100, Math.round(rate * 10000) / 100));
  return (
    <div className="relative h-6 min-w-[120px] overflow-hidden rounded-md border border-black/30 bg-black/5">
      <div
        className="absolute left-0 top-0 h-full bg-[rgb(175,237,137)]"
        style={{ width: `${percent}%` }}
      />
      <div className="relative px-2 text-right font-mono leading-6">
        {percent.toFixed(2)}%
      </div>
    </div>
  );
}

export default function StarAnalyticsPage() {
  const [status, setStatus] = useState("未加载");
  const [loading, setLoading] = useState(false);
  const [baseDate, setBaseDate] = useState<string>(() => toDateInputValue(new Date()));
  const [granularity, setGranularity] = useState<Granularity>("day");
  const [operatorFilter, setOperatorFilter] = useState<string>("all");
  const [summary, setSummary] = useState<{ aFirst: number; bTotal: number; cRate: number }>({
    aFirst: 0,
    bTotal: 0,
    cRate: 0,
  });
  const [operatorStats, setOperatorStats] = useState<OperatorStat[]>([]);
  const [operatorShiftDetails, setOperatorShiftDetails] = useState<OperatorShiftDetail[]>([]);
  const [expandedByOperator, setExpandedByOperator] = useState<Record<string, boolean>>({});

  const env = useMemo(() => {
    return {
      url: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
      anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
    };
  }, []);

  const supabase: SupabaseClient | null = useMemo(() => {
    if (!env.url || !env.anonKey) return null;
    return createClient(env.url, env.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }, [env.anonKey, env.url]);

  const load = useCallback(async () => {
    if (!supabase) {
      setStatus("缺少 NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY");
      setOperatorStats([]);
      setOperatorShiftDetails([]);
      setExpandedByOperator({});
      setSummary({ aFirst: 0, bTotal: 0, cRate: 0 });
      return;
    }

    const range = (() => {
      if (granularity === "day") {
        const d = new Date(`${baseDate}T00:00:00+08:00`);
        const start = new Date(d.getTime());
        const end = new Date(d.getTime() + 24 * 60 * 60 * 1000 - 1);
        return { start, end };
      }
      if (granularity === "week") {
        return getNaturalWeekRange(baseDate);
      }
      return getNaturalMonthRange(baseDate);
    })();
    const periodStartYmd = ymdFromUtcDate(range.start);
    const periodEndYmd = ymdFromUtcDate(range.end);
    const queryStartIso = new Date(range.start.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const queryEndIso = new Date(range.end.getTime() + 24 * 60 * 60 * 1000).toISOString();

    setLoading(true);
    setStatus("加载中...");

    const scheduleResp = await supabase
      .from("shift_calendar")
      .select("work_date,shift_code,operator,start_time,end_time,timezone")
      .gte("work_date", "2026-01-01")
      .lte("work_date", "2026-12-31")
      .limit(5000);
    if (scheduleResp.error) {
      setStatus(`加载失败：${scheduleResp.error.message}`);
      setLoading(false);
      return;
    }

    const starResp = await supabase
      .from("news")
      .select("id,media,published_at,operator,first_status")
      .eq("media", "星球")
      .gte("published_at", queryStartIso)
      .lte("published_at", queryEndIso)
      .limit(10000);
    if (starResp.error) {
      setStatus(`加载失败：${starResp.error.message}`);
      setLoading(false);
      return;
    }

    const rows = (starResp.data as NewsRow[]) ?? [];
    const calendarRows = (scheduleResp.data as ShiftCalendarRow[]) ?? [];
    const byOperator = new Map<string, OperatorStat>();
    const byOperatorShift = new Map<string, OperatorShiftDetail>();
    let totalA = 0;
    let totalB = 0;

    for (const r of rows) {
      const assign: ShiftAssignment = assignShift(r.published_at, r.operator, calendarRows);
      if (operatorFilter !== "all" && assign.operator !== operatorFilter) continue;
      if (assign.kind === "matched") {
        if (assign.workDate < periodStartYmd || assign.workDate > periodEndYmd) continue;
      } else {
        const day = beijingDateKey(new Date(r.published_at));
        if (day < periodStartYmd || day > periodEndYmd) continue;
      }

      const operator = assign.operator || (r.operator || "").trim() || "未知";
      const operatorCur =
        byOperator.get(operator) ??
        ({
          operator,
          aFirst: 0,
          bTotal: 0,
          cRate: 0,
        } as OperatorStat);

      operatorCur.bTotal += 1;
      totalB += 1;
      let isFirst = false;
      if (normalizeFirstStatus(r.first_status) === "星球") {
        operatorCur.aFirst += 1;
        totalA += 1;
        isFirst = true;
      }
      byOperator.set(operator, operatorCur);

      const detailKey = (() => {
        if (assign.kind === "matched") return `${operator}|${assign.shiftKey}`;
        const day = beijingDateKey(new Date(r.published_at));
        return `${operator}|other|${day}`;
      })();
      const detailCur =
        byOperatorShift.get(detailKey) ??
        ({
          operator,
          shiftKey: detailKey,
          shiftLabel:
            assign.kind === "matched"
              ? SHIFT_LABELS[assign.shiftCode]
              : SHIFT_LABELS.other,
          weekday:
            assign.kind === "matched"
              ? weekdayLabelFromDateKey(assign.workDate)
              : weekdayLabelFromDateKey(beijingDateKey(new Date(r.published_at))),
          aFirst: 0,
          bTotal: 0,
          cRate: 0,
        } as OperatorShiftDetail);
      detailCur.bTotal += 1;
      if (isFirst) detailCur.aFirst += 1;
      byOperatorShift.set(detailKey, detailCur);
    }

    const operatorOut: OperatorStat[] = Array.from(byOperator.values())
      .map((x) => {
        const c = x.bTotal > 0 ? x.aFirst / x.bTotal : 0;
        return { ...x, cRate: c };
      })
      .sort((x, y) => y.bTotal - x.bTotal || x.operator.localeCompare(y.operator));
    const detailOut: OperatorShiftDetail[] = Array.from(byOperatorShift.values())
      .map((x) => ({
        ...x,
        cRate: x.bTotal > 0 ? x.aFirst / x.bTotal : 0,
      }))
      .sort((x, y) => {
        if (x.operator !== y.operator) return x.operator.localeCompare(y.operator);
        const w1 = WEEKDAY_ORDER[x.weekday] ?? 99;
        const w2 = WEEKDAY_ORDER[y.weekday] ?? 99;
        if (w1 !== w2) return w1 - w2;
        const s1 = SHIFT_ORDER[x.shiftLabel] ?? 99;
        const s2 = SHIFT_ORDER[y.shiftLabel] ?? 99;
        if (s1 !== s2) return s1 - s2;
        return y.bTotal - x.bTotal;
      });

    setOperatorStats(operatorOut);
    setOperatorShiftDetails(detailOut);
    setExpandedByOperator({});
    setSummary({
      aFirst: totalA,
      bTotal: totalB,
      cRate: totalB > 0 ? totalA / totalB : 0,
    });
    setStatus(
      `统计区间 ${periodStartYmd} ~ ${periodEndYmd} · 星球原始 ${rows.length} 条 · ${new Date().toLocaleString()}`,
    );
    setLoading(false);
  }, [baseDate, granularity, operatorFilter, supabase]);

  const detailsByOperator = useMemo(() => {
    const m = new Map<string, OperatorShiftDetail[]>();
    for (const row of operatorShiftDetails) {
      const arr = m.get(row.operator) ?? [];
      arr.push(row);
      m.set(row.operator, arr);
    }
    return m;
  }, [operatorShiftDetails]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  return (
    <div className="min-h-screen bg-white text-black">
      <div className="mx-auto max-w-[1200px] px-4 py-4">
        <div className="flex items-center justify-between gap-4 rounded-xl border-2 border-black px-4 py-3">
          <div>
            <div className="text-[18px] font-bold leading-tight">
              星球班次统计
            </div>
            <div className="mt-1 text-xs text-black/70">{status}</div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 text-sm">
              <div>粒度</div>
              <select
                value={granularity}
                onChange={(e) => setGranularity(e.target.value as Granularity)}
                className="rounded-md border-2 border-black px-2 py-1"
              >
                <option value="day">自然日</option>
                <option value="week">自然周</option>
                <option value="month">自然月</option>
              </select>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <div>基准日期</div>
              <input
                type="date"
                value={baseDate}
                onChange={(e) => setBaseDate(e.target.value)}
                className="rounded-md border-2 border-black px-2 py-1"
              />
            </div>
            <div className="flex items-center gap-2 text-sm">
              <div>操作人</div>
              <select
                value={operatorFilter}
                onChange={(e) => setOperatorFilter(e.target.value)}
                className="rounded-md border-2 border-black px-2 py-1"
              >
                <option value="all">全部</option>
                {OPERATOR_OPTIONS.map((op) => (
                  <option key={op} value={op}>
                    {op}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={load}
              disabled={loading}
              className="rounded-md border-2 border-black bg-[rgb(175,237,137)] px-3 py-2 text-sm font-bold disabled:opacity-60"
            >
              刷新
            </button>
          </div>
        </div>

        {!supabase && (
          <div className="mt-3 rounded-xl border-2 border-black">
            <div className="border-b-2 border-black px-3 py-2 font-bold">
              配置
            </div>
            <div className="px-3 py-2 text-sm text-black/70">
              在 web/.env.local 配置 NEXT_PUBLIC_SUPABASE_URL 与
              NEXT_PUBLIC_SUPABASE_ANON_KEY 后重启 dev server。
            </div>
          </div>
        )}

        <div className="mt-3 rounded-xl border-2 border-black">
          <div className="border-b-2 border-black px-3 py-2 font-bold">
            汇总
          </div>
          <div className="grid grid-cols-1 gap-2 px-3 py-2 text-sm md:grid-cols-3">
            <div className="flex items-center justify-between rounded-lg border-2 border-black px-3 py-2">
              <div>首发快讯数量A</div>
              <div className="font-mono font-bold">{summary.aFirst}</div>
            </div>
            <div className="flex items-center justify-between rounded-lg border-2 border-black px-3 py-2">
              <div>总发布数量B</div>
              <div className="font-mono font-bold">{summary.bTotal}</div>
            </div>
            <div className="flex items-center justify-between rounded-lg border-2 border-black px-3 py-2">
              <div>首发率C</div>
              <div>{rateBar(summary.cRate)}</div>
            </div>
          </div>
        </div>

        <div className="mt-3 overflow-auto rounded-xl border-2 border-black">
          <table className="min-w-[980px] w-full border-collapse text-sm">
            <thead className="sticky top-0 bg-white">
              <tr className="border-b-2 border-black">
                <th className="border-r-2 border-black px-2 py-2 text-left">
                  人 / 明细
                </th>
                <th className="border-r-2 border-black px-2 py-2 text-right">
                  首发快讯数量A
                </th>
                <th className="border-r-2 border-black px-2 py-2 text-right">
                  总发布数量B
                </th>
                <th className="px-2 py-2 text-right">首发率C</th>
              </tr>
            </thead>
            <tbody>
              {operatorStats.map((s) => {
                const details = detailsByOperator.get(s.operator) ?? [];
                const expanded = !!expandedByOperator[s.operator];
                const canExpand = details.length > 0;
                return (
                  <>
                    <tr key={s.operator} className="border-t border-black/20">
                      <td className="border-r-2 border-black px-2 py-2">
                        <div className="flex items-center gap-2">
                          {canExpand && (
                            <button
                              type="button"
                              className="h-6 w-6 rounded-md border border-black/40 text-xs"
                              onClick={() =>
                                setExpandedByOperator((prev) => ({
                                  ...prev,
                                  [s.operator]: !prev[s.operator],
                                }))
                              }
                            >
                              {expanded ? "▾" : "▸"}
                            </button>
                          )}
                          {!canExpand && <span className="inline-block w-6" />}
                          <span>{s.operator}</span>
                        </div>
                      </td>
                      <td className="border-r-2 border-black px-2 py-2 text-right font-mono">
                        {s.aFirst}
                      </td>
                      <td className="border-r-2 border-black px-2 py-2 text-right font-mono">
                        {s.bTotal}
                      </td>
                      <td className="px-2 py-2">{rateBar(s.cRate)}</td>
                    </tr>
                    {expanded &&
                      details.map((x) => (
                        <tr key={x.shiftKey} className="border-t border-black/10 bg-black/[0.03]">
                          <td className="border-r-2 border-black px-2 py-2 pl-10 text-black/85">
                            {x.weekday} · {x.shiftLabel}
                          </td>
                          <td className="border-r-2 border-black px-2 py-2 text-right font-mono">
                            {x.aFirst}
                          </td>
                          <td className="border-r-2 border-black px-2 py-2 text-right font-mono">
                            {x.bTotal}
                          </td>
                          <td className="px-2 py-2">{rateBar(x.cRate)}</td>
                        </tr>
                      ))}
                  </>
                );
              })}
              {operatorStats.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-black/60">
                    暂无数据
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

