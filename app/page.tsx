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

export default function Home() {
  const [rows, setRows] = useState<NewsRow[]>([]);
  const [status, setStatus] = useState<string>("未加载");
  const [loading, setLoading] = useState(false);

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
    const { data, error } = await supabase
      .from("news")
      .select("*")
      .order("published_at", { ascending: false })
      .limit(500);
    if (error) {
      setStatus(`加载失败：${error.message}`);
      setRows([]);
      setLoading(false);
      return;
    }
    setRows((data as NewsRow[]) ?? []);
    setStatus(
      `已加载 ${(data as NewsRow[])?.length ?? 0} 条 · ${new Date().toLocaleString()}`,
    );
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="min-h-screen bg-white text-black">
      <div className="mx-auto max-w-[1400px] px-4 py-4">
        <div className="flex items-center justify-between gap-4 border-2 border-black px-4 py-3">
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

        <div className="mt-3 overflow-auto border-2 border-black">
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
                        "inline-block px-2 py-0.5 font-bold",
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
                        "inline-block px-2 py-0.5 font-bold",
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
                        "inline-block px-2 py-0.5 font-bold",
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
