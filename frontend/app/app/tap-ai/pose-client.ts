export const POSE_API = '/api/v1/pose';
export const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
export const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;

export type Capability = {
  exerciseId: string; modelVersion: string; liveEnabled: boolean; uploadEnabled: boolean;
  uploadRepCounting: boolean; liveRepCounting: boolean;
};
export type Result = {
  id: string; exerciseId: string; source: 'VIDEO' | 'LIVE'; repCount: number | null;
  repCountStatus: 'AVAILABLE' | 'UNAVAILABLE'; formStatus: 'ASSESSED' | 'INSUFFICIENT_EVIDENCE' | 'UNSUPPORTED';
  limitations: string[]; completedAt: string; expiresAt: string;
};
export type Job = { id: string; status: 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELED'; result?: Result; failureCode?: string };
export type Live = { id: string; streamPath: string; status: 'READY' | 'ACTIVE' | 'FAILED' | 'EXPIRED' | 'COMPLETED'; result?: Result };
type Grant = { uploadId: string; putUrl: string; headers: Record<string, string> };

export const exerciseNames: Record<string, string> = {
  bodyweight_squat: 'Squat không tạ', push_up: 'Chống đẩy', jumping_jacks: 'Bật nhảy dang tay chân', reverse_crunch: 'Gập bụng ngược',
};

const messages: Record<string, string> = {
  UNAUTHENTICATED: 'Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.',
  POSE_FEATURE_DISABLED: 'Chế độ này hiện chưa được bật.',
  POSE_UNAVAILABLE: 'Dịch vụ phân tích đang gián đoạn. Bạn có thể thử lại sau.',
  VIDEO_INVALID: 'Video không đọc được hoặc vượt giới hạn định dạng, thời lượng hoặc kích thước.',
  UPLOAD_EXPIRED: 'Quyền tải video đã hết hạn. Hãy tải lại video.',
  INFERENCE_OUTCOME_UNKNOWN: 'Kết nối phân tích bị gián đoạn. Chưa thể xác nhận kết quả của video.',
  LIVE_SESSION_LIMIT: 'Bạn đã có một phiên tập đang mở. Hãy kết thúc phiên đó hoặc chờ hết hạn.',
  CONSENT_VERSION_UNSUPPORTED: 'Điều khoản xử lý video đã thay đổi. Tải lại trang để đọc phiên bản mới.',
  RESULT_EXPIRED: 'Kết quả đã hết hạn lưu.',
  NOT_FOUND: 'Không tìm thấy kết quả trong tài khoản của bạn.',
  CAMERA_DENIED: 'Chưa được cấp quyền camera. Bạn có thể dùng chế độ tải video.',
  CAMERA_UNAVAILABLE: 'Không mở được camera. Bạn có thể dùng chế độ tải video.',
  LIVE_INTERRUPTED: 'Phiên trực tiếp bị gián đoạn. Bạn có thể bắt đầu phiên mới hoặc tải video.',
  UPLOAD_FAILED: 'Tải video thất bại. Kiểm tra kết nối rồi thử lại.',
};
export class PoseError extends Error {
  constructor(readonly code: string, readonly status = 0) { super(code); }
}
export function errorText(error: unknown) {
  if (error instanceof PoseError) return messages[error.code] ?? (error.status === 401 ? messages.UNAUTHENTICATED : messages.POSE_UNAVAILABLE);
  return messages.POSE_UNAVAILABLE;
}

export async function pose<T>(path: string, options: { signal?: AbortSignal; body?: object; method?: 'POST'; key?: string } = {}): Promise<T> {
  const method = options.method ?? (options.body ? 'POST' : 'GET');
  const timeout = AbortSignal.timeout(12000);
  const response = await fetch(POSE_API + path, { method, cache: 'no-store', redirect: 'error',
    signal: options.signal ? AbortSignal.any([timeout, options.signal]) : timeout,
    headers: { ...(method === 'POST' ? { 'X-SmartGym-CSRF': '1' } : {}),
      ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.key ? { 'Idempotency-Key': options.key } : {}) },
    body: options.body ? JSON.stringify(options.body) : undefined });
  if (!response.ok) {
    const problem = await response.json().catch(() => ({}));
    throw new PoseError(typeof problem.code === 'string' ? problem.code : 'POSE_UNAVAILABLE', response.status);
  }
  return response.json();
}

export function sleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) { reject(signal.reason); return; }
    const cancel = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', cancel); resolve(); }, ms);
    signal.addEventListener('abort', cancel, { once: true });
  });
}

export async function prepareUpload(file: File, consentVersion: string, signal: AbortSignal) {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  signal.throwIfAborted();
  return pose<Grant>('/uploads', { signal, key: crypto.randomUUID(), body: {
    mimeType: file.type, sizeBytes: file.size, sha256: Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join(''), consentVersion,
  } });
}

export function putVideo(grant: Grant, file: File, signal: AbortSignal, progress: (value: number) => void) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) { reject(signal.reason); return; }
    const xhr = new XMLHttpRequest();
    const cancel = () => xhr.abort();
    xhr.open('PUT', grant.putUrl);
    xhr.timeout = 180000;
    for (const [name, value] of Object.entries(grant.headers)) xhr.setRequestHeader(name, value);
    signal.addEventListener('abort', cancel, { once: true });
    xhr.upload.onprogress = event => { if (event.lengthComputable) progress(Math.round(event.loaded / event.total * 100)); };
    xhr.onload = () => xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new PoseError('UPLOAD_FAILED'));
    xhr.onerror = xhr.ontimeout = () => reject(new PoseError('UPLOAD_FAILED'));
    xhr.onabort = () => reject(signal.reason);
    xhr.onloadend = () => signal.removeEventListener('abort', cancel);
    xhr.send(file);
  });
}
