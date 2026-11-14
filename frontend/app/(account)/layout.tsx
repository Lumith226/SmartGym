import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, CheckCircle2, Dumbbell, ShieldCheck, Sparkles } from 'lucide-react';
import { ThemeToggle } from '../../components/theme-toggle';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-dvh w-full bg-background text-foreground selection:bg-[#6366f1]/30">
      {/* Nút điều hướng nổi phía trên */}
      <header className="absolute left-0 right-0 top-0 z-50 flex items-center justify-between p-4 sm:p-6 pointer-events-none">
        <Link
          href="/"
          className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-border bg-card/80 px-3.5 py-1.5 text-xs font-medium text-foreground backdrop-blur-md shadow-xs transition-all hover:bg-accent hover:border-border hover:shadow-sm"
        >
          <ArrowLeft className="size-3.5" />
          <span>Quay lại trang chủ</span>
        </Link>

        <div className="pointer-events-auto">
          <ThemeToggle withTooltip />
        </div>
      </header>

      {/* Grid Split 50/50: Cột trái Showcase AI Thể thao, Cột phải Form Auth */}
      <div className="grid min-h-dvh w-full grid-cols-1 lg:grid-cols-[1.05fr_1fr]">
        
        {/* CỘT TRÁI: Hero Showcase (Linear Athletic Dark Precision) */}
        <section
          aria-label="Giới thiệu SmartGym AI"
          className="relative hidden flex-col justify-between overflow-hidden border-r border-[#232736] bg-[#090a0e] p-8 sm:p-12 lg:flex lg:pt-24"
        >
          {/* Lưới Ambient Grid & Glows */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_25%,rgba(99,102,241,0.18)_0%,transparent_50%),radial-gradient(circle_at_80%_80%,rgba(16,185,129,0.12)_0%,transparent_45%)]"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 opacity-[0.03] [background-image:linear-gradient(to_right,#fff_1px,transparent_1px),linear-gradient(to_bottom,#fff_1px,transparent_1px)] [background-size:36px_36px]"
          />

          {/* Nội dung Showcase */}
          <div className="relative z-10 mx-auto flex w-full max-w-xl flex-col gap-7">
            {/* Logo & AI Badge */}
            <div className="flex items-center gap-3">
              <span className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-[#6366f1] to-[#4338ca] text-white shadow-[0_0_20px_rgba(99,102,241,0.5)]">
                <Dumbbell className="size-5" />
              </span>
              <span className="text-xl font-bold tracking-tight text-white">SmartGym</span>
              <span className="rounded-md border border-[#6366f1]/30 bg-[#6366f1]/15 px-2 py-0.5 font-mono text-[10px] font-bold text-[#818cf8]">
                AI FITNESS
              </span>
            </div>

            {/* Headline */}
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl leading-tight">
                Luyện tập thông minh hơn với{' '}
                <span className="bg-gradient-to-r from-[#818cf8] via-[#a5b4fc] to-[#34d399] bg-clip-text text-transparent">
                  phân tích AI thời gian thực.
                </span>
              </h1>
              <p className="mt-3 text-sm text-[#94a3b8] leading-relaxed">
                Hệ thống thị giác máy tính nhận diện 33 điểm khớp cơ thể, chấm điểm góc độ và sửa lỗi sai tư thế tức thì ngay trên trình duyệt mà không cần cảm biến ngoài.
              </p>
            </div>

            {/* Card Telemetry: Squat Session Simulation */}
            <div className="rounded-2xl border border-[#232736] bg-[#12151e]/90 p-5 shadow-[0_8px_30px_rgba(0,0,0,0.5)] backdrop-blur-md">
              <div className="mb-4 flex items-center justify-between border-b border-[#232736]/70 pb-3">
                <div className="flex items-center gap-2.5">
                  <span className="relative flex size-2.5">
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex size-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.9)]" />
                  </span>
                  <div>
                    <span className="text-sm font-bold text-white">Squat (Gánh đùi)</span>
                    <span className="ml-2 font-mono text-xs text-[#848d9f]">· Rep 08 / 12</span>
                  </div>
                </div>
                <span className="rounded border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 font-mono text-[11px] font-medium text-emerald-400">
                  12 FPS · Realtime Engine
                </span>
              </div>

              {/* Wireframe Skeleton + Metrics Grid */}
              <div className="flex flex-col sm:flex-row items-center gap-4 rounded-xl border border-white/5 bg-[#0b0d14] p-4">
                {/* SVG Skeleton Wireframe */}
                <div className="relative flex size-28 shrink-0 items-center justify-center rounded-lg bg-[radial-gradient(circle,rgba(99,102,241,0.2)_0%,transparent_70%)]">
                  <svg className="size-full p-2" viewBox="0 0 100 100" fill="none">
                    <circle cx="50" cy="50" r="46" stroke="rgba(99,102,241,0.25)" strokeWidth="0.8" strokeDasharray="2 3" />
                    <circle cx="50" cy="20" r="6" fill="#818cf8" stroke="#ffffff" strokeWidth="1.5" />
                    <line x1="50" y1="26" x2="50" y2="48" stroke="#818cf8" strokeWidth="2.5" strokeLinecap="round" />
                    <line x1="32" y1="32" x2="68" y2="32" stroke="#818cf8" strokeWidth="2" strokeLinecap="round" />
                    <circle cx="50" cy="48" r="3" fill="#6366f1" />
                    <line x1="50" y1="48" x2="35" y2="64" stroke="#34d399" strokeWidth="2.5" strokeLinecap="round" />
                    <circle cx="35" cy="64" r="3" fill="#34d399" stroke="#fff" strokeWidth="1" />
                    <line x1="35" y1="64" x2="34" y2="86" stroke="#34d399" strokeWidth="2.5" strokeLinecap="round" />
                    <circle cx="34" cy="86" r="2.5" fill="#34d399" />
                    <line x1="50" y1="48" x2="65" y2="64" stroke="#34d399" strokeWidth="2.5" strokeLinecap="round" />
                    <circle cx="65" cy="64" r="3" fill="#34d399" stroke="#fff" strokeWidth="1" />
                    <line x1="65" y1="64" x2="66" y2="86" stroke="#34d399" strokeWidth="2.5" strokeLinecap="round" />
                    <circle cx="66" cy="86" r="2.5" fill="#34d399" />
                    <text x="36" y="58" fill="#38bdf8" fontSize="7" fontFamily="'DM Mono', monospace" fontWeight="700">92°</text>
                  </svg>
                </div>

                {/* Metrics */}
                <div className="grid w-full grid-cols-2 gap-2.5">
                  <div className="rounded-lg border border-white/5 bg-white/[0.02] p-2.5">
                    <span className="block font-mono text-[10px] uppercase text-[#64748b]">Góc gập gối</span>
                    <span className="mt-0.5 block font-mono text-sm font-bold text-emerald-400">92° <span className="text-[10px] text-emerald-300 font-normal">(Chuẩn)</span></span>
                  </div>
                  <div className="rounded-lg border border-white/5 bg-white/[0.02] p-2.5">
                    <span className="block font-mono text-[10px] uppercase text-[#64748b]">Nghiêng lưng</span>
                    <span className="mt-0.5 block font-mono text-sm font-bold text-[#818cf8]">14° <span className="text-[10px] text-[#818cf8] font-normal">(Thẳng)</span></span>
                  </div>
                  <div className="col-span-2 rounded-lg border border-white/5 bg-white/[0.02] p-2.5">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[10px] uppercase text-[#64748b]">Điểm kỹ thuật</span>
                      <span className="font-mono text-xs font-bold text-emerald-400">98 / 100</span>
                    </div>
                    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-[#1c202e]">
                      <div className="h-full w-[98%] rounded-full bg-gradient-to-r from-[#6366f1] to-emerald-400" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Status Box */}
              <div className="mt-3.5 flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3.5 py-2 text-xs text-emerald-300">
                <CheckCircle2 className="size-4 shrink-0 text-emerald-400" />
                <span>Kỹ thuật hoàn hảo! Giữ vững trọng tâm và nhịp thở đều.</span>
              </div>
            </div>

            {/* Quote */}
            <div className="border-l-2 border-[#6366f1] pl-4 text-xs italic text-[#94a3b8]">
              &ldquo;SmartGym giúp tôi tự tin tập đúng form ngay tại nhà mà không lo chấn thương cột sống hay khớp gối.&rdquo;
            </div>
          </div>

          {/* Footer Showcase */}
          <div className="relative z-10 flex items-center justify-between border-t border-[#232736]/60 pt-6 text-xs text-[#64748b]">
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-4 text-emerald-400" />
              <span>Bảo mật chuẩn mã hóa TLS &amp; Token</span>
            </div>
            <span>Catalog 500+ bài tập thể hình</span>
          </div>
        </section>

        {/* CỘT PHẢI: Form Canvas (Đăng nhập / Đăng ký) */}
        <section
          aria-label="Biểu mẫu xác thực"
          className="flex min-h-dvh flex-col justify-center px-4 py-20 sm:px-8 lg:px-16 xl:px-20"
        >
          <div className="mx-auto w-full max-w-[420px]">
            {children}
          </div>
        </section>

      </div>
    </div>
  );
}
