"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { sessionApi } from "@/lib/api";

const QUICK_ACTIONS = [
  { href: "/dashboard/studio",   icon: "📹", label: "Bắt đầu tập",     color: "bg-orange-500/15 border-orange-500/30 hover:bg-orange-500/25" },
  { href: "/dashboard/progress", icon: "📈", label: "Xem tiến trình",   color: "bg-blue-500/15 border-blue-500/30 hover:bg-blue-500/25" },
  { href: "/dashboard/planner",  icon: "📅", label: "Kế hoạch tập",    color: "bg-green-500/15 border-green-500/30 hover:bg-green-500/25" },
  { href: "/dashboard/profile",  icon: "👤", label: "Cập nhật hồ sơ",  color: "bg-purple-500/15 border-purple-500/30 hover:bg-purple-500/25" },
];

export default function DashboardPage() {
  const [sessions, setSessions] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    sessionApi.list()
      .then(setSessions)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="p-8 max-w-5xl mx-auto fade-in">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Tổng quan 👋</h1>
        <p className="text-gray-400 mt-1">Chào mừng bạn trở lại, Smart Gym AI đang sẵn sàng!</p>
      </div>

      {/* Quick Actions */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold text-gray-300 mb-4">Thao tác nhanh</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {QUICK_ACTIONS.map((a) => (
            <Link key={a.href} href={a.href}>
              <div className={`glass border p-5 rounded-2xl text-center cursor-pointer transition-all hover:scale-105 ${a.color}`}>
                <div className="text-3xl mb-2">{a.icon}</div>
                <div className="text-sm font-medium">{a.label}</div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Stats row */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        {[
          { label: "Buổi tập", value: loading ? "…" : sessions.length.toString(), icon: "🏋️", sub: "tổng cộng" },
          { label: "Điểm trung bình", value: "—", icon: "⭐", sub: "chưa có dữ liệu" },
          { label: "Reps hôm nay", value: "0", icon: "🔄", sub: "bắt đầu tập ngay!" },
        ].map((s) => (
          <div key={s.label} className="glass p-6 rounded-2xl">
            <div className="flex items-center gap-3 mb-3">
              <span className="text-2xl">{s.icon}</span>
              <span className="text-gray-400 text-sm">{s.label}</span>
            </div>
            <div className="text-3xl font-bold text-orange-400">{s.value}</div>
            <div className="text-xs text-gray-500 mt-1">{s.sub}</div>
          </div>
        ))}
      </section>

      {/* Recent sessions */}
      <section>
        <h2 className="text-lg font-semibold text-gray-300 mb-4">Buổi tập gần đây</h2>
        <div className="glass rounded-2xl overflow-hidden">
          {loading ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="skeleton h-12 rounded-xl" />
              ))}
            </div>
          ) : sessions.length === 0 ? (
            <div className="p-12 text-center text-gray-500">
              <div className="text-4xl mb-3">🏃</div>
              <p className="font-medium">Chưa có buổi tập nào</p>
              <p className="text-sm mt-1">
                <Link href="/dashboard/studio" className="text-orange-400 hover:underline">
                  Bắt đầu buổi tập đầu tiên →
                </Link>
              </p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-800/50 border-b border-gray-700">
                <tr>
                  {["Bài tập", "Reps", "Điểm", "Ngày"].map((h) => (
                    <th key={h} className="px-6 py-3 text-left text-gray-400 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {(sessions as Record<string, unknown>[]).map((s) => (
                  <tr key={s.id as string} className="hover:bg-gray-800/30 transition-colors">
                    <td className="px-6 py-4 font-medium">{s.exercise_code as string}</td>
                    <td className="px-6 py-4 text-gray-400">{s.total_reps as number}</td>
                    <td className="px-6 py-4">
                      {s.session_score
                        ? <span className="badge badge-ok">{(s.session_score as number).toFixed(2)}</span>
                        : <span className="text-gray-500">—</span>
                      }
                    </td>
                    <td className="px-6 py-4 text-gray-400">
                      {s.created_at ? new Date(s.created_at as string).toLocaleDateString("vi-VN") : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}
