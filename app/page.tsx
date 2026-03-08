"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type NewsRow = {
  media: string | null;
  id: string;
  title: string | null;
  published_at: string;
  event_id: string | null;
  read_count: number | null;
  is_pushed: boolean | null;
  is_business?: boolean | null;
  is_contribution?: boolean | null;
  first_status: string | null;
  operator: string | null;
};

function fmtTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function normalizeFirstStatus(value: string | null): string {
  if (!value) return "";
  const idx = value.lastIndexOf("-");
  if (idx >= 0 && idx < value.length - 1) return value.slice(idx + 1);
  return value;
}

function displayOperator(value: string | null): string {
  const v = (value ?? "").trim();
  if (!v) return "";
  if (v.toLowerCase() === "system") return "";
  return v;
}

function startOfDayLocal(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map((x) => Number(x));
  return new Date(y, (m || 1) - 1, d || 1, 0, 0, 0, 0);
}

function endOfDayLocal(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map((x) => Number(x));
  return new Date(y, (m || 1) - 1, d || 1, 23, 59, 59, 999);
}

export default function Home() {
  const [rows, setRows] = useState<NewsRow[]>([]);
  const [status, setStatus] = useState<string>("未加载");
  const [loading, setLoading] = useState(false);
  const [mediaFilter, setMediaFilter] = useState<string>("全部");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [eventKeyword, setEventKeyword] = useState<string>("");
  const [pageSize, setPageSize] = useState<number>(30);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [totalCount, setTotalCount] = useState<number>(0);

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

  const eventCountMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) {
      const eid = (r.event_id ?? "").trim();
      if (!eid) continue;
      m.set(eid, (m.get(eid) ?? 0) + 1);
    }
    return m;
  }, [rows]);

  const fallbackFirstStatus = useCallback(
    (r: NewsRow): string => {
      const normalized = normalizeFirstStatus(r.first_status);
      if (normalized) return normalized;
      const eid = (r.event_id ?? "").trim();
      if (!eid) return "";
      if ((eventCountMap.get(eid) ?? 0) <= 1) return "仅一家";
      return "";
    },
    [eventCountMap],
  );

  const toggleBoolField = useCallback(
    async (row: NewsRow, field: "is_business" | "is_contribution") => {
      if (!supabase) return;
      const nextValue = !(row[field] ?? false);
      setRows((prev) =>
        prev.map((x) => (x.id === row.id ? { ...x, [field]: nextValue } : x)),
      );
      const { error } = await supabase
        .from("news")
        .update({ [field]: nextValue })
        .eq("id", row.id);
      if (error) {
        setRows((prev) =>
          prev.map((x) => (x.id === row.id ? { ...x, [field]: row[field] ?? false } : x)),
        );
        setStatus(`更新失败：${error.message}`);
      }
    },
    [supabase],
  );

  const load = useCallback(async () => {
    if (!supabase) {
      setStatus("缺少 NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY");
      setRows([]);
      return;
    }
    setLoading(true);
    setStatus("加载中...");
    const safePage = Math.max(1, currentPage);
    const from = (safePage - 1) * pageSize;
    const to = from + pageSize - 1;
    let query = supabase
      .from("news")
      .select("*", { count: "exact" })
      .order("published_at", { ascending: false })
      .range(from, to);
    if (mediaFilter !== "全部") {
      query = query.eq("media", mediaFilter);
    }
    if (startDate) {
      query = query.gte("published_at", startOfDayLocal(startDate).toISOString());
    }
    if (endDate) {
      query = query.lte("published_at", endOfDayLocal(endDate).toISOString());
    }
    const eventLike = eventKeyword.trim();
    if (eventLike) {
      query = query.ilike("event_id", `%${eventLike}%`);
    }
    const { data, error, count } = await query;
    if (error) {
      setStatus(`加载失败：${error.message}`);
      setRows([]);
      setLoading(false);
      return;
    }
    setRows((data as NewsRow[]) ?? []);
    setTotalCount(count ?? 0);
    setStatus(
      `已加载 ${(data as NewsRow[])?.length ?? 0} / ${count ?? 0} 条（第 ${safePage} 页，每页 ${pageSize} 条，媒体=${mediaFilter}，事件关键词=${eventLike || "无"}）· ${new Date().toLocaleString()}`,
    );
    setLoading(false);
  }, [currentPage, endDate, eventKeyword, mediaFilter, pageSize, startDate, supabase]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  return (
    <div className="min-h-screen bg-white text-black">
      <div className="mx-auto max-w-[1400px] px-4 py-4">
        <div className="flex items-center justify-between gap-4 rounded-xl border-2 border-black px-4 py-3">
          <div>
            <div className="text-[18px] font-bold leading-tight">
              快讯采集看板
            </div>
            <div className="mt-1 text-xs text-black/70">{status}</div>
          </div>
          <div className="flex items-center gap-2">
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

        <div className="mt-3 overflow-auto rounded-xl border-2 border-black">
          <div className="flex flex-wrap items-center gap-2 border-b-2 border-black px-2 py-2 text-sm">
            <span>媒体</span>
            <select
              value={mediaFilter}
              onChange={(e) => {
                setMediaFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="rounded-md border-2 border-black px-2 py-1"
            >
              <option value="全部">全部</option>
              <option value="星球">星球</option>
              <option value="律动">律动</option>
              <option value="金色">金色</option>
            </select>
            <span>发布时间</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setCurrentPage(1);
              }}
              className="rounded-md border-2 border-black px-2 py-1"
            />
            <span>到</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setCurrentPage(1);
              }}
              className="rounded-md border-2 border-black px-2 py-1"
            />
            <span>事件</span>
            <input
              type="text"
              value={eventKeyword}
              onChange={(e) => {
                setEventKeyword(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="输入 event_id 关键词"
              className="rounded-md border-2 border-black px-2 py-1"
            />
            <span>每页</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value) || 30);
                setCurrentPage(1);
              }}
              className="rounded-md border-2 border-black px-2 py-1"
            >
              <option value={30}>30</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={200}>200</option>
            </select>
            <button
              type="button"
              onClick={load}
              disabled={loading}
              className="rounded-md border-2 border-black bg-[rgb(175,237,137)] px-2 py-1 font-bold disabled:opacity-60"
            >
              应用筛选
            </button>
            <button
              type="button"
              onClick={() => {
                setMediaFilter("全部");
                setStartDate("");
                setEndDate("");
                setEventKeyword("");
                setPageSize(30);
                setCurrentPage(1);
              }}
              className="rounded-md border-2 border-black bg-white px-2 py-1 font-bold"
            >
              重置
            </button>
            <span className="ml-2">页码</span>
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={loading || currentPage <= 1}
              className="rounded-md border-2 border-black bg-white px-2 py-1 font-bold disabled:opacity-60"
            >
              上一页
            </button>
            <span className="font-mono text-xs">
              {currentPage}/{Math.max(1, Math.ceil(totalCount / pageSize))}
            </span>
            <button
              type="button"
              onClick={() =>
                setCurrentPage((p) => {
                  const maxPage = Math.max(1, Math.ceil(totalCount / pageSize));
                  return Math.min(maxPage, p + 1);
                })
              }
              disabled={loading || currentPage >= Math.max(1, Math.ceil(totalCount / pageSize))}
              className="rounded-md border-2 border-black bg-white px-2 py-1 font-bold disabled:opacity-60"
            >
              下一页
            </button>
          </div>
          <table className="min-w-[1100px] w-full border-collapse text-sm">
            <thead className="sticky top-0 bg-white">
              <tr className="border-b-2 border-black">
                <th className="border-r-2 border-black px-2 py-2 text-left">
                  媒体
                </th>
                <th className="border-r-2 border-black px-2 py-2 text-left">
                  序号
                </th>
                <th className="border-r-2 border-black px-2 py-2 text-left">
                  标题
                </th>
                <th className="border-r-2 border-black px-2 py-2 text-left">
                  发布时间
                </th>
                <th className="border-r-2 border-black px-2 py-2 text-left">
                  事件
                </th>
                <th className="border-r-2 border-black px-2 py-2 text-right">
                  阅读量
                </th>
                <th className="px-2 py-2 text-center">
                  是否推送
                </th>
                <th className="px-2 py-2 text-center">
                  商务
                </th>
                <th className="px-2 py-2 text-center">
                  贡献快讯
                </th>
                <th className="border-r-2 border-black px-2 py-2 text-left">
                  首发情况
                </th>
                <th className="px-2 py-2 text-left">操作人</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-black/20">
                  <td className="border-r-2 border-black px-2 py-2">
                    {r.media ?? ""}
                  </td>
                  <td className="border-r-2 border-black px-2 py-2 font-mono text-xs">
                    {r.id}
                  </td>
                  <td className="max-w-[560px] break-words border-r-2 border-black px-2 py-2">
                    {r.title ?? ""}
                  </td>
                  <td className="border-r-2 border-black px-2 py-2 font-mono text-xs">
                    {fmtTime(r.published_at)}
                  </td>
                  <td className="border-r-2 border-black px-2 py-2 font-mono text-xs">
                    {r.event_id ?? ""}
                  </td>
                  <td className="border-r-2 border-black px-2 py-2 text-right font-mono">
                    {r.read_count ?? 0}
                  </td>
                  <td className="px-2 py-2 text-center">
                    <span
                      className={[
                        "inline-block rounded-md px-2 py-0.5 font-bold",
                        r.is_pushed ? "bg-[rgb(175,237,137)]" : "bg-white",
                      ].join(" ")}
                    >
                      {r.is_pushed ? "true" : "false"}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-center">
                    <button
                      type="button"
                      onClick={() => toggleBoolField(r, "is_business")}
                      className={[
                        "inline-block rounded-md px-2 py-0.5 font-bold",
                        "cursor-pointer",
                        r.is_business ? "bg-[rgb(175,237,137)]" : "bg-white",
                      ].join(" ")}
                    >
                      {r.is_business ? "true" : "false"}
                    </button>
                  </td>
                  <td className="px-2 py-2 text-center">
                    <button
                      type="button"
                      onClick={() => toggleBoolField(r, "is_contribution")}
                      className={[
                        "inline-block rounded-md px-2 py-0.5 font-bold",
                        "cursor-pointer",
                        r.is_contribution ? "bg-[rgb(175,237,137)]" : "bg-white",
                      ].join(" ")}
                    >
                      {r.is_contribution ? "true" : "false"}
                    </button>
                  </td>
                  <td className="border-r-2 border-black px-2 py-2">
                    {fallbackFirstStatus(r)}
                  </td>
                  <td className="px-2 py-2">{displayOperator(r.operator)}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={11} className="px-3 py-6 text-center text-black/60">
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
