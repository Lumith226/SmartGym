/**
 * Smart Gym AI – API Client
 */
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const WS_URL  = process.env.NEXT_PUBLIC_WS_URL  || "ws://localhost:8000";

// ── Token helpers ─────────────────────────────────────────────
export const getToken = () =>
  typeof window !== "undefined" ? localStorage.getItem("access_token") : null;

export const setTokens = (access: string, refresh: string) => {
  localStorage.setItem("access_token", access);
  localStorage.setItem("refresh_token", refresh);
};

export const clearTokens = () => {
  localStorage.removeItem("access_token");
  localStorage.removeItem("refresh_token");
};

// ── Fetch wrapper ─────────────────────────────────────────────
async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
  auth = true
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (auth) {
    const token = getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }
  const res = await fetch(`${API_URL}${path}`, { ...options, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "API error");
  }
  return res.json() as Promise<T>;
}

// ── Auth ──────────────────────────────────────────────────────
export const authApi = {
  register: (email: string, password: string, full_name: string) =>
    apiFetch<{ access_token: string; refresh_token: string }>(
      "/api/v1/auth/register",
      { method: "POST", body: JSON.stringify({ email, password, full_name }) },
      false
    ),
  login: (email: string, password: string) =>
    apiFetch<{ access_token: string; refresh_token: string }>(
      "/api/v1/auth/login",
      { method: "POST", body: JSON.stringify({ email, password }) },
      false
    ),
  me: () => apiFetch<{ id: string; email: string; role: string }>("/api/v1/auth/me"),
};

// ── Profile ───────────────────────────────────────────────────
export const profileApi = {
  get: () => apiFetch<Record<string, unknown>>("/api/v1/profile"),
  update: (data: Record<string, unknown>) =>
    apiFetch("/api/v1/profile", { method: "PUT", body: JSON.stringify(data) }),
  logWeight: (weight_kg: number) =>
    apiFetch("/api/v1/profile/weight", { method: "POST", body: JSON.stringify({ weight_kg }) }),
  weightHistory: () => apiFetch<unknown[]>("/api/v1/profile/weight-history"),
};

// ── Session ───────────────────────────────────────────────────
export const sessionApi = {
  start: (exercise_code = "SQUAT") =>
    apiFetch<{ id: string }>("/api/v1/session/start", {
      method: "POST",
      body: JSON.stringify({ exercise_code }),
    }),
  end: (id: string) =>
    apiFetch(`/api/v1/session/${id}/end`, { method: "POST" }),
  get: (id: string) => apiFetch(`/api/v1/session/${id}`),
  errors: (id: string) => apiFetch<unknown[]>(`/api/v1/session/${id}/errors`),
  list: () => apiFetch<unknown[]>("/api/v1/sessions"),
};

// ── AI Coach ──────────────────────────────────────────────────
export const coachApi = {
  chat: (message: string, session_id?: string) =>
    apiFetch("/api/v1/coach/chat", {
      method: "POST",
      body: JSON.stringify({ message, session_id }),
    }),
  explainRep: (session_id: string, rep_number: number, fault_code: string) =>
    apiFetch("/api/v1/coach/explain-rep", {
      method: "POST",
      body: JSON.stringify({ session_id, rep_number, fault_code }),
    }),
  faultInfo: (code: string) => apiFetch(`/api/v1/coach/kb/fault/${code}`),
};

// ── WebSocket ─────────────────────────────────────────────────
export function createWorkoutWS(session_id: string, token: string) {
  return new WebSocket(`${WS_URL}/ws/stream/${session_id}?token=${token}`);
}
