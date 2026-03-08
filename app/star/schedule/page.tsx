"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { useCallback, useMemo, useState } from "react";
import {
  defaultShiftTimes,
  OPERATOR_OPTIONS,
  shiftCodesForDate,
  SHIFT_LABELS,
  weekdayLabelFromDateKey,
  type ShiftCalendarRow,
  type ShiftCode,
} from "../../../lib/shift-utils";

type ShiftRow = {
  work_date: string;
  shift_code: ShiftCode;
  operator: string;
  start_time: string;
  end_time: string;
  timezone: string;
};

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function dateKey(y: number, m: number, d: number): string {
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

function monthDays(year: number, month: number): string[] {
  const days = new Date(year, month, 0).getDate();
  const out: string[] = [];
  for (let d = 1; d <= days; d += 1) out.push(dateKey(year, month, d));
  return out;
}

function monthLabel(month: number): string {
  return `${month}月`;
}

export default function StarSchedulePage() {
  const [status, setStatus] = useState("未加载");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [month, setMonth] = useState<number>(1);
  const [rowsMap, setRowsMap] = useState<Record<string, ShiftRow>>({});

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

  const days = useMemo(() => monthDays(2026, month), [month]);

  const keyOf = (workDate: string, shiftCode: ShiftCode) => `${workDate}|${shiftCode}`;

  const ensureDefaultRows = useCallback(
    (baseMap: Record<string, ShiftRow>) => {
      const next = { ...baseMap };
      for (let m = 1; m <= 12; m += 1) {
        for (const d of monthDays(2026, m)) {
          for (const code of shiftCodesForDate(d)) {
            const key = keyOf(d, code);
            if (next[key]) continue;
            const t = defaultShiftTimes(code);
            next[key] = {
              work_date: d,
              shift_code: code,
              operator: OPERATOR_OPTIONS[0],
              start_time: t.start_time,
              end_time: t.end_time,
              timezone: "Asia/Shanghai",
            };
          }
        }
      }
      return next;
    },
    [],
  );

  const load = useCallback(async () => {
    if (!supabase) {
      setStatus("缺少 NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY");
      return;
    }
    setLoading(true);
    setStatus("加载中...");
    const { data, error } = await supabase
      .from("shift_calendar")
      .select("work_date,shift_code,operator,start_time,end_time,timezone")
      .gte("work_date", "2026-01-01")
      .lte("work_date", "2026-12-31")
      .limit(5000);
    if (error) {
      setStatus(`加载失败：${error.message}`);
      setLoading(false);
      return;
    }
    const map: Record<string, ShiftRow> = {};
    for (const raw of (data as ShiftCalendarRow[]) ?? []) {
      const code = raw.shift_code as ShiftCode;
      map[keyOf(raw.work_date, code)] = {
        work_date: raw.work_date,
        shift_code: code,
        operator: raw.operator || OPERATOR_OPTIONS[0],
        start_time: raw.start_time,
        end_time: raw.end_time,
        timezone: raw.timezone || "Asia/Shanghai",
      };
    }
    setRowsMap(ensureDefaultRows(map));
    setStatus(`已加载 ${Object.keys(map).length} 条排班`);
    setLoading(false);
  }, [ensureDefaultRows, supabase]);

  const save = useCallback(async () => {
    if (!supabase) return;
    const payload = Object.values(ensureDefaultRows(rowsMap)).map((x) => ({
      work_date: x.work_date,
      shift_code: x.shift_code,
      operator: x.operator,
      start_time: x.start_time,
      end_time: x.end_time,
      timezone: "Asia/Shanghai",
    }));
    setSaving(true);
    setStatus("保存中...");
    const { error } = await supabase.from("shift_calendar").upsert(payload);
    if (error) {
      setStatus(`保存失败：${error.message}`);
      setSaving(false);
      return;
    }
    setStatus(`保存成功：${new Date().toLocaleString()} (${payload.length} 班次)`);
    setSaving(false);
  }, [ensureDefaultRows, rowsMap, supabase]);

  const setOperator = useCallback(
    (workDate: string, shiftCode: ShiftCode, operator: string) => {
      const key = keyOf(workDate, shiftCode);
      setRowsMap((prev) => {
        const next = { ...prev };
        const cur = next[key];
        if (!cur) {
          const t = defaultShiftTimes(shiftCode);
          next[key] = {
            work_date: workDate,
            shift_code: shiftCode,
            operator,
            start_time: t.start_time,
            end_time: t.end_time,
            timezone: "Asia/Shanghai",
          };
          return next;
        }
        next[key] = { ...cur, operator };
        return next;
      });
    },
    [],
  );

  return (
    <div className="min-h-screen bg-white text-black">
      <div className="mx-auto max-w-[1400px] px-4 py-4">
        <div className="flex items-center justify-between gap-4 rounded-xl border-2 border-black px-4 py-3">
          <div>
            <div className="text-[18px] font-bold leading-tight">星球值班日历（2026）</div>
            <div className="mt-1 text-xs text-black/70">{status}</div>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              className="rounded-md border-2 border-black px-2 py-2 text-sm"
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>
                  {monthLabel(m)}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={load}
              disabled={loading}
              className="rounded-md border-2 border-black bg-white px-3 py-2 text-sm font-bold disabled:opacity-60"
            >
              加载
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="rounded-md border-2 border-black bg-[rgb(175,237,137)] px-3 py-2 text-sm font-bold disabled:opacity-60"
            >
              保存
            </button>
          </div>
        </div>

        {!supabase && (
          <div className="mt-3 rounded-xl border-2 border-black px-3 py-2 text-sm text-black/70">
            在 web/.env.local 配置 NEXT_PUBLIC_SUPABASE_URL 与 NEXT_PUBLIC_SUPABASE_ANON_KEY 后重启 dev server。
          </div>
        )}

        <div className="mt-3 overflow-auto rounded-xl border-2 border-black">
          <table className="min-w-[1000px] w-full border-collapse text-sm">
            <thead className="sticky top-0 bg-white">
              <tr className="border-b-2 border-black">
                <th className="border-r-2 border-black px-2 py-2 text-left">日期</th>
                <th className="border-r-2 border-black px-2 py-2 text-left">周几</th>
                <th className="border-r-2 border-black px-2 py-2 text-left">班次</th>
                <th className="border-r-2 border-black px-2 py-2 text-left">时段</th>
                <th className="px-2 py-2 text-left">值班人</th>
              </tr>
            </thead>
            <tbody>
              {days.flatMap((d) =>
                shiftCodesForDate(d).map((code) => {
                  const key = keyOf(d, code);
                  const row = rowsMap[key];
                  const times = row ?? { ...defaultShiftTimes(code), operator: OPERATOR_OPTIONS[0] };
                  return (
                    <tr key={key} className="border-t border-black/20">
                      <td className="border-r-2 border-black px-2 py-2 font-mono text-xs">{d}</td>
                      <td className="border-r-2 border-black px-2 py-2">{weekdayLabelFromDateKey(d)}</td>
                      <td className="border-r-2 border-black px-2 py-2">{SHIFT_LABELS[code]}</td>
                      <td className="border-r-2 border-black px-2 py-2 font-mono">
                        {times.start_time} - {times.end_time}
                      </td>
                      <td className="px-2 py-2">
                        <select
                          value={times.operator}
                          onChange={(e) => setOperator(d, code, e.target.value)}
                          className="w-full rounded-md border-2 border-black px-2 py-1"
                        >
                          {OPERATOR_OPTIONS.map((op) => (
                            <option key={op} value={op}>
                              {op}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  );
                }),
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
