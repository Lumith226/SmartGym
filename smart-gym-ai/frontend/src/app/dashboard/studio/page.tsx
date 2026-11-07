"use client";
import { useRef, useState, useEffect, useCallback } from "react";
import { sessionApi, createWorkoutWS, getToken } from "@/lib/api";

type FrameResult = {
  rep_number: number;
  phase: string;
  fault_code: string;
  severity: string;
  dtw_score: number;
  confidence: number;
  snapshot_url: string | null;
  joint_angles: Record<string, number>;
  placeholder?: boolean;
};

const FAULT_LABELS: Record<string, string> = {
  CORRECT: "✅ Đúng kỹ thuật",
  BACK_ROUNDING: "🔴 Gù lưng",
  KNEE_VALGUS: "🟡 Chụm gối",
  SHALLOW_DEPTH: "🟠 Chưa đủ sâu",
  UNKNOWN: "⚪ Không xác định",
};

const SEVERITY_COLORS: Record<string, string> = {
  OK: "badge-ok",
  WARNING: "badge-warning",
  CRITICAL: "badge-critical",
};

export default function StudioPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const frameTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [lastResult, setLastResult] = useState<FrameResult | null>(null);
  const [repCount, setRepCount] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);
  const [statusMsg, setStatusMsg] = useState("Chọn bài tập và bấm Bắt đầu");

  // ── Camera setup ──────────────────────────────────────────
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: "user" },
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch {
      setStatusMsg("⚠️ Không truy cập được camera. Hãy cấp quyền camera.");
    }
  };

  // ── Start session + WebSocket ─────────────────────────────
  const handleStart = async () => {
    await startCamera();
    setStatusMsg("Đang khởi tạo session...");

    try {
      const { id } = await sessionApi.start("SQUAT");
      setSessionId(id);

      const token = getToken() || "";
      const ws = createWorkoutWS(id, token);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsStreaming(true);
        setStatusMsg("🔴 Đang phân tích tư thế...");
        // Send frames every ~100ms
        frameTimerRef.current = setInterval(() => sendFrame(ws), 100);
      };

      ws.onmessage = (e) => {
        try {
          const result: FrameResult = JSON.parse(e.data);
          if (result.fault_code) {
            setLastResult(result);
            if (result.rep_number > repCount) setRepCount(result.rep_number);
          }
        } catch { /* ignore parse errors */ }
      };

      ws.onerror = () => setStatusMsg("⚠️ Lỗi kết nối WebSocket");
      ws.onclose = () => { setIsStreaming(false); setStatusMsg("Session kết thúc"); };
    } catch (err) {
      setStatusMsg(`❌ Lỗi: ${err instanceof Error ? err.message : "unknown"}`);
    }
  };

  const sendFrame = useCallback((ws: WebSocket) => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    canvas.width = 320; canvas.height = 240;
    ctx.drawImage(video, 0, 0, 320, 240);
    const frame_b64 = canvas.toDataURL("image/jpeg", 0.7).split(",")[1];
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ frame_b64 }));
    }
  }, []);

  const handleStop = async () => {
    frameTimerRef.current && clearInterval(frameTimerRef.current);
    wsRef.current?.close();
    if (sessionId) {
      try {
        await sessionApi.end(sessionId);
      } catch { /* ignore */ }
    }
    setIsStreaming(false);
    setStatusMsg("Buổi tập kết thúc ✓");
  };

  useEffect(() => {
    return () => {
      frameTimerRef.current && clearInterval(frameTimerRef.current);
      wsRef.current?.close();
    };
  }, []);

  const severityClass = lastResult ? SEVERITY_COLORS[lastResult.severity] || "badge-blue" : "badge-blue";

  return (
    <div className="p-8 max-w-6xl mx-auto fade-in">
      <h1 className="text-3xl font-bold mb-2">Live Workout Studio 📹</h1>
      <p className="text-gray-400 mb-8">Tập Squat trước camera – AI sẽ phân tích tư thế theo thời gian thực</p>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Camera feed */}
        <div className="lg:col-span-2">
          <div className="glass rounded-2xl overflow-hidden aspect-video bg-gray-900 relative">
            <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
            <canvas ref={canvasRef} className="hidden" />

            {/* Overlay: Phase badge */}
            {lastResult && (
              <div className="absolute top-4 left-4">
                <span className="badge badge-blue text-xs">
                  {lastResult.phase}
                </span>
              </div>
            )}

            {/* Status overlay when not streaming */}
            {!isStreaming && (
              <div className="absolute inset-0 flex items-center justify-center bg-gray-900/60">
                <div className="text-center">
                  <div className="text-5xl mb-4">📹</div>
                  <p className="text-gray-400">{statusMsg}</p>
                </div>
              </div>
            )}
          </div>

          {/* Controls */}
          <div className="mt-4 flex gap-4">
            {!isStreaming ? (
              <button onClick={handleStart} className="btn-primary flex-1">
                🏃 Bắt đầu phân tích
              </button>
            ) : (
              <button
                onClick={handleStop}
                className="btn-secondary flex-1 border-red-500/40 text-red-400 hover:bg-red-500/10"
              >
                ⏹ Kết thúc buổi tập
              </button>
            )}
          </div>
        </div>

        {/* Live stats panel */}
        <div className="space-y-4">
          {/* Live status */}
          <div className="glass p-5 rounded-2xl">
            <div className="flex items-center gap-2 mb-4">
              {isStreaming && <span className="pulse-dot" />}
              <span className="font-semibold text-sm">
                {isStreaming ? "Đang phân tích..." : "Chờ bắt đầu"}
              </span>
            </div>

            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-400 text-sm">Reps</span>
                <span className="text-2xl font-bold text-orange-400">{repCount}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-400 text-sm">Kỹ thuật</span>
                {lastResult ? (
                  <span className={`badge ${severityClass}`}>
                    {FAULT_LABELS[lastResult.fault_code] || lastResult.fault_code}
                  </span>
                ) : <span className="text-gray-600">—</span>}
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400 text-sm">DTW Score</span>
                <span className="font-bold">
                  {lastResult ? (lastResult.dtw_score * 100).toFixed(0) + "%" : "—"}
                </span>
              </div>
            </div>
          </div>

          {/* Joint angles */}
          {lastResult?.joint_angles && (
            <div className="glass p-5 rounded-2xl">
              <h3 className="font-semibold text-sm mb-3 text-gray-300">Góc khớp (°)</h3>
              <div className="space-y-2">
                {Object.entries(lastResult.joint_angles).map(([k, v]) => (
                  <div key={k} className="flex justify-between text-sm">
                    <span className="text-gray-400 capitalize">{k.replace("_", " ")}</span>
                    <span className="font-mono text-orange-400">{v.toFixed(1)}°</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Placeholder notice */}
          <div className="glass p-4 rounded-2xl border-yellow-500/20 bg-yellow-500/5">
            <p className="text-xs text-yellow-400">
              ⚠️ <strong>TV1 placeholder</strong>: WebSocket kết nối thực, nhưng AI pipeline
              (YOLOv8 + ST-GCN++) chưa implement. TV1 sẽ thay thế <code>_placeholder_ai_process()</code>
              trong <code>routers/session.py</code>.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
