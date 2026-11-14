'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  Camera,
  Check,
  ChevronDown,
  Download,
  Dumbbell,
  FileVideo,
  FlipHorizontal2,
  Maximize,
  Minimize,
  Pause,
  PanelRight,
  Play,
  RotateCcw,
  Search,
  Settings2,
  Sparkles,
  Square,
  Upload,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { RagDock } from './rag-dock';
import {
  DEFAULT_V4_EXERCISES,
  POSE_SKELETON_PAIRS,
  type V4ExerciseConfig,
  type V4LabelKind,
} from './pose-studio-contracts';
import { cn } from '../lib/utils';
import { saveTrainingResult, type TrainingResult } from '../lib/training-results';
import { toast } from '../lib/toast';
import {
  clearPoseVideoDraft,
  loadPoseVideoDraft,
  savePoseVideoDraft,
  savePoseVideoPosition,
} from '../lib/pose-video-draft';

type LabelResultRow = {
  key: string;
  probability: number | null;
  threshold?: number | null;
  detected?: boolean;
  supported?: boolean;
  kind?: V4LabelKind;
  status?: string;
};

type InferencePayload = {
  status?: string;
  scope?: string;
  is_multihead?: boolean;
  class_code?: string;
  probabilities?: Record<string, number>;
  label_results?: LabelResultRow[];
  feedback_vi?: string;
  review_notes?: string[];
  quality?: { valid_frame_ratio: number };
};

function formatSeconds(sec: number) {
  if (!Number.isFinite(sec) || sec < 0) return '00:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

interface ExercisePickerItem {
  id: string;
  name: string;
  isPoseSupported: boolean;
  enabled: boolean;
  shortcutIndex?: number;
  slug?: string;
}

export function PoseStudio({
  initialExercise = 'squat',
  initialExercises = DEFAULT_V4_EXERCISES,
  exerciseFromLink = false,
  libraryExercises = [],
}: {
  initialExercise?: V4ExerciseConfig['id'];
  initialExercises?: V4ExerciseConfig[];
  exerciseFromLink?: boolean;
  libraryExercises?: { id: string; name: string; slug: string }[];
}) {
  const [serverUrl, setServerUrl] = React.useState('');
  const [serverInput, setServerInput] = React.useState('');
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [panelOpen, setPanelOpen] = React.useState(false);
  React.useEffect(() => {
    if (window.matchMedia('(min-width: 1024px)').matches) setPanelOpen(true);
  }, []);

  const [exercises, setExercises] = React.useState<V4ExerciseConfig[]>(initialExercises);
  const [selectedId, setSelectedId] = React.useState<V4ExerciseConfig['id']>(initialExercise);
  const [exercisePickerOpen, setExercisePickerOpen] = React.useState(false);
  const [exerciseQuery, setExerciseQuery] = React.useState('');
  const pickerRef = React.useRef<HTMLDivElement | null>(null);
  const [source, setSource] = React.useState<'camera' | 'video'>('camera');
  const [mirrored, setMirrored] = React.useState(true);

  const [connected, setConnected] = React.useState(false);
  const [configured, setConfigured] = React.useState(false);
  const [connectionText, setConnectionText] = React.useState('Chế độ sẵn sàng · Camera & Video');
  const [runtimeText, setRuntimeText] = React.useState('RTMPose + ST-GCN++');

  const [cameras, setCameras] = React.useState<{ id: string; label: string }[]>([]);
  const [selectedCameraId, setSelectedCameraId] = React.useState('');

  const [hasMedia, setHasMedia] = React.useState(false);
  const [mediaBusy, setMediaBusy] = React.useState(false);
  const [running, setRunning] = React.useState(false);
  const [busyWhole, setBusyWhole] = React.useState(false);
  const [videoPaused, setVideoPaused] = React.useState(false);
  const [videoCurrentTime, setVideoCurrentTime] = React.useState(0);
  const [videoDuration, setVideoDuration] = React.useState(0);
  const [videoMuted, setVideoMuted] = React.useState(true);
  const [isFullscreen, setIsFullscreen] = React.useState(false);
  const studioContainerRef = React.useRef<HTMLDivElement | null>(null);
  const [videoFile, setVideoFile] = React.useState<File | null>(null);
  const [resolutionText, setResolutionText] = React.useState('—');
  const [poseStatusText, setPoseStatusText] = React.useState('CHƯA CÓ NGUỒN HÌNH');
  const [noticeText, setNoticeText] = React.useState(
    'Chọn nguồn Camera trực tiếp hoặc Tải tệp video để bắt đầu quan sát chuyển động.',
  );
  const [noticeKind, setNoticeKind] = React.useState<'normal' | 'busy' | 'error'>('normal');

  const [repCount, setRepCount] = React.useState(0);
  const [measuredRepCount, setMeasuredRepCount] = React.useState<number | null>(null);
  const [savingResult, setSavingResult] = React.useState(false);
  const [displayFps, setDisplayFps] = React.useState('—');
  const [analysisFps, setAnalysisFps] = React.useState('—');
  const [roundtripMs, setRoundtripMs] = React.useState('—');

  const [viewScope, setViewScope] = React.useState<'live' | 'whole'>('live');
  const [liveResult, setLiveResult] = React.useState<InferencePayload | null>(null);
  const [wholeResult, setWholeResult] = React.useState<InferencePayload | null>(null);

  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const overlayRef = React.useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  const socketRef = React.useRef<WebSocket | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const objectUrlRef = React.useRef<string | null>(null);
  const videoChoiceRef = React.useRef(0);
  const videoDraftRef = React.useRef<{ id: string; time: number } | null>(null);
  const resumeTimeRef = React.useRef<number | null>(null);
  const poseConfigurationRef = React.useRef({ exerciseId: initialExercise, source: 'camera' as 'camera' | 'video' });
  const generationRef = React.useRef(0);
  const frameIdRef = React.useRef(0);
  const inFlightRef = React.useRef(false);
  const pendingRef = React.useRef<{ frameId: number; captureAt: number } | null>(null);
  const lastSentAtRef = React.useRef(-Infinity);
  const lastSentMediaRef = React.useRef(-1);
  const displayTimesRef = React.useRef<number[]>([]);
  const analysisTimesRef = React.useRef<number[]>([]);
  const pointsRef = React.useRef<number[][]>([]);
  const poseReceivedAtRef = React.useRef(0);
  const runningRef = React.useRef(false);
  const analysisAttemptRef = React.useRef(0);
  const configuredRef = React.useRef(false);
  const hasMediaRef = React.useRef(false);
  const reconnectTimerRef = React.useRef<any>(null);
  const countdownTimerRef = React.useRef<any>(null);
  const hasErrorRef = React.useRef(false);
  const handleToggleAnalysisRef = React.useRef<() => void>(() => {});

  const [countdown, setCountdown] = React.useState<number | null>(null);
  const [dockMinimized, setDockMinimized] = React.useState(true);

  const activeExercise = React.useMemo(
    () => exercises.find(e => e.id === selectedId) ?? exercises[0],
    [exercises, selectedId],
  );

  const filteredExercises = React.useMemo<ExercisePickerItem[]>(() => {
    const q = exerciseQuery.trim().toLowerCase();
    if (!q) {
      return exercises.map((item, idx) => ({
        id: item.id,
        name: item.name,
        isPoseSupported: true,
        enabled: item.enabled !== false,
        shortcutIndex: idx + 1,
      }));
    }

    // 1. Lọc các bài tập trong danh sách Pose
    const poseMatches: ExercisePickerItem[] = exercises
      .filter(
        e =>
          e.name.toLowerCase().includes(q) ||
          e.id.toLowerCase().includes(q) ||
          e.labels.some(l => l.name_vi.toLowerCase().includes(q)),
      )
      .map((item, idx) => ({
        id: item.id,
        name: item.name,
        isPoseSupported: true,
        enabled: item.enabled !== false,
        shortcutIndex: idx + 1,
      }));

    // 2. Lọc các bài tập trong Thư viện chung mà chưa hỗ trợ Pose
    const existingIds = new Set(exercises.map(e => e.id));
    const libraryMatches: ExercisePickerItem[] = libraryExercises
      .filter(
        lib =>
          !existingIds.has(lib.id) &&
          lib.name.toLowerCase().includes(q),
      )
      .map(lib => ({
        id: lib.id,
        name: lib.name,
        isPoseSupported: false,
        enabled: false,
        slug: lib.slug,
      }));

    return [...poseMatches, ...libraryMatches];
  }, [exerciseQuery, exercises, libraryExercises]);

  React.useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setExercisePickerOpen(false);
      }
    }
    if (exercisePickerOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [exercisePickerOpen]);

  const activeResult = viewScope === 'whole' ? wholeResult : liveResult;

  const setNotice = React.useCallback(
    (msg: string, kind: 'normal' | 'busy' | 'error' = 'normal') => {
      setNoticeText(msg);
      setNoticeKind(kind);
    },
    [],
  );

  const clearObservations = React.useCallback((clearWhole = false) => {
    setLiveResult(null);
    pointsRef.current = [];
    poseReceivedAtRef.current = 0;
    analysisTimesRef.current = [];
    setRepCount(0);
    setMeasuredRepCount(null);
    setAnalysisFps('—');
    setRoundtripMs('—');
    if (clearWhole) {
      setWholeResult(null);
      setViewScope('live');
    }
  }, []);

  const sendConfigure = React.useCallback(
    (nextExerciseId: string, nextSource: 'camera' | 'video', clearWhole = false) => {
      poseConfigurationRef.current = { exerciseId: nextExerciseId, source: nextSource };
      const draft = videoDraftRef.current;
      if (draft && nextSource === 'video') savePoseVideoPosition({ ...draft, exerciseId: nextExerciseId });
      generationRef.current += 1;
      configuredRef.current = false;
      setConfigured(false);
      inFlightRef.current = false;
      pendingRef.current = null;
      lastSentMediaRef.current = -1;
      lastSentAtRef.current = -Infinity;
      clearObservations(clearWhole);
      const ws = socketRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            type: 'configure',
            exercise: nextExerciseId,
            source: nextSource,
            generation: generationRef.current,
          }),
        );
      }
    },
    [clearObservations],
  );

  const pauseAnalysis = React.useCallback(() => {
    analysisAttemptRef.current += 1;
    runningRef.current = false;
    setRunning(false);
    const video = videoRef.current;
    if (video && !video.srcObject) {
      video.pause();
      setVideoPaused(true);
    }
  }, []);

  const stopMedia = React.useCallback(() => {
    pauseAnalysis();
    pointsRef.current = [];
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    const v = videoRef.current;
    if (v) {
      v.pause();
      v.srcObject = null;
      v.removeAttribute('src');
      v.load();
    }
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    hasMediaRef.current = false;
    setHasMedia(false);
    displayTimesRef.current = [];
    setResolutionText('—');
    setDisplayFps('—');
    setPoseStatusText('CHƯA CÓ NGUỒN HÌNH');
  }, [pauseAnalysis]);

  const showVideo = React.useCallback((file: File, id: string, time: number, exerciseId: string) => {
    videoDraftRef.current = null;
    stopMedia();
    const video = videoRef.current;
    if (!video) return;

    videoDraftRef.current = { id, time };
    resumeTimeRef.current = time;
    setSource('video');
    setMirrored(false);
    setVideoFile(file);
    setSelectedId(exerciseId);
    setVideoPaused(true);
    setVideoCurrentTime(time);
    objectUrlRef.current = URL.createObjectURL(file);
    video.src = objectUrlRef.current;
    video.controls = false;
    sendConfigure(exerciseId, 'video', true);
    setNotice(
      `Đã nạp tệp "${file.name}". Bấm "Bắt đầu phân tích" để theo dõi theo thời gian thực hoặc "Phân tích toàn video".`,
    );
  }, [sendConfigure, setNotice, stopMedia]);

  const checkpointVideo = React.useCallback((video?: HTMLVideoElement | null) => {
    const draft = videoDraftRef.current;
    if (!draft || resumeTimeRef.current !== null) return;
    if (video && video.readyState > 0) draft.time = video.currentTime;
    savePoseVideoPosition({ ...draft, exerciseId: poseConfigurationRef.current.exerciseId });
  }, []);

  const listCameraDevices = React.useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      const videoInputs = all
        .filter(d => d.kind === 'videoinput')
        .map((d, idx) => ({ id: d.deviceId, label: d.label || `Camera ${idx + 1}` }));
      setCameras(videoInputs);
    } catch {}
  }, []);

  const connectServer = React.useCallback(
    async (targetUrl: string) => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
      configuredRef.current = false;
      setConfigured(false);
      inFlightRef.current = false;
      pendingRef.current = null;
      setConnectionText('Đang kiểm tra kết nối AI...');

      try {
        const base = new URL(targetUrl, window.location.origin);
        const sameOrigin = base.origin === window.location.origin;
        const api = sameOrigin ? '/api/pose-studio' : base.origin + '/api';
        const healthRes = await fetch(`${api}/health`, {
          signal: AbortSignal.timeout(3500),
        });
        if (healthRes.status === 401 && sameOrigin) {
          setConnected(false);
          setConnectionText('Đăng nhập để kết nối AI');
          setNotice('Hãy đăng nhập để phân tích bằng Camera hoặc Video.', 'error');
          return;
        }
        if (!healthRes.ok) throw new Error(`Mã phản hồi ${healthRes.status}`);
        const health = await healthRes.json();
        if (!health.ready) throw new Error(health.error || 'Server đang khởi tạo mô hình.');

        const exRes = await fetch(`${api}/exercises`, {
          signal: AbortSignal.timeout(3500),
        });
        if (exRes.ok) {
          const exData = await exRes.json();
          if (Array.isArray(exData?.exercises) && exData.exercises.length) {
            setExercises(prev =>
              prev.map(def => {
                const remote = exData.exercises.find((r: { id: string }) => r.id === def.id);
                return remote
                  ? {
                      ...def,
                      name: remote.name || def.name,
                      version: remote.version || def.version,
                      label_count: remote.label_count || def.label_count,
                      labels: Array.isArray(remote.labels) && remote.labels.length ? remote.labels : def.labels,
                    }
                  : def;
              }),
            );
          }
        }

        const wsUrl = new URL(sameOrigin ? '/api/pose-studio/live' : '/ws/live', base.origin);
        wsUrl.protocol = base.protocol === 'https:' ? 'wss:' : 'ws:';
        const ws = new WebSocket(wsUrl);
        socketRef.current = ws;

        ws.onopen = () => {
          if (reconnectTimerRef.current) {
            clearTimeout(reconnectTimerRef.current);
            reconnectTimerRef.current = null;
          }
          if (socketRef.current !== ws) return;
          const gpuLabel =
            health.runtime?.device === 'dml'
              ? 'GPU · DirectML (AMD)'
              : health.runtime?.device === 'cuda'
                ? 'GPU · CUDA'
                : 'CPU';
          setConnected(true);
          setConnectionText('Server AI đã sẵn sàng');
          setRuntimeText(`${gpuLabel} · RTMPose + ST-GCN++ · ${base.host}`);
          const configuration = poseConfigurationRef.current;
          sendConfigure(configuration.exerciseId, configuration.source, true);
          setNotice('Đã kết nối Server AI. Mở camera hoặc chọn tệp video rồi bấm Bắt đầu phân tích.');
        };

        ws.onmessage = ({ data }) => {
          if (socketRef.current !== ws) return;
          let message: Record<string, any>;
          try {
            message = JSON.parse(data);
          } catch {
            return;
          }
          if (message.type === 'ready' && message.generation === generationRef.current) {
            configuredRef.current = true;
            setConfigured(true);
            inFlightRef.current = false;
            pendingRef.current = null;
          } else if (message.type === 'result' && message.generation === generationRef.current) {
            const pending = pendingRef.current;
            inFlightRef.current = false;
            pendingRef.current = null;
            if (!pending || pending.frameId !== message.frame_id || !runningRef.current) return;
            const now = performance.now();
            pointsRef.current = message.keypoints || [];
            poseReceivedAtRef.current = now;
            setLiveResult(message.result || null);
            analysisTimesRef.current.push(now);
            analysisTimesRef.current = analysisTimesRef.current.filter(t => now - t < 2000);
            setRoundtripMs(`${Math.round(now - pending.captureAt)} ms`);
            setRepCount(Number(message.rep_count) || 0);
            setMeasuredRepCount(Number.isInteger(message.rep_count) && message.rep_count >= 0 ? message.rep_count : null);
            setPoseStatusText(
              message.found
                ? ({ READY: 'SẴN SÀNG', IN_REP: 'ĐANG TRONG LƯỢT' } as Record<string, string>)[
                    message.state
                  ] || message.state
                : 'CHƯA THẤY KHỚP ĐỦ RÕ',
            );
          } else if (message.type === 'error') {
            inFlightRef.current = false;
            pendingRef.current = null;
            if (runningRef.current) pauseAnalysis();
            setNotice(message.message || 'Lỗi từ Server AI.', 'error');
          }
        };

        ws.onclose = () => {
          if (socketRef.current !== ws) return;
          setConnected(false);
          configuredRef.current = false;
          setConfigured(false);
          if (runningRef.current) pauseAnalysis();
          setConnectionText('Đang chờ kết nối AI');
          if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
          reconnectTimerRef.current = setTimeout(() => {
            void connectServer(targetUrl);
          }, 3000);
        };
      } catch {
        setConnected(false);
        setConnectionText('Đang chờ kết nối AI');
        setRuntimeText(`RTMPose + ST-GCN++ · ${targetUrl.replace(/^https?:\/\//, '')}`);
        if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = setTimeout(() => {
          void connectServer(targetUrl);
        }, 3000);
      }
    },
    [pauseAnalysis, sendConfigure, setNotice],
  );

  React.useEffect(() => {
    const webOrigin = window.location.origin;
    let origin = webOrigin;
    try {
      const saved = window.localStorage.getItem('smartgym.server');
      if (saved && !/^https?:\/\/(?:127\.0\.0\.1|localhost):8001\/?$/.test(saved)) origin = saved;
    } catch {}
    setServerUrl(origin);
    setServerInput(origin);
    void connectServer(origin);
    void listCameraDevices();
    return () => {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      socketRef.current?.close();
      stopMedia();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    const choice = videoChoiceRef.current;
    let mounted = true;
    void loadPoseVideoDraft().then(draft => {
      if (!draft || !mounted || videoDraftRef.current || choice !== videoChoiceRef.current) return;
      const retainedExercise = initialExercises.find(exercise => exercise.id === draft.exerciseId);
      const exerciseId = exerciseFromLink ? initialExercise : retainedExercise?.id ?? initialExercise;
      showVideo(draft.file, draft.id, draft.time, exerciseId);
    }).catch(() => {
      if (mounted && choice === videoChoiceRef.current) {
        setNotice('Chưa khôi phục được video. Bạn có thể chọn lại tệp.', 'error');
      }
    });
    const checkpoint = () => checkpointVideo(videoRef.current);
    window.addEventListener('pagehide', checkpoint);
    return () => {
      mounted = false;
      checkpoint();
      window.removeEventListener('pagehide', checkpoint);
    };
  }, [checkpointVideo, exerciseFromLink, initialExercise, initialExercises, setNotice, showVideo]);

  const handleToggleFullscreen = () => {
    if (!document.fullscreenElement) {
      void studioContainerRef.current?.requestFullscreen?.();
      setIsFullscreen(true);
    } else {
      void document.exitFullscreen?.();
      setIsFullscreen(false);
    }
  };

  React.useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  // Keyboard shortcuts 1–4 for selecting the 4 V4 exercises
  React.useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName ?? '';
      if (/input|select|textarea/i.test(tag) || busyWhole) return;
      if (e.code === 'Space') {
        if ((e.target as HTMLElement | null)?.closest('button, a, [contenteditable]')) return;
        e.preventDefault();
        if (!e.repeat) handleToggleAnalysisRef.current();
        return;
      }
      const idx = Number(e.key) - 1;
      if (idx >= 0 && idx < exercises.length) {
        const next = exercises[idx];
        if (next.enabled !== false) {
          setSelectedId(next.id);
          sendConfigure(next.id, source, true);
        } else {
          setNotice(`Bài tập ${next.name} hiện đang tắt trong phòng tập.`, 'error');
        }
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [busyWhole, exercises, sendConfigure, source]);

  // Animation loop for skeleton overlay + FPS counters + sending frames
  React.useEffect(() => {
    const captureCanvas = document.createElement('canvas');
    const captureCtx = captureCanvas.getContext('2d');
    let rafId = 0;
    let lastMetricUpdate = 0;
    let lastMediaTime = -1;

    function rate(times: number[], now: number) {
      const recent = times.filter(t => now - t < 2000);
      return recent.length > 1
        ? ((recent.length - 1) * 1000) / Math.max(1, recent[recent.length - 1] - recent[0])
        : 0;
    }

    function maybeSendFrame(now: number, mediaTime: number) {
      const v = videoRef.current;
      const ws = socketRef.current;
      if (
        !v ||
        !runningRef.current ||
        !configuredRef.current ||
        inFlightRef.current ||
        !hasMediaRef.current ||
        v.paused ||
        v.ended ||
        v.readyState < 2
      ) {
        return;
      }
      if (!ws || ws.readyState !== WebSocket.OPEN || ws.bufferedAmount > 256 * 1024) return;
      if (now - lastSentAtRef.current < 40 || mediaTime <= lastSentMediaRef.current) return;

      const gen = generationRef.current;
      inFlightRef.current = true;
      lastSentAtRef.current = now;
      lastSentMediaRef.current = mediaTime;

      const scale = Math.min(1, 640 / Math.max(1, v.videoWidth, v.videoHeight));
      captureCanvas.width = Math.max(1, Math.round(v.videoWidth * scale));
      captureCanvas.height = Math.max(1, Math.round(v.videoHeight * scale));
      captureCtx?.drawImage(v, 0, 0, captureCanvas.width, captureCanvas.height);
      const frameId = ++frameIdRef.current;
      pendingRef.current = { frameId, captureAt: now };

      captureCanvas.toBlob(
        async blob => {
          if (gen !== generationRef.current || ws !== socketRef.current) return;
          if (!blob || !runningRef.current || ws.readyState !== WebSocket.OPEN) {
            inFlightRef.current = false;
            pendingRef.current = null;
            return;
          }
          try {
            const imgBuf = await blob.arrayBuffer();
            if (gen !== generationRef.current || ws !== socketRef.current) return;
            if (!runningRef.current) {
              inFlightRef.current = false;
              pendingRef.current = null;
              return;
            }
            const metaBytes = new TextEncoder().encode(
              JSON.stringify({ frame_id: frameId, timestamp: mediaTime, generation: gen }),
            );
            const header = new ArrayBuffer(4);
            new DataView(header).setUint32(0, metaBytes.length, true);
            ws.send(new Blob([header, metaBytes, imgBuf]));
          } catch {
            inFlightRef.current = false;
            pendingRef.current = null;
          }
        },
        'image/jpeg',
        0.82,
      );
    }

    function tick(now: number) {
      const v = videoRef.current;
      const overlay = overlayRef.current;
      if (v && hasMediaRef.current && !v.paused && !v.ended && v.readyState >= 2) {
        if (v.currentTime !== lastMediaTime || source === 'camera') {
          lastMediaTime = v.currentTime;
          displayTimesRef.current.push(now);
          displayTimesRef.current = displayTimesRef.current.filter(t => now - t < 1500);
          maybeSendFrame(now, source === 'camera' ? now / 1000 : v.currentTime);
        }
      }

      if (overlay && v) {
        const dpr = window.devicePixelRatio || 1;
        const w = Math.round(overlay.clientWidth * dpr);
        const h = Math.round(overlay.clientHeight * dpr);
        if (overlay.width !== w || overlay.height !== h) {
          overlay.width = w;
          overlay.height = h;
        }
        const ctx = overlay.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, w, h);
          const pts = pointsRef.current;
          const showCurrentPose = runningRef.current && now - poseReceivedAtRef.current < 500;
          const showPausedPose = !runningRef.current && source === 'video' && v.paused;
          if (pts.length && v.videoWidth && (showCurrentPose || showPausedPose)) {
            const scale = Math.min(w / v.videoWidth, h / v.videoHeight);
            const drawW = v.videoWidth * scale;
            const drawH = v.videoHeight * scale;
            const offX = (w - drawW) / 2;
            const offY = (h - drawH) / 2;
            const pt = (i: number): [number, number] => [
              offX + pts[i][0] * drawW,
              offY + pts[i][1] * drawH,
            ];
            const hasErr = hasErrorRef.current;
            ctx.lineWidth = (hasErr ? 3.2 : 2.4) * dpr;
            ctx.strokeStyle = hasErr ? '#ef4444' : '#6366f1';
            ctx.fillStyle = hasErr ? '#ef4444' : '#818cf8';
            for (const [a, b] of POSE_SKELETON_PAIRS) {
              if (!pts[a] || !pts[b] || Math.min(pts[a][2], pts[b][2]) < 0.25) continue;
              const [x1, y1] = pt(a);
              const [x2, y2] = pt(b);
              ctx.beginPath();
              ctx.moveTo(x1, y1);
              ctx.lineTo(x2, y2);
              ctx.stroke();
            }
            for (let i = 0; i < pts.length; i++) {
              if (!pts[i] || pts[i][2] < 0.25) continue;
              const [x, y] = pt(i);
              ctx.beginPath();
              ctx.arc(x, y, (hasErr ? 4.0 : 3.2) * dpr, 0, Math.PI * 2);
              ctx.fill();
            }
          }
        }
      }

      if (now - lastMetricUpdate > 500) {
        if (v && hasMediaRef.current && !v.paused && !v.ended) {
          const dfps = rate(displayTimesRef.current, now);
          setDisplayFps(dfps > 0 ? dfps.toFixed(1) : '—');
        }
        if (runningRef.current) {
          const afps = rate(analysisTimesRef.current, now);
          setAnalysisFps(afps > 0 ? afps.toFixed(1) : '—');
        }
        lastMetricUpdate = now;
      }

      rafId = requestAnimationFrame(tick);
    }

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [source]);

  async function handleOpenCamera(customDeviceId?: string) {
    if (busyWhole || mediaBusy) return;
    const choice = ++videoChoiceRef.current;
    if (!navigator.mediaDevices?.getUserMedia) {
      setNotice('Trình duyệt chưa cấp quyền truy cập Camera.', 'error');
      return;
    }
    setSource('camera');
    setMirrored(true);
    checkpointVideo(videoRef.current);
    videoDraftRef.current = null;
    resumeTimeRef.current = null;
    setVideoFile(null);
    stopMedia();
    sendConfigure(selectedId, 'camera', true);
    setMediaBusy(true);
    setNotice('Đang mở camera trực tiếp...', 'busy');
    try {
      const targetDevice = customDeviceId ?? selectedCameraId;
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 30, max: 30 },
          ...(targetDevice ? { deviceId: { exact: targetDevice } } : { facingMode: 'user' }),
        },
        audio: false,
      });
      const v = videoRef.current;
      if (!v || choice !== videoChoiceRef.current) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }
      streamRef.current = stream;
      v.srcObject = stream;
      v.controls = false;
      await v.play();
      if (choice !== videoChoiceRef.current) return;
      hasMediaRef.current = true;
      setHasMedia(true);
      setResolutionText(`${v.videoWidth || 640} × ${v.videoHeight || 480}`);
      setPoseStatusText('CAMERA TRỰC TIẾP SẴN SÀNG');
      await listCameraDevices();
      setNotice('Camera đã sẵn sàng. Bấm "Bắt đầu phân tích" để đếm nhịp và kiểm tra kỹ thuật.');
    } catch {
      if (choice !== videoChoiceRef.current) return;
      stopMedia();
      setNotice(
        'Không mở được camera. Hãy kiểm tra quyền truy cập camera trên trình duyệt hoặc chuyển sang Tải tệp video.',
        'error',
      );
    } finally {
      setMediaBusy(false);
    }
  }

  function handleSelectVideoFile(file: File | undefined) {
    if (!file || busyWhole) return;
    const choice = ++videoChoiceRef.current;
    const id = window.crypto.randomUUID();
    void savePoseVideoDraft(file, { id, time: 0, exerciseId: selectedId }).catch(() => {
      if (videoRef.current && choice === videoChoiceRef.current) {
        setNotice('Video dùng được trên trang này. Trình duyệt chưa lưu được tệp để mở lại.', 'error');
      }
    });
    showVideo(file, id, 0, selectedId);
  }

  function handleCloseSource() {
    videoChoiceRef.current += 1;
    videoDraftRef.current = null;
    resumeTimeRef.current = null;
    setVideoFile(null);
    if (source === 'video') void clearPoseVideoDraft();
    stopMedia();
  }

  async function handleVideoMode() {
    if (busyWhole || mediaBusy) return;
    if (source === 'video') {
      fileInputRef.current?.click();
      return;
    }
    const choice = ++videoChoiceRef.current;
    const draft = await loadPoseVideoDraft().catch(() => null);
    if (!videoRef.current || choice !== videoChoiceRef.current) return;
    if (draft) {
      showVideo(draft.file, draft.id, draft.time, selectedId);
    } else {
      fileInputRef.current?.click();
    }
  }

  const startRunningInternal = React.useCallback(async () => {
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    setCountdown(null);

    const v = videoRef.current;
    if (!v || !hasMedia || runningRef.current) return;
    const attempt = ++analysisAttemptRef.current;
    runningRef.current = true;
    setRunning(true);

    const resumeVideo = source === 'video' && configuredRef.current && !v.ended &&
      v.currentTime >= lastSentMediaRef.current;
    if (source === 'video') {
      if (!resumeVideo) configuredRef.current = false;
      if (v.ended) v.currentTime = 0;
      try {
        await v.play();
      } catch {
        if (attempt === analysisAttemptRef.current) {
          pauseAnalysis();
          setNotice('Hãy bấm phát video trước khi bắt đầu phân tích.', 'error');
        }
        return;
      }
    }
    if (attempt !== analysisAttemptRef.current) return;

    setViewScope('live');
    if (!connected) {
      void connectServer(serverUrl);
    } else if (!resumeVideo) {
      sendConfigure(selectedId, source, false);
    }
    setDockMinimized(true);
    setPoseStatusText('ĐANG QUAN SÁT CHUYỂN ĐỘNG');
    setNotice(
      connected
        ? 'Đang gửi khung hình thời gian thực tới engine Pose...'
        : 'Đang kết nối lại Server AI... Bấm lại Bắt đầu sau giây lát.',
    );
  }, [connected, connectServer, hasMedia, pauseAnalysis, selectedId, sendConfigure, serverUrl, setNotice, source]);

  const handleToggleAnalysis = React.useCallback(() => {
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
      setCountdown(null);
      setNotice('Đã hủy đếm ngược.');
      return;
    }

    if (runningRef.current) {
      pauseAnalysis();
      setNotice('Đã tạm dừng phân tích. Kết quả hiển thị là lần quan sát gần nhất.');
      return;
    }

    const v = videoRef.current;
    if (!v || !hasMedia) return;

    // Camera trực tiếp: Bắt đầu đếm ngược 3s để người dùng lùi xa vào khung hình
    if (source === 'camera') {
      let count = 3;
      setCountdown(count);
      setNotice('Chuẩn bị vào vị trí (cách 2–3m): 3 giây...', 'busy');

      countdownTimerRef.current = setInterval(() => {
        count -= 1;
        if (count > 0) {
          setCountdown(count);
          setNotice(`Chuẩn bị vào vị trí (cách 2–3m): ${count} giây...`, 'busy');
        } else {
          clearInterval(countdownTimerRef.current);
          countdownTimerRef.current = null;
          void startRunningInternal();
        }
      }, 1000);
    } else {
      void startRunningInternal();
    }
  }, [hasMedia, pauseAnalysis, setNotice, source, startRunningInternal]);

  React.useEffect(() => {
    handleToggleAnalysisRef.current = handleToggleAnalysis;
  }, [handleToggleAnalysis]);

  async function handleAnalyzeWholeVideo() {
    if (!videoFile || busyWhole) return;
    pauseAnalysis();
    setBusyWhole(true);
    setNotice('Đang gửi toàn bộ tệp video tới Server AI để phân tích chuỗi khớp V4...', 'busy');
    try {
      const formData = new FormData();
      formData.append('exercise', selectedId);
      formData.append('file', videoFile);
      const sameOrigin = !serverUrl || serverUrl === window.location.origin;
      const res = await fetch(sameOrigin ? '/api/pose-studio/analyze-video' : `${serverUrl}/api/analyze-video`, {
        method: 'POST',
        headers: sameOrigin ? { 'X-SmartGym-CSRF': '1' } : undefined,
        body: formData,
        signal: AbortSignal.timeout(180000),
      });
      const payload = await res.json();
      if (!res.ok) {
        throw new Error(typeof payload?.detail === 'string' ? payload.detail : 'Không phân tích được video.');
      }
      setWholeResult(payload.result);
      setViewScope('whole');
      setNotice(`Đã phân tích toàn bộ video trong ${payload.elapsed_seconds}s.`);
    } catch (err: any) {
      setNotice(
        `Chưa thể phân tích toàn video: ${err?.message || 'Kiểm tra kết nối Server AI.'}`,
        'error',
      );
    } finally {
      setBusyWhole(false);
    }
  }

  function handleSaveSnapshot() {
    const v = videoRef.current;
    if (!v || !hasMedia || !v.videoWidth) return;
    const c = document.createElement('canvas');
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    if (mirrored) {
      ctx.translate(c.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(v, 0, 0);
    c.toBlob(blob => {
      if (!blob) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `smartgym_${selectedId}_${Date.now()}.png`;
      a.click();
    });
  }

  function handleExportJson() {
    if (!activeResult) return;
    const blob = new Blob(
      [
        JSON.stringify(
          {
            exercise: selectedId,
            source,
            scope: viewScope,
            result: activeResult,
          },
          null,
          2,
        ),
      ],
      { type: 'application/json' },
    );
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `smartgym_${selectedId}_${viewScope}_${Date.now()}.json`;
    a.click();
  }

  async function handleSaveResult() {
    if (!activeResult || savingResult) return;
    const entry: TrainingResult = {
      id: crypto.randomUUID(),
      exerciseId: selectedId,
      exerciseName: activeExercise.name,
      source,
      scope: viewScope,
      savedAt: new Date().toISOString(),
      repCount: viewScope === 'live' ? measuredRepCount : null,
      feedback: activeResult.feedback_vi ?? null,
      result: activeResult,
    };
    setSavingResult(true);
    try {
      const response = await fetch('/api/v1/me', { cache: 'no-store' });
      if (response.status === 401) {
        toast.info('Đăng nhập để lưu kết quả tập');
        return;
      }
      if (!response.ok) throw new Error('Profile unavailable');
      const profile = await response.json();
      if (typeof profile.id !== 'string' || !profile.id) throw new Error('Invalid profile');
      saveTrainingResult(profile.id, entry);
      toast.success('Đã lưu vào Kết quả tập');
    } catch {
      toast.error('Chưa lưu được kết quả tập. Hãy thử lại.');
    } finally {
      setSavingResult(false);
    }
  }


  // Tóm tắt kết quả quan sát
  const lookup = React.useMemo(() => {
    const map = new Map<string, LabelResultRow>();
    for (const row of activeResult?.label_results ?? []) {
      map.set(row.key, row);
    }
    return map;
  }, [activeResult]);

  const detected = activeExercise.labels.filter(l => lookup.get(l.key)?.detected);
  const detectedErrors = detected.filter(l => (lookup.get(l.key)?.kind || l.kind) === 'error');
  const detectedAttributes = detected.length - detectedErrors.length;
  hasErrorRef.current = detectedErrors.length > 0;

  const ragContext = activeResult
    ? `Bài tập: ${activeExercise.name}. Số lượt: ${repCount}. ` +
      (detectedErrors.length
        ? `Lỗi quan sát được: ${detectedErrors.map(l => l.name_vi).join(', ')}.`
        : 'Chưa ghi nhận lỗi vượt ngưỡng.')
    : undefined;

  const workoutState = React.useMemo(() => {
    if (!running) {
      return {
        label: roundtripMs === '—' ? 'Sẵn sàng' : 'Đã tạm dừng',
        dot: 'bg-muted-foreground',
        badge: 'border border-border/80 bg-muted/80 text-foreground',
      };
    }
    if (detectedErrors.length > 0) {
      return {
        label: `Cần chỉnh form (${detectedErrors.length})`,
        dot: 'bg-white',
        badge: 'bg-rose-500 text-white animate-pulse shadow-[0_0_12px_rgba(244,63,94,0.5)]',
      };
    }
    if (poseStatusText === 'CHƯA THẤY KHỚP ĐỦ RÕ') {
      return {
        label: 'Chưa thấy đủ khớp',
        dot: 'bg-amber-400',
        badge: 'bg-amber-500/20 text-amber-500 border border-amber-500/30',
      };
    }
    if (poseStatusText === 'ĐANG TRONG LƯỢT') {
      return {
        label: 'Đang đếm nhịp',
        dot: 'bg-white',
        badge: 'bg-[#6366f1] text-white font-bold shadow-[0_0_12px_rgba(99,102,241,0.4)]',
      };
    }
    return {
      label: 'Đang tập',
      dot: 'bg-white',
      badge: 'bg-emerald-500 text-white font-bold shadow-[0_0_12px_rgba(16,185,129,0.4)]',
    };
  }, [detectedErrors.length, poseStatusText, roundtripMs, running]);

  const glass =
    'border border-border/80 bg-card/90 text-foreground backdrop-blur-xl shadow-lg shadow-black/5 dark:shadow-black/25';

  return (
    <div
      ref={studioContainerRef}
      className="fixed inset-x-0 bottom-0 top-[52px] z-30 overflow-hidden bg-background text-foreground md:left-[62px] md:top-0"
    >
      {/* ===== NỀN: VIDEO TOÀN MÀN HÌNH + KHUNG XƯƠNG PHÂN TÍCH TRỰC TIẾP ===== */}
      <video
        ref={videoRef}
        muted={videoMuted}
        playsInline
        preload="auto"
        onLoadedMetadata={({ currentTarget: video }) => {
          const time = resumeTimeRef.current;
          if (time === null) return;
          resumeTimeRef.current = null;
          const duration = Number.isFinite(video.duration) ? video.duration : time;
          if (time > 0) video.currentTime = Math.min(time, duration);
        }}
        onLoadedData={e => {
          const v = e.currentTarget;
          if (v.videoWidth) {
            hasMediaRef.current = true;
            setHasMedia(true);
            setResolutionText(`${v.videoWidth} × ${v.videoHeight}`);
            setPoseStatusText('SẴN SÀNG PHÂN TÍCH');
            setVideoDuration(v.duration || 0);
          }
        }}
        onTimeUpdate={({ currentTarget: video }) => {
          setVideoCurrentTime(video.currentTime);
          if (videoDraftRef.current && resumeTimeRef.current === null && video.readyState > 0) {
            videoDraftRef.current.time = video.currentTime;
          }
        }}
        onSeeked={({ currentTarget: video }) => checkpointVideo(video)}
        onDurationChange={e => setVideoDuration(e.currentTarget.duration)}
        onVolumeChange={e => setVideoMuted(e.currentTarget.muted)}
        onPlay={event => {
          if (event.currentTarget.paused) return;
          setVideoPaused(false);
          if (!runningRef.current) pointsRef.current = [];
        }}
        onSeeking={() => { pointsRef.current = []; }}
        onPause={event => {
          if (!event.currentTarget.paused) return;
          checkpointVideo(event.currentTarget);
          setVideoPaused(true);
          if (!event.currentTarget.srcObject && runningRef.current) pauseAnalysis();
        }}
        onEnded={() => {
          pauseAnalysis();
          setPoseStatusText('HẾT VIDEO');
        }}
        className={cn('absolute inset-0 h-full w-full object-contain', mirrored && 'scale-x-[-1]')}
      />
      <canvas
        ref={overlayRef}
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute inset-0 h-full w-full',
          mirrored && 'scale-x-[-1]',
        )}
      />

      <input
        ref={fileInputRef}
        type="file"
        accept="video/mp4,video/webm,video/quicktime,video/*"
        className="hidden"
        onChange={e => {
          handleSelectVideoFile(e.currentTarget.files?.[0]);
          e.currentTarget.value = '';
        }}
      />

      {/* ===== MÀN HÌNH CHỜ: Nút tối giản ở giữa, bấm để mở nguồn đang chọn ===== */}
      {!hasMedia && (
        <button
          type="button"
          disabled={mediaBusy}
          onClick={() =>
            source === 'camera' ? void handleOpenCamera() : fileInputRef.current?.click()
          }
          aria-label={source === 'camera' ? 'Mở camera' : 'Chọn video'}
          className="absolute left-1/2 top-[45%] flex h-20 w-20 -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary shadow-xl shadow-primary/10 backdrop-blur-xl transition-all duration-300 hover:scale-105 hover:border-primary/40 hover:bg-primary/20 active:scale-95"
        >
          {source === 'camera' ? <Camera size={32} strokeWidth={1.75} /> : <Upload size={32} strokeWidth={1.75} />}
        </button>
      )}

      {/* ===== THANH TRÊN: CHỌN BÀI TẬP + NGUỒN + KẾT NỐI ===== */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-col gap-2 p-3 sm:p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          {/* ===== BỘ CHỌN BÀI TẬP DẠNG DROPDOWN TỰ ĐỘNG MỞ RỘNG (SCALABLE PICKER) ===== */}
          <div ref={pickerRef} className="pointer-events-auto relative">
            <button
              type="button"
              disabled={busyWhole}
              onClick={() => setExercisePickerOpen(v => !v)}
              aria-haspopup="listbox"
              aria-expanded={exercisePickerOpen}
              className={cn(
                'group flex cursor-pointer items-center gap-2.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all hover:bg-card active:scale-95',
                glass,
                exercisePickerOpen && 'border-primary ring-2 ring-primary/20 bg-card',
              )}
            >
              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/15 text-primary">
                <Dumbbell size={12} />
              </div>
              <span className="font-bold tracking-tight text-foreground">{activeExercise.name}</span>
              <ChevronDown
                size={13}
                className={cn('text-foreground/50 transition-transform duration-200', exercisePickerOpen && 'rotate-180 text-foreground')}
              />
            </button>

            {/* Menu Popover chọn & tìm kiếm bài tập */}
            {exercisePickerOpen && (
              <div className="absolute left-0 top-full mt-2 z-50 w-72 sm:w-80 overflow-hidden rounded-2xl border border-foreground/15 bg-card/95 p-2 shadow-2xl backdrop-blur-2xl animate-in fade-in zoom-in-95 duration-150">
                {/* Ô tìm kiếm */}
                <div className="relative mb-2">
                  <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-foreground/45" />
                  <input
                    type="text"
                    value={exerciseQuery}
                    onChange={e => setExerciseQuery(e.target.value)}
                    placeholder="Tìm bài tập (squat, chống đẩy...)"
                    spellCheck={false}
                    autoComplete="off"
                    autoFocus
                    className="w-full rounded-xl border border-foreground/10 bg-background/60 py-1.5 pl-8 pr-3 text-xs text-foreground placeholder:text-foreground/40 focus:border-primary focus:outline-none"
                  />
                  {exerciseQuery && (
                    <button
                      type="button"
                      onClick={() => setExerciseQuery('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-foreground/40 hover:text-foreground"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>

                {/* Danh sách bài tập */}
                <div className="max-h-64 space-y-1 overflow-y-auto pr-1 text-xs [scrollbar-width:thin]">
                  {filteredExercises.length === 0 ? (
                    <div className="p-4 text-center text-xs text-foreground/50">
                      Không tìm thấy bài tập phù hợp
                    </div>
                  ) : (
                    filteredExercises.map(item => {
                      const active = item.id === selectedId;
                      const canSelect = item.isPoseSupported && item.enabled;

                      return (
                        <div
                          key={item.id}
                          role={canSelect ? 'button' : undefined}
                          tabIndex={canSelect ? 0 : -1}
                          onClick={() => {
                            if (!canSelect) return;
                            setSelectedId(item.id);
                            sendConfigure(item.id, source, true);
                            setExercisePickerOpen(false);
                            setExerciseQuery('');
                          }}
                          className={cn(
                            'group flex w-full items-center justify-between rounded-xl px-3 py-2 text-left transition-all',
                            canSelect
                              ? 'cursor-pointer'
                              : 'cursor-not-allowed opacity-45 select-none bg-foreground/[0.03]',
                            active && canSelect
                              ? 'bg-primary text-primary-foreground font-semibold shadow-xs'
                              : canSelect
                                ? 'hover:bg-foreground/10 text-foreground'
                                : 'text-muted-foreground',
                          )}
                        >
                          <div className="flex flex-col min-w-0 pr-2">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="truncate font-medium">{item.name}</span>
                              {!item.isPoseSupported && (
                                <span className="shrink-0 rounded-full bg-foreground/10 px-1.5 py-0.2 text-[9px] font-semibold text-muted-foreground">
                                  Chưa hỗ trợ Pose AI
                                </span>
                              )}
                              {item.isPoseSupported && !item.enabled && (
                                <span className="shrink-0 rounded-full bg-rose-500/15 border border-rose-500/25 px-1.5 py-0.2 text-[9px] font-bold text-rose-500">
                                  Tạm tắt
                                </span>
                              )}
                            </div>
                            <span
                              className={cn(
                                'text-[10px] mt-0.5',
                                active && canSelect
                                  ? 'text-primary-foreground/80'
                                  : 'text-foreground/50',
                              )}
                            >
                              {canSelect && item.shortcutIndex
                                ? `Phím tắt ${item.shortcutIndex}`
                                : item.isPoseSupported && !item.enabled
                                  ? 'Tạm dừng phân tích ở phòng tập'
                                  : 'Bài tập trong Thư viện (Chưa có phân tích tư thế)'}
                            </span>
                          </div>
                          {active && canSelect && (
                            <Check size={14} className="shrink-0 text-primary-foreground" />
                          )}
                          {!canSelect && (
                            <span className="shrink-0 text-[10px] font-mono text-muted-foreground/60">
                              ✕ Khóa
                            </span>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Footer liên kết Thư viện thêm bài tập */}
                <div className="mt-2 border-t border-foreground/10 pt-2">
                  <Link
                    href="/bai-tap"
                    className="flex items-center justify-between rounded-xl px-2.5 py-1.5 text-[11px] font-medium text-foreground/70 transition-colors hover:bg-foreground/10 hover:text-foreground"
                  >
                    <span>Khám phá thêm bài tập trong Thư viện</span>
                    <span className="text-primary font-bold">→</span>
                  </Link>
                </div>
              </div>
            )}
          </div>

          <div className="pointer-events-auto flex items-center gap-2">
            <div className={cn('flex items-center gap-0.5 rounded-full p-1', glass)}>
              <button
                type="button"
                onClick={() => void handleOpenCamera()}
                aria-pressed={source === 'camera'}
                className={cn(
                  'inline-flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all',
                  source === 'camera'
                    ? 'bg-[#6366f1] text-white shadow-xs'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                <Camera size={13} />
                <span className="hidden sm:inline">Camera</span>
              </button>
              <button
                type="button"
                onClick={() => void handleVideoMode()}
                aria-pressed={source === 'video'}
                className={cn(
                  'inline-flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all',
                  source === 'video'
                    ? 'bg-[#6366f1] text-white shadow-xs'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                <FileVideo size={13} />
                <span className="hidden sm:inline">Video</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => setPanelOpen(v => !v)}
              aria-label="Bật tắt bảng kết quả"
              aria-pressed={panelOpen}
              className={cn(
                'inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-full transition-all',
                glass,
                panelOpen && 'bg-[#6366f1]/15 text-[#6366f1] border-[#6366f1]/30',
              )}
            >
              <PanelRight size={15} />
            </button>

            <button
              type="button"
              onClick={() => setSettingsOpen(v => !v)}
              aria-label="Cài đặt kết nối AI"
              title={connectionText}
              className={cn('relative inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-full transition-all', glass)}
            >
              <Settings2 size={15} />
              <span
                className={cn(
                  'absolute right-1 top-1 h-2 w-2 rounded-full',
                  connected ? 'bg-emerald-500 shadow-xs shadow-emerald-500/50' : 'bg-amber-500 shadow-xs shadow-amber-500/50',
                )}
              />
            </button>
          </div>
        </div>

        {settingsOpen && (
          <form
            onSubmit={e => {
              e.preventDefault();
              try {
                const parsed = new URL(serverInput.trim());
                setServerUrl(parsed.origin);
                window.localStorage.setItem('smartgym.server', parsed.origin);
                void connectServer(parsed.origin);
                setSettingsOpen(false);
              } catch {
                setNotice('Địa chỉ Server AI phải bắt đầu bằng http:// hoặc https://', 'error');
              }
            }}
            className={cn(
              'pointer-events-auto !m-0 ml-auto flex w-full max-w-md flex-col gap-2 !rounded-2xl !p-3',
              glass,
            )}
          >
            <div className="flex items-center justify-between text-xs">
              <strong>{connectionText}</strong>
              <span className="text-foreground/55">{runtimeText}</span>
            </div>
            <div className="flex gap-2">
              <input
                type="url"
                aria-label="Địa chỉ Server AI"
                spellCheck={false}
                autoComplete="off"
                data-gramm="false"
                {...({ writingsuggestions: 'false' } as any)}
                value={serverInput}
                onChange={e => setServerInput(e.target.value)}
                className="!m-0 h-9 min-w-0 flex-1 !rounded-lg !border-foreground/15 !bg-foreground/10 !px-3 text-xs !text-foreground outline-none"
              />
              <button
                type="submit"
                className="!m-0 h-9 cursor-pointer !rounded-lg !border-0 !bg-foreground !px-3.5 text-xs font-semibold !text-background"
              >
                Kết nối
              </button>
            </div>
          </form>
        )}
      </div>

      {/* ===== BẢNG KẾT QUẢ NỔI (BÊN PHẢI) ===== */}
      {panelOpen && hasMedia && (
        <aside
          aria-label="Kết quả quan sát"
          className={cn(
            'absolute right-3 top-16 z-10 flex max-h-[calc(100%-15rem)] w-[min(340px,calc(100%-1.5rem))] flex-col overflow-hidden rounded-2xl sm:right-4 sm:top-[72px]',
            glass,
          )}
        >
          <div className="flex items-center justify-between border-b border-foreground/10 px-3.5 py-2.5">
            <div>
              <strong className="block text-xs font-semibold">
                {!activeResult
                  ? 'Đang chờ chuyển động'
                  : activeResult.status === 'insufficient_data'
                    ? 'Chưa đủ dữ liệu quan sát'
                    : detectedErrors.length > 0
                      ? `${detectedErrors.length} lỗi kỹ thuật cần lưu ý`
                      : detectedAttributes > 0
                        ? `${detectedAttributes} thuộc tính tư thế`
                        : 'Chưa có nhãn vượt ngưỡng'}
              </strong>
              <span className="text-[10.5px] text-foreground/55">
                {activeExercise.name} · {activeExercise.label_count} nhãn
              </span>
            </div>
            <div className="flex items-center gap-1 text-[11px]">
              {wholeResult && (
                <button
                  type="button"
                  onClick={() => setViewScope(viewScope === 'whole' ? 'live' : 'whole')}
                  className="cursor-pointer rounded-full bg-foreground/15 px-2 py-0.5 hover:bg-foreground/25"
                >
                  {viewScope === 'whole' ? 'Toàn video' : 'Trực tiếp'}
                </button>
              )}
              <button
                type="button"
                disabled={!activeResult || savingResult}
                onClick={() => void handleSaveResult()}
                className="cursor-pointer whitespace-nowrap rounded-full px-2 py-1 font-semibold hover:bg-foreground/15 disabled:opacity-30"
              >
                {savingResult ? 'Đang lưu…' : 'Lưu kết quả'}
              </button>
              <button
                type="button"
                disabled={!activeResult}
                onClick={handleExportJson}
                aria-label="Tải JSON"
                className="cursor-pointer rounded-full p-1.5 hover:bg-foreground/15 disabled:opacity-30"
              >
                <Download size={13} />
              </button>
            </div>
          </div>

          <ul className="m-0 list-none overflow-y-auto p-0 text-xs">
            {activeExercise.labels.map(label => {
              const row = lookup.get(label.key);
              const supported = row
                ? row.supported !== false
                : label.calibrated !== false &&
                  (viewScope === 'whole' || label.rep_supported !== false);
              const active = Boolean(row?.detected);
              const kind = row?.kind || label.kind;
              const prob = row?.probability;
              return (
                <li
                  key={label.key}
                  className={cn(
                    'm-0 flex items-center justify-between gap-2 border-b border-border/60 px-3.5 py-1.5 transition-colors',
                    !supported && 'opacity-35',
                    active && kind === 'error' && 'bg-rose-500/15 text-rose-600 dark:text-rose-400 font-semibold',
                    active && kind !== 'error' && 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-semibold',
                  )}
                >
                  <span className="inline-flex min-w-0 items-center gap-2">
                    <span
                      className={cn(
                        'h-1.5 w-1.5 shrink-0 rounded-full',
                        kind === 'error'
                          ? 'bg-rose-500 shadow-xs shadow-rose-500/50'
                          : kind === 'positive' || kind === 'attribute'
                            ? 'bg-emerald-500 shadow-xs shadow-emerald-500/50'
                            : 'bg-muted-foreground/40',
                      )}
                    />
                    <span className="truncate">{label.name_vi}</span>
                  </span>
                  <span className="shrink-0 font-mono text-[10.5px] text-muted-foreground">
                    {!supported ? 'N/A' : prob == null ? '—' : `${(prob * 100).toFixed(0)}%`}
                  </span>
                </li>
              );
            })}
          </ul>
        </aside>
      )}

      {/* ===== ĐẾM NGƯỢC CHUẨN BỊ VÀO VỊ TRÍ (3... 2... 1...) ===== */}
      {countdown !== null && (
        <div className="pointer-events-auto absolute inset-0 z-40 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="flex flex-col items-center text-center">
            <span className="text-sm font-semibold uppercase tracking-widest text-primary sm:text-base">
              Lùi về vị trí tập (cách 2–3m)
            </span>
            <span className="my-3 font-black text-white text-8xl sm:text-9xl drop-shadow-2xl animate-pulse">
              {countdown}
            </span>
            <button
              type="button"
              onClick={() => void startRunningInternal()}
              className="mt-4 cursor-pointer rounded-full border border-white/20 bg-white/15 px-6 py-2 text-xs font-bold text-white backdrop-blur-md transition-all hover:bg-white/25 active:scale-95"
            >
              Bắt đầu ngay (Bỏ qua đếm ngược)
            </button>
          </div>
        </div>
      )}

      {/* ===== CẢNH BÁO LỖI NỔI TRÊN MÀN HÌNH (DỄ NHÌN TỪ 3M) ===== */}
      {running && detectedErrors.length > 0 && (
        <div
          role="alert"
          className="pointer-events-none absolute left-1/2 top-4 z-30 flex max-w-[92%] -translate-x-1/2 items-center gap-2.5 rounded-full border border-rose-600 bg-rose-500 px-5 py-2 text-white shadow-2xl shadow-rose-500/30 backdrop-blur-md animate-bounce"
        >
          <span className="text-base sm:text-lg">⚠️</span>
          <span className="text-xs font-black uppercase tracking-wider sm:text-sm">
            LỖI FORM: {detectedErrors[0].name_vi}
          </span>
          {detectedErrors.length > 1 && (
            <span className="rounded-full bg-black/30 px-2 py-0.5 text-[10px] font-bold">
              +{detectedErrors.length - 1}
            </span>
          )}
        </div>
      )}

      {/* ===== HUD TRÁI DƯỚI: THẺ ĐẾM LƯỢT THỂ THAO CAO CẤP ===== */}
      {hasMedia && (
        <div
          className={cn(
            'pointer-events-none absolute left-4 bottom-5 z-20 flex flex-col rounded-2xl border border-foreground/15 bg-card/85 px-4 py-3 shadow-2xl backdrop-blur-xl transition-all duration-300 sm:left-6 sm:px-5 sm:py-3.5',
          )}
        >
          {/* Hàng 1: Chip trạng thái đồng bộ + Chỉ số phân tích */}
          <div className="flex items-center justify-between gap-3">
            <span
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10.5px] font-bold uppercase tracking-wider',
                workoutState.badge,
              )}
            >
              <span className={cn('h-1.5 w-1.5 rounded-full', workoutState.dot)} />
              {workoutState.label}
            </span>
            {(analysisFps !== '—' || roundtripMs !== '—') && (
              <span className="font-mono text-[10px] text-foreground/45">
                {analysisFps} fps · {roundtripMs}
              </span>
            )}
          </div>

          {/* Hàng 2: Con số lượt tập to rõ, không bị bậc thang */}
          <div className="mt-1 flex items-baseline gap-2.5">
            <span className="text-5xl font-black leading-none tracking-tight tabular-nums text-foreground sm:text-6xl">
              {String(repCount).padStart(2, '0')}
            </span>
            <span className="text-xs font-bold uppercase tracking-widest text-foreground/50">
              Lượt tập
            </span>
          </div>
        </div>
      )}

      {/* ===== ĐIỀU KHIỂN PHIÊN (CHÍNH GIỮA ĐÁY MÀN HÌNH - ALL-IN-ONE STUDIO ISLAND) ===== */}
      {hasMedia && (
        <div className="pointer-events-none absolute inset-x-0 bottom-4 z-20 flex justify-center px-3 transition-all duration-300">
          <div
            className={cn(
              'pointer-events-auto flex flex-col gap-2 rounded-2xl p-2 sm:px-3 sm:py-2.5 shadow-2xl backdrop-blur-xl border border-white/10 transition-all max-w-full',
              glass,
            )}
          >
            {/* Tầng 1: Timeline Scrubber (chỉ hiện khi là nguồn video) */}
            {source === 'video' && videoDuration > 0 && (
              <div className="flex items-center gap-2.5 px-1 pb-1 border-b border-foreground/10">
                <span className="font-mono text-[10.5px] font-semibold text-primary shrink-0">
                  {formatSeconds(videoCurrentTime)}
                </span>
                <div className="relative flex-1 flex items-center group py-0.5 min-w-[140px] sm:min-w-[240px]">
                  <input
                    type="range"
                    min={0}
                    max={videoDuration}
                    step={0.1}
                    value={videoCurrentTime}
                    onChange={e => {
                      const val = Number(e.target.value);
                      setVideoCurrentTime(val);
                      if (videoRef.current) {
                        videoRef.current.currentTime = val;
                      }
                    }}
                    className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-foreground/20 accent-[#6366f1] group-hover:h-2 transition-all"
                    aria-label="Tua thời gian video"
                  />
                </div>
                <span className="font-mono text-[10.5px] text-foreground/50 shrink-0">
                  {formatSeconds(videoDuration)}
                </span>
              </div>
            )}

            {/* Tầng 2: Thanh phím chức năng phân cụm trực quan */}
            <div className="flex flex-wrap items-center justify-between gap-1.5 sm:gap-2">
              {/* Cụm 1: AI Analysis */}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={busyWhole}
                  onClick={() => void handleToggleAnalysis()}
                  title="Phím tắt: Phím Cách (Space)"
                  className={cn(
                    'inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-xl px-3.5 text-xs font-semibold text-white shadow-md transition-all active:scale-95 disabled:opacity-50',
                    running
                      ? 'bg-rose-500 hover:bg-rose-600 shadow-rose-500/25'
                      : 'bg-[#6366f1] hover:bg-[#4f46e5] shadow-[#6366f1]/25',
                  )}
                >
                  {running ? <Square size={13} /> : <Play size={13} />}
                  <span>{running ? 'Dừng' : 'Phân tích (Space)'}</span>
                </button>

                {source === 'video' && videoFile && (
                  <button
                    type="button"
                    disabled={busyWhole}
                    onClick={() => void handleAnalyzeWholeVideo()}
                    title="Phân tích toàn bộ video tự động"
                    className="h-9 cursor-pointer rounded-xl bg-foreground/10 hover:bg-foreground/15 px-3 text-xs font-medium text-foreground transition-colors disabled:opacity-50"
                  >
                    ⚡ Cả video
                  </button>
                )}
              </div>

              {/* Cụm 2: Video Player Controls (Play/Pause, Mute) */}
              {source === 'video' && (
                <div className="flex items-center gap-0.5 rounded-xl bg-foreground/5 p-0.5 border border-foreground/10">
                  <button
                    type="button"
                    onClick={() => {
                      const v = videoRef.current;
                      if (!v) return;
                      if (runningRef.current || !v.paused) pauseAnalysis();
                      else void v.play().catch(() => setNotice('Không phát được video.', 'error'));
                    }}
                    aria-label={videoPaused ? 'Tiếp tục phát video' : 'Tạm dừng video'}
                    title={videoPaused ? 'Phát video' : 'Tạm dừng video'}
                    className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg hover:bg-foreground/15 text-foreground transition-colors"
                  >
                    {videoPaused ? <Play size={14} /> : <Pause size={14} />}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const v = videoRef.current;
                      if (!v) return;
                      v.muted = !v.muted;
                      setVideoMuted(v.muted);
                    }}
                    aria-label={videoMuted ? 'Bật âm thanh video' : 'Tắt tiếng video'}
                    title={videoMuted ? 'Bật âm thanh video' : 'Tắt tiếng video'}
                    className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg hover:bg-foreground/15 text-foreground transition-colors"
                  >
                    {videoMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                  </button>
                </div>
              )}

              {/* Cụm 3: Tiện ích & Trợ lý SmartGym */}
              <div className="flex items-center gap-1">
                {/* Đặt lại số lượt */}
                <button
                  type="button"
                  disabled={busyWhole}
                  onClick={() => {
                    sendConfigure(selectedId, source, false);
                    setNotice('Đã đặt lại bộ đếm lượt tập.');
                  }}
                  aria-label="Đặt lại bộ đếm lượt"
                  title="Đặt lại bộ đếm lượt"
                  className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-xl hover:bg-foreground/15 text-foreground/80 transition-colors"
                >
                  <RotateCcw size={14} />
                </button>

                {/* Chụp ảnh khung hình */}
                <button
                  type="button"
                  onClick={handleSaveSnapshot}
                  aria-label="Lưu ảnh khung hình"
                  title="Lưu ảnh phân tích"
                  className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-xl hover:bg-foreground/15 text-foreground/80 transition-colors"
                >
                  <Download size={14} />
                </button>

                {/* Lật gương */}
                <button
                  type="button"
                  onClick={() => setMirrored(v => !v)}
                  aria-label="Lật gương"
                  title="Lật gương"
                  aria-pressed={mirrored}
                  className={cn(
                    'inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-xl hover:bg-foreground/15 text-foreground/80 transition-colors',
                    mirrored && 'bg-foreground/20 text-foreground',
                  )}
                >
                  <FlipHorizontal2 size={14} />
                </button>

                {/* Toàn màn hình */}
                <button
                  type="button"
                  onClick={handleToggleFullscreen}
                  aria-label={isFullscreen ? 'Thu nhỏ màn hình' : 'Toàn màn hình'}
                  title={isFullscreen ? 'Thoát toàn màn hình' : 'Toàn màn hình'}
                  className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-xl hover:bg-foreground/15 text-foreground/80 transition-colors"
                >
                  {isFullscreen ? <Minimize size={14} /> : <Maximize size={14} />}
                </button>

                {/* Vách ngăn mỏng */}
                <div className="mx-0.5 h-4 w-px bg-foreground/15" />

                {/* Nút Hỏi SmartGym */}
                <button
                  type="button"
                  onClick={() => setDockMinimized(v => !v)}
                  aria-label="Hỏi SmartGym"
                  title="Hỏi trợ lý SmartGym (Phân tích lỗi & Kỹ thuật)"
                  aria-pressed={!dockMinimized}
                  className={cn(
                    'inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-xl px-2.5 text-xs font-semibold transition-all',
                    !dockMinimized
                      ? 'bg-primary text-primary-foreground shadow-md'
                      : 'hover:bg-foreground/15 text-foreground/85 border border-foreground/10',
                  )}
                >
                  <Sparkles size={13} className={!dockMinimized ? 'text-primary-foreground' : 'text-primary'} />
                  <span className="hidden sm:inline">Hỏi AI</span>
                </button>

                {/* Đóng nguồn */}
                <button
                  type="button"
                  onClick={handleCloseSource}
                  aria-label="Đóng nguồn hình"
                  title="Đóng video"
                  className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-xl hover:bg-rose-500/20 hover:text-rose-500 text-foreground/60 transition-colors"
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== THÔNG BÁO TRẠNG THÁI ===== */}
      {(noticeKind !== 'normal' || running || busyWhole) && (
        <div
          role="status"
          aria-live="polite"
          className={cn(
            'pointer-events-none absolute left-1/2 top-16 z-10 max-w-[90%] -translate-x-1/2 rounded-full px-4 py-1.5 text-xs font-medium sm:top-[72px]',
            glass,
            noticeKind === 'error' && '!bg-rose-500/90 text-white shadow-lg shadow-rose-500/25',
          )}
        >
          {noticeText}
        </div>
      )}

      {/* ===== KHUNG CHAT RAG (BUNG LÊN PHÍA TRÊN THANH ĐIỀU KHIỂN KHI BẤM 'HỎI AI') ===== */}
      {!dockMinimized && (
        <div className="pointer-events-auto absolute bottom-[4.5rem] inset-x-3 z-30 mx-auto max-w-2xl sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 sm:w-full">
          <RagDock
            context={ragContext}
            minimized={false}
            onToggleMinimize={() => setDockMinimized(true)}
          />
        </div>
      )}
    </div>
  );
}



