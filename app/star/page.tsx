"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { useCallback, useEffect, useMemo, useState } from "react";

type NewsRow = {
  media: string | null;
  published_at: string;
  operator: string | null;
  first_status: string | null;
};

type OperatorStat = {
  operator: string;
  aFirst: number;
  bTotal: number;
  cRate: number;
};

function toDateInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function startOfDayLocal(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map((x) => Number(x));
  return new Date(y, (m || 1) - 1, d || 1, 0, 0, 0, 0);
}

function endOfDayLocal(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map((x) => Number(x));
  return new Date(y, (m || 1) - 1, d || 1, 23, 59, 59, 999);
}

function normalizeFirstStatus(value: string | null): string {
  if (!value) return "";
  if (value === "仅一家") return value;
  const idx = value.lastIndexOf("-");
  if (idx >= 0 && idx < value.length - 1) return value.slice(idx + 1);
  return value;
}

export default function StarAnalyticsPage() {
  const [status, setStatus] = useState("未加载");
  const [loading, setLoading] = useState(false);
  const [startDate, setStartDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return toDateInputValue(d);
  });
  const [endDate, setEndDate] = useState<string>(() => toDateInputValue(new Date()));
  const [stats, setStats] = useState<OperatorStat[]>([]);
  const [totalAllMedia, setTotalAllMedia] = useState<number>(0);

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
      setStats([]);
      setTotalAllMedia(0);
      return;
    }

    const start = startOfDayLocal(startDate).toISOString();
    const end = endOfDayLocal(endDate).toISOString();

    setLoading(true);
    setStatus("加载中...");

    const allResp = await supabase
      .from("news")
      .select("id", { count: "exact", head: true })
      .gte("published_at", start)
      .lte("published_at", end);
    if (allResp.error) {
      setStatus(`加载失败：${allResp.error.message}`);
      setLoading(false);
      return;
    }
    setTotalAllMedia(allResp.count ?? 0);

    const starResp = await supabase
      .from("news")
      .select("media,published_at,operator,first_status")
      .eq("media", "星球")
      .gte("published_at", start)
      .lte("published_at", end)
      .limit(10000);
    if (starResp.error) {
      setStatus(`加载失败：${starResp.error.message}`);
      setLoading(false);
      return;
    }

    const rows = (starResp.data as NewsRow[]) ?? [];
    const byOp = new Map<string, { a: number; b: number }>();
    for (const r of rows) {
      const op = (r.operator || "").trim() || "unknown";
      const cur = byOp.get(op) ?? { a: 0, b: 0 };
      cur.b += 1;
      if (normalizeFirstStatus(r.first_status) === "星球") cur.a += 1;
      byOp.set(op, cur);
    }

    const out: OperatorStat[] = Array.from(byOp.entries())
      .map(([operator, v]) => {
        const c = v.b > 0 ? v.a / v.b : 0;
        return { operator, aFirst: v.a, bTotal: v.b, cRate: c };
      })
      .sort((x, y) => y.bTotal - x.bTotal);

    setStats(out);
    setStatus(
      `时间段 ${startDate} ~ ${endDate} · 星球 ${rows.length} 条 · ${new Date().toLocaleString()}`,
    );
    setLoading(false);
  }, [endDate, startDate, supabase]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="min-h-screen bg-white text-black">
      <div className="mx-auto max-w-[1200px] px-4 py-4">
        <div className="flex items-center justify-between gap-4 border-2 border-black px-4 py-3">
          <div>
            <div className="text-[18px] font-bold leading-tight">
              星球快讯统计
            </div>
            <div className="mt-1 text-xs text-black/70">{status}</div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-sm">
              <div>起始</div>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="border-2 border-black px-2 py-1"
              />
            </div>
            <div className="flex items-center gap-2 text-sm">
              <div>结束</div>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="border-2 border-black px-2 py-1"
              />
            </div>
            <button
              type="button"
              onClick={load}
              disabled={loading}
              className="border-2 border-black bg-[rgb(175,237,137)] px-3 py-2 text-sm font-bold disabled:opacity-60"
            >
              刷新
            </button>
          </div>
        </div>

        {!supabase && (
          <div className="mt-3 border-2 border-black">
            <div className="border-b-2 border-black px-3 py-2 font-bold">
              配置
            </div>
            <div className="px-3 py-2 text-sm text-black/70">
              在 web/.env.local 配置 NEXT_PUBLIC_SUPABASE_URL 与
              NEXT_PUBLIC_SUPABASE_ANON_KEY 后重启 dev server。
            </div>
          </div>
        )}

        <div className="mt-3 border-2 border-black">
          <div className="border-b-2 border-black px-3 py-2 font-bold">
            汇总
          </div>
          <div className="grid grid-cols-1 gap-2 px-3 py-2 text-sm md:grid-cols-2">
            <div className="flex items-center justify-between border-2 border-black px-3 py-2">
              <div>总快讯数量（全媒体）</div>
              <div className="font-mono font-bold">{totalAllMedia}</div>
            </div>
            <div className="flex items-center justify-between border-2 border-black px-3 py-2">
              <div>操作人数量（星球）</div>
              <div className="font-mono font-bold">{stats.length}</div>
            </div>
          </div>
        </div>

        <div className="mt-3 overflow-auto border-2 border-black">
          <table className="min-w-[900px] w-full border-collapse text-sm">
            <thead className="sticky top-0 bg-white">
              <tr className="border-b-2 border-black">
                <th className="border-r-2 border-black px-2 py-2 text-left">
                  操作人
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
              {stats.map((s) => (
                <tr key={s.operator} className="border-t border-black/20">
                  <td className="border-r-2 border-black px-2 py-2">
                    {s.operator}
                  </td>
                  <td className="border-r-2 border-black px-2 py-2 text-right font-mono">
                    {s.aFirst}
                  </td>
                  <td className="border-r-2 border-black px-2 py-2 text-right font-mono">
                    {s.bTotal}
                  </td>
                  <td className="px-2 py-2 text-right font-mono">
                    {(s.cRate * 100).toFixed(2)}%
                  </td>
                </tr>
              ))}
              {stats.length === 0 && (
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

