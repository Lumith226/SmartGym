const $ = (id) => document.getElementById(id);
const video = $("preview"), overlay = $("overlay"), context = overlay.getContext("2d");
const capture = document.createElement("canvas"), captureContext = capture.getContext("2d");
const ORDER = ["squat", "push_up", "jump_jack", "situp"];
const FALLBACK = [
  {id: "squat", name: "Squat", subtitle: "Gánh đùi", version: "V4", label_count: 14, labels: []},
  {id: "push_up", name: "Chống đẩy", subtitle: "Nhiều nhãn Qualcomm", version: "V4", label_count: 21, labels: []},
  {id: "jump_jack", name: "Jumping jacks", subtitle: "Bật nhảy dang tay chân", version: "V4", label_count: 29, labels: []},
  {id: "situp", name: "Gập bụng ngược", subtitle: "Nhiều nhãn Qualcomm", version: "V4", label_count: 19, labels: []},
];
const PAIRS = [[0,1],[0,2],[1,3],[2,4],[5,6],[5,7],[7,9],[6,8],[8,10],[5,11],[6,12],[11,12],[11,13],[13,15],[12,14],[14,16]];
const S = {
  api: localStorage.getItem("smartgym.server") || "http://127.0.0.1:8001",
  exercises: FALLBACK, exercise: "squat", source: "camera", socket: null,
  connected: false, configured: false, running: false, busy: false,
  stream: null, file: null, objectUrl: null, hasMedia: false, mediaBusy: false, mediaGeneration: 0,
  generation: 0, frameId: 0, inFlight: false, pending: null,
  lastSentMedia: -1, lastSentAt: -Infinity, displayTimes: [], analysisTimes: [],
  points: [], pointsAt: 0, live: null, whole: null, view: "live", rows: new Map(),
  resultKey: "", retry: null, connecting: false, watchdog: null, processed: 0,
};

function notice(message, type = "") {
  $("notice").textContent = message;
  $("notice").className = `notice ${type}`;
}
function exerciseInfo() { return S.exercises.find((row) => row.id === S.exercise); }
function sourceReady() { return S.hasMedia && video.readyState >= 2; }
function setConnection(online, message, runtime = "") {
  $("server-dot").className = `status-dot ${online ? "online" : "offline"}`;
  $("connection-status").textContent = message;
  $("runtime-label").textContent = runtime || "WEB :8080 · SERVER AI :8001";
  S.connected = online;
  updateControls();
}
function updateControls() {
  $("start-analysis").disabled = !S.connected || !S.configured || !sourceReady() || S.busy;
  $("reset-session").disabled = !S.connected || S.busy;
  $("save-snapshot").disabled = !sourceReady();
  $("pause-video").hidden = S.source !== "video" || !S.hasMedia;
  $("whole-video-tools").hidden = S.source !== "video";
  $("analyze-whole").disabled = !S.file || !S.connected || S.busy || exerciseInfo().version !== "V4";
  $("whole-view").disabled = !S.whole || S.busy;
  $("export-json").disabled = !displayResult();
  $("camera-device").disabled = S.busy;
  $("open-camera").disabled = S.busy || S.mediaBusy;
  $("empty-open").disabled = S.busy || S.mediaBusy;
  $("camera-source").disabled = S.busy;
  $("video-source").disabled = S.busy;
  $("video-file").disabled = S.busy;
  for (const button of $("exercise-tabs").querySelectorAll("button")) button.disabled = S.busy;
  $("start-analysis").classList.toggle("running", S.running);
  $("start-analysis").textContent = S.running ? "■  Dừng phân tích" : "▶  Bắt đầu phân tích";
}
function drawExercises() {
  $("exercise-tabs").replaceChildren();
  for (const [index, id] of ORDER.entries()) {
    const item = S.exercises.find((row) => row.id === id);
    const button = document.createElement("button");
    button.type = "button";
    button.className = `exercise-tab ${id === S.exercise ? "active" : ""}`;
    button.setAttribute("aria-pressed", String(id === S.exercise));
    button.dataset.exercise = id;
    const number = document.createElement("span"); number.className = "exercise-number"; number.textContent = String(index + 1);
    const content = document.createElement("span");
    const title = document.createElement("strong"); title.textContent = item.name;
    const sub = document.createElement("small"); sub.textContent = `${item.version} · ${item.label_count} ${item.version === "V4" ? "nhãn độc lập" : "lớp"}`;
    content.append(title, sub);
    const check = document.createElement("span"); check.className = "check"; check.textContent = id === S.exercise ? "✓" : "↗";
    button.append(number, content, check);
    button.addEventListener("click", () => selectExercise(id));
    $("exercise-tabs").append(button);
  }
  const info = exerciseInfo();
  $("model-note").textContent=S.exercises.every((item)=>item.version==="V4") ? "Bốn bài sử dụng mô hình V4 nhiều nhãn: squat 14, chống đẩy 21, jumping jacks 29, gập bụng ngược 19." : "Squat và jumping jacks dùng V4. Hai bài còn lại dùng phiên bản hiện có trên server.";
  $("selected-name").replaceChildren(document.createTextNode(info.name + " "));
  const badge = document.createElement("span"); badge.className = "version-pill"; badge.textContent = info.version;
  $("selected-name").append(badge);
  $("label-count").textContent = `${info.label_count} ${info.version === "V4" ? "nhãn" : "lớp"}`;
}
function buildRows() {
  S.rows.clear(); $("label-rows").replaceChildren();
  for (const label of exerciseInfo().labels) {
    const tr = document.createElement("tr");
    const name = document.createElement("td");
    const text = document.createElement("span"); text.className = "label-name";
    const dot = document.createElement("i"); text.append(dot, document.createTextNode(label.name_vi)); name.append(text);
    const score = document.createElement("td"), threshold = document.createElement("td"), decision = document.createElement("td");
    decision.className = "decision";
    tr.append(name, score, threshold, decision);
    $("label-rows").append(tr); S.rows.set(label.key, {tr, score, threshold, decision, label});
  }
  S.resultKey = ""; renderResults(true);
}
function displayResult() { return S.view === "whole" ? S.whole : S.live; }
function renderResults(force = false) {
  const result = displayResult();
  const key = JSON.stringify([S.view, result]);
  if (!force && S.resultKey === key) return;
  S.resultKey = key;
  const labels = result?.label_results || [];
  const lookup = new Map(labels.map((row) => [row.key, row]));
  let errors = 0, attributes = 0;
  for (const [id, entry] of S.rows) {
    let row = lookup.get(id);
    if (result && !result.is_multihead && result.probabilities && id in result.probabilities) {
      row = {probability: result.probabilities[id], threshold: null,
        detected: result.class_code === id, supported: true,
        kind: id === "CORRECT" ? "positive" : "error"};
    }
    const {label} = entry;
    const supported = row ? row.supported : label.calibrated !== false && (S.view === "whole" || label.rep_supported !== false);
    const active = Boolean(row?.detected);
    const kind = row?.kind || label.kind;
    if (active) { if (kind === "error") errors++; else attributes++; }
    entry.tr.className = !supported ? "unsupported" : active ? (kind === "error" ? "active-error" : "active-attribute") : "";
    const value = row?.probability;
    entry.score.textContent = value == null ? "—" : `${(value * 100).toFixed(1)}%`;
    const threshold = row?.threshold ?? label.threshold;
    entry.threshold.textContent = threshold != null && threshold <= 1 ? `${(threshold * 100).toFixed(1)}%` : "—";
    entry.decision.textContent = !supported ? "N/A" : !row ? "—" : active ? "Có" : "—";
    entry.tr.title = !supported ? (row?.status || (label.calibrated === false ? "Chưa đủ mẫu xác thực để chọn ngưỡng." : "Nhãn này cần phân tích toàn video.")) : row?.status || "";
  }
  $("live-view").classList.toggle("active", S.view === "live");
  $("whole-view").classList.toggle("active", S.view === "whole");
  const insufficient = result?.status === "insufficient_data";
  $("result-summary").classList.toggle("warning", errors > 0 || insufficient);
  $("summary-title").textContent = !result ? "Đang chờ chuyển động" : insufficient ? "Chưa đủ dữ liệu quan sát" : errors ? `${errors} nhãn lỗi cần kiểm tra` : attributes ? `${attributes} thuộc tính / trạng thái được dự đoán` : "Chưa có nhãn vượt ngưỡng";
  $("summary-text").textContent = !result ? (exerciseInfo().version === "V3" ? "Hoàn thành một lượt để xem kết quả V3 của bài đang chọn." : "Kết quả xuất hiện khi có đủ chuỗi khớp. Một số nhãn chỉ áp dụng toàn video.") : insufficient ? result.feedback_vi || "Chưa thấy đủ khớp để đánh giá; hãy kiểm tra khung hình và ánh sáng." : result.review_notes?.[0] || (errors ? "Đối chiếu với chuyển động thực tế; đây là dự đoán của mô hình." : "Thuộc tính được dự đoán không phải kết luận toàn bộ động tác đúng.");
  $("result-scope").textContent = !result ? "Chưa có kết quả" : S.view === "whole" ? "Phạm vi: toàn video" : result.scope === "rep" || exerciseInfo().version === "V3" ? "Phạm vi: lượt gần nhất" : "Phạm vi: đoạn chuyển động gần đây";
  $("quality-note").textContent = result?.quality ? `Khung mẫu có khớp dùng được: ${(result.quality.valid_frame_ratio * 100).toFixed(0)}%. Điểm chưa hiệu chuẩn thành xác suất đúng. N/A: thiếu khớp, cần toàn video hoặc thiếu mẫu xác thực.` : "Điểm của các nhãn độc lập, không cộng thành 100%. Không báo lỗi chưa xác nhận toàn bộ động tác đúng.";
  updateControls();
}
function clearObservations(clearWhole = false) {
  S.live = null; S.points = []; S.pointsAt = 0;
  S.analysisTimes = []; S.processed = 0;
  $("rep-count").textContent = "00";
  $("analysis-fps").textContent = "—"; $("roundtrip-ms").textContent = "—";
  if (clearWhole) { S.whole = null; S.view = "live"; }
  renderResults(true);
}
function configure(clearWhole = false) {
  S.generation++; S.configured = false; S.inFlight = false; S.pending = null;
  S.lastSentMedia = -1; S.lastSentAt = -Infinity;
  clearObservations(clearWhole);
  if (S.socket?.readyState === WebSocket.OPEN) {
    S.socket.send(JSON.stringify({type: "configure", exercise: S.exercise, source: S.source, generation: S.generation}));
  }
  updateControls();
}
function selectExercise(id) {
  if (S.busy || S.exercise === id) return;
  S.exercise = id;
  if (S.source === "video" && S.hasMedia) video.currentTime = 0;
  drawExercises(); buildRows(); configure(true);
  notice(`Đã chọn ${exerciseInfo().name} (${exerciseInfo().version}). Kết quả bài trước đã được xóa.`);
}
async function connect() {
  if (S.connecting) return;
  S.connecting = true; clearTimeout(S.retry);
  const previous = S.socket; S.socket = null;
  if (previous) previous.close();
  S.configured = false; S.inFlight = false; S.pending = null;
  clearObservations(true);
  setConnection(false, "Đang kết nối server AI…");
  try {
    const base = new URL(S.api);
    if (!["http:", "https:"].includes(base.protocol)) throw new Error("Địa chỉ server phải bắt đầu bằng http:// hoặc https://.");
    const response = await fetch(`${S.api}/api/health`, {signal: AbortSignal.timeout(5000)});
    if (!response.ok) throw new Error(`Server trả mã ${response.status}.`);
    const health = await response.json();
    if (!health.ready) throw new Error(health.error || "Server đang khởi tạo mô hình.");
    const exerciseResponse = await fetch(`${S.api}/api/exercises`, {signal: AbortSignal.timeout(5000)});
    if (!exerciseResponse.ok) throw new Error("Không đọc được danh sách bài tập.");
    const exercises = (await exerciseResponse.json()).exercises;
    if (!Array.isArray(exercises) || !ORDER.every((id) => exercises.some((item) => item.id === id))) throw new Error("Server không có đủ cấu hình bài tập.");
    S.exercises = exercises; drawExercises(); buildRows();
    const wsUrl = new URL("/ws/live", S.api); wsUrl.protocol = base.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(wsUrl); S.socket = socket;
    socket.onopen = () => {
      if (socket !== S.socket) return;
      const gpu = health.runtime.device === "cuda" && health.runtime.pose_providers?.includes("CUDAExecutionProvider");
      setConnection(true, "Server AI đã sẵn sàng", `${gpu ? "GPU · CUDA" : "CPU"} · RTMPose + ST-GCN++ · ${base.host}`);
      configure(true);
      notice("Đã kết nối. Chọn nguồn hình rồi bấm Bắt đầu phân tích.");
    };
    socket.onmessage = ({data}) => {
      if (socket !== S.socket) return;
      let message;
      try { message = JSON.parse(data); } catch { return; }
      if (message.type === "ready" && message.generation === S.generation) {
        S.configured = true; S.inFlight = false; S.pending = null; updateControls();
      } else if (message.type === "result" && message.generation === S.generation) {
        const pending = S.pending;
        S.inFlight = false; S.pending = null;
        if (!pending || pending.frameId !== message.frame_id) return;
        if (!S.running) return;
        const now = performance.now();
        S.points = message.keypoints; S.pointsAt = pending.captureAt;
        S.live = message.result;
        S.analysisTimes.push(now); S.analysisTimes = S.analysisTimes.filter((t) => now - t < 2000);
        S.processed++;
        $("roundtrip-ms").textContent = `${Math.round(now - pending.captureAt)} ms`;
        $("rep-count").textContent = String(message.rep_count).padStart(2, "0");
        $("pose-status").textContent = message.found ? ({READY: "SẴN SÀNG", IN_REP: "ĐANG TRONG LƯỢT"}[message.state] || message.state) : "CHƯA THẤY KHỚP ĐỦ RÕ";
        renderResults();
      } else if (message.type === "error") {
        if (message.generation != null && message.generation !== S.generation) return;
        S.inFlight = false; S.pending = null; S.points = [];
        stopAnalysis(false); notice(message.message, "error");
      }
    };
    socket.onclose = () => {
      if (socket !== S.socket) return;
      S.configured = false; S.inFlight = false; S.pending = null;
      stopAnalysis(false); clearObservations();
      setConnection(false, "Server AI đã ngắt kết nối");
      notice("Kiểm tra cửa sổ SERVER, sau đó bấm Kết nối lại. Hình ảnh tại trình duyệt vẫn có thể phát.", "error");
    };
    socket.onerror = () => { if (socket === S.socket) notice("Không mở được kết nối phân tích. Kiểm tra server và địa chỉ kết nối.", "error"); };
  } catch (error) {
    setConnection(false, "Chưa kết nối được server AI");
    notice(`Hãy chạy SERVER ở cổng 8001. ${error.message}`, "error");
    S.retry = setTimeout(connect, 5000);
  } finally { S.connecting = false; }
}
function stopAnalysis(showNotice = true) {
  S.running = false; S.points = [];
  if (showNotice) notice("Đã dừng phân tích. Kết quả đang hiển thị là kết quả cuối trước khi dừng.");
  updateControls();
}
async function startAnalysis() {
  if (S.running) { stopAnalysis(); return; }
  if (!S.connected || !sourceReady() || S.busy) return;
  if (S.source === "video") {
    if (video.ended) video.currentTime = 0;
    try { await video.play(); } catch { notice("Bấm phát trên video trước khi phân tích.", "error"); return; }
  }
  S.view = "live"; configure(false); S.running = true;
  notice(exerciseInfo().version === "V4" ? "Đang phân tích đoạn chuyển động gần đây. Chờ đủ khớp trước khi có kết quả." : "Đang theo dõi. Hoàn thành một lượt để xem kết quả V3.");
  updateControls();
}
function stopMedia() {
  S.mediaGeneration++; S.mediaBusy = false;
  stopAnalysis(false);
  if (S.stream) for (const track of S.stream.getTracks()) track.stop();
  S.stream = null; video.pause(); video.srcObject = null;
  video.removeAttribute("src"); video.load();
  if (S.objectUrl) URL.revokeObjectURL(S.objectUrl);
  S.objectUrl = null; S.hasMedia = false; S.displayTimes = [];
  $("empty-state").hidden = false; $("stage-badge").hidden = true;
  $("source-resolution").textContent = "—"; $("display-fps").textContent = "—";
  $("pose-status").textContent = "CHƯA CÓ NGUỒN HÌNH";
  updateControls();
}
function selectSource(source) {
  if (S.busy) return;
  if (source !== S.source) { stopMedia(); S.source = source; S.file = null; configure(true); }
  $("camera-source").classList.toggle("active", source === "camera");
  $("video-source").classList.toggle("active", source === "video");
  $("camera-options").hidden = source !== "camera"; $("file-options").hidden = source !== "video";
  $("mirror").checked = source === "camera"; mirror(); updateControls();
  $("empty-open").textContent = source === "camera" ? "Mở camera ↗" : "Chọn video ↗";
}
async function listCameras() {
  if (!navigator.mediaDevices?.enumerateDevices) return;
  const devices = (await navigator.mediaDevices.enumerateDevices()).filter((item) => item.kind === "videoinput");
  const selected = S.stream?.getVideoTracks()[0]?.getSettings().deviceId || $("camera-device").value;
  const fallback = document.createElement("option"); fallback.value = ""; fallback.textContent = "Camera mặc định";
  $("camera-device").replaceChildren(fallback);
  for (const [index, device] of devices.entries()) {
    const option = document.createElement("option"); option.value = device.deviceId; option.textContent = device.label || `Camera ${index + 1}`;
    $("camera-device").append(option);
  }
  if (devices.some((item) => item.deviceId === selected)) $("camera-device").value = selected;
}
async function openCamera() {
  if (S.busy || S.mediaBusy) return;
  selectSource("camera");
  if (!navigator.mediaDevices?.getUserMedia) { notice("Trình duyệt chưa cho phép camera. Hãy mở web bằng http://localhost:8080 hoặc HTTPS.", "error"); return; }
  const deviceId = $("camera-device").value;
  stopMedia(); configure(true);
  const mediaGeneration = S.mediaGeneration;
  S.mediaBusy = true; updateControls();
  notice("Đang xin quyền và mở camera…", "busy");
  try {
    const stream = await navigator.mediaDevices.getUserMedia({video: {
      width: {ideal: 640}, height: {ideal: 480}, frameRate: {ideal: 30, max: 30},
      ...(deviceId ? {deviceId: {exact: deviceId}} : {facingMode: "user"}),
    }, audio: false});
    if (mediaGeneration !== S.mediaGeneration || S.source !== "camera") {
      for (const track of stream.getTracks()) track.stop();
      return;
    }
    S.stream = stream;
    video.srcObject = S.stream; video.controls = false; await video.play();
    S.hasMedia = true; mediaReady(); await listCameras();
    const track = S.stream.getVideoTracks()[0];
    track.addEventListener("ended", () => { if (S.stream === stream) { stopMedia(); configure(true); notice("Camera đã ngắt. Chọn thiết bị và mở lại.", "error"); } });
    notice("Camera đã mở. Bấm Bắt đầu phân tích để gửi hình tới server AI.");
  } catch (error) {
    if (mediaGeneration !== S.mediaGeneration) return;
    stopMedia();
    const messages = {
      NotAllowedError: "Quyền camera chưa được cấp. Cho phép camera trong thanh địa chỉ rồi thử lại.",
      NotFoundError: "Không tìm thấy camera. Kiểm tra kết nối hoặc chọn tệp video.",
      NotReadableError: "Không đọc được camera. Kiểm tra thiết bị, đóng ứng dụng đang dùng camera hoặc chọn camera khác.",
      OverconstrainedError: "Camera đã chọn không còn khả dụng. Chọn Camera mặc định rồi thử lại.",
    };
    notice(messages[error.name] || `Không mở được camera: ${error.message}`, "error");
  } finally { if (mediaGeneration === S.mediaGeneration) { S.mediaBusy = false; updateControls(); } }
}
function mediaReady() {
  S.hasMedia = true; $("empty-state").hidden = true; $("stage-badge").hidden = false;
  $("stage-label").textContent = S.source === "camera" ? "CAMERA TRỰC TIẾP" : "VIDEO TRÊN MÁY";
  $("source-resolution").textContent = `${video.videoWidth} × ${video.videoHeight}`;
  $("pose-status").textContent = "SẴN SÀNG PHÂN TÍCH";
  updateControls();
}
function mirror() {
  for (const element of [video, overlay]) element.classList.toggle("mirrored", $("mirror").checked);
}
async function selectFile(file) {
  if (!file || S.busy) return;
  selectSource("video"); stopMedia(); S.file = file;
  S.objectUrl = URL.createObjectURL(file); video.src = S.objectUrl; video.controls = true;
  $("file-name").textContent = file.name; configure(true);
  notice("Video được phát tại trình duyệt. Bấm Bắt đầu để theo dõi hoặc Phân tích video để đánh giá toàn đoạn.");
  try { await video.play(); } catch { /* Native video controls remain available. */ }
}
function sendFrame(now, mediaTime) {
  if (!S.running || !S.configured || S.busy || S.inFlight || !sourceReady() || video.paused || video.ended) return;
  const socket = S.socket;
  if (socket?.readyState !== WebSocket.OPEN || socket.bufferedAmount > 256 * 1024) return;
  // No more than 25 requests/s; one request outstanding prevents a growing queue.
  if (now - S.lastSentAt < 40 || mediaTime <= S.lastSentMedia) return;
  const generation = S.generation;
  S.inFlight = true; S.lastSentAt = now; S.lastSentMedia = mediaTime;
  const scale = Math.min(1, 640 / Math.max(video.videoWidth, video.videoHeight));
  capture.width = Math.max(1, Math.round(video.videoWidth * scale));
  capture.height = Math.max(1, Math.round(video.videoHeight * scale));
  captureContext.drawImage(video, 0, 0, capture.width, capture.height);
  const frameId = ++S.frameId;
  S.pending = {frameId, captureAt: now};
  capture.toBlob(async (blob) => {
    if (generation !== S.generation || socket !== S.socket) return;
    if (!blob || !S.running || socket.readyState !== WebSocket.OPEN) { S.inFlight = false; S.pending = null; return; }
    try {
      const image = await blob.arrayBuffer();
      if (generation !== S.generation || !S.running || socket !== S.socket) return;
      const meta = new TextEncoder().encode(JSON.stringify({frame_id: frameId, timestamp: mediaTime, generation}));
      const header = new ArrayBuffer(4); new DataView(header).setUint32(0, meta.length, true);
      socket.send(new Blob([header, meta, image]));
    } catch (error) { S.inFlight = false; S.pending = null; notice(`Không gửi được hình: ${error.message}`, "error"); }
  }, "image/jpeg", .82);
}
function onVideoFrame(now, metadata) {
  if (S.hasMedia && !video.paused && !video.ended) {
    S.displayTimes.push(now); S.displayTimes = S.displayTimes.filter((t) => now - t < 1500);
    sendFrame(now, metadata.mediaTime);
  }
  video.requestVideoFrameCallback(onVideoFrame);
}
function rate(times, now) {
  const recent = times.filter((t) => now - t < 2000);
  return recent.length > 1 ? (recent.length - 1) * 1000 / Math.max(1, recent.at(-1) - recent[0]) : 0;
}
let lastMetric = 0, fallbackTime = -1;
function animate(now) {
  if (!video.requestVideoFrameCallback && sourceReady() && video.currentTime !== fallbackTime && !video.paused) {
    fallbackTime = video.currentTime; S.displayTimes.push(now); S.displayTimes = S.displayTimes.filter((t) => now - t < 1500); sendFrame(now, video.currentTime);
  }
  const dpr = window.devicePixelRatio || 1;
  const width = Math.round(overlay.clientWidth * dpr), height = Math.round(overlay.clientHeight * dpr);
  if (overlay.width !== width || overlay.height !== height) { overlay.width = width; overlay.height = height; }
  context.clearRect(0, 0, width, height);
  if (S.running && S.points.length && now - S.pointsAt < 500 && sourceReady()) {
    const scale = Math.min(width / video.videoWidth, height / video.videoHeight);
    const drawWidth = video.videoWidth * scale, drawHeight = video.videoHeight * scale;
    const offsetX = (width - drawWidth) / 2, offsetY = (height - drawHeight) / 2;
    const point = (i) => [offsetX + S.points[i][0] * drawWidth, offsetY + S.points[i][1] * drawHeight];
    context.lineWidth = 2 * dpr; context.strokeStyle = "#c7f7a1"; context.fillStyle = "#eefbd6";
    for (const [a,b] of PAIRS) {
      if (Math.min(S.points[a][2], S.points[b][2]) < .25) continue;
      context.beginPath(); context.moveTo(...point(a)); context.lineTo(...point(b)); context.stroke();
    }
    for (let i=0; i<S.points.length; i++) {
      if (S.points[i][2] < .25) continue;
      context.beginPath(); context.arc(...point(i), 3 * dpr, 0, 2 * Math.PI); context.fill();
    }
  }
  if (now - lastMetric > 500) {
    $("display-fps").textContent = S.hasMedia && !video.paused && !video.ended ? rate(S.displayTimes, now).toFixed(1) : "—";
    $("analysis-fps").textContent = S.running ? rate(S.analysisTimes, now).toFixed(1) : "—";
    if (S.pending && now - S.pending.captureAt > 20000) {
      S.socket?.close(); notice("Server chưa trả kết quả sau 20 giây. Kiểm tra cửa sổ server rồi kết nối lại.", "error");
    }
    lastMetric = now;
  }
  requestAnimationFrame(animate);
}
async function analyzeWholeVideo() {
  if (!S.file || !S.connected || S.busy || exerciseInfo().version !== "V4") return;
  stopAnalysis(false); video.pause(); S.busy = true; updateControls();
  const started = performance.now();
  notice("Đang gửi và phân tích toàn video. Server lấy mẫu chuỗi khớp theo đúng cấu hình V4…", "busy");
  const timer = setInterval(() => notice(`Đang phân tích toàn video · ${Math.round((performance.now() - started)/1000)} giây. Camera trực tiếp tạm dừng trong bước này.`, "busy"), 1000);
  try {
    const body = new FormData(); body.append("exercise", S.exercise); body.append("file", S.file);
    const response = await fetch(`${S.api}/api/analyze-video`, {method: "POST", body, signal: AbortSignal.timeout(180000)});
    const payload = await response.json();
    if (!response.ok) throw new Error(typeof payload.detail === "string" ? payload.detail : "Không phân tích được video.");
    S.whole = payload.result; S.view = "whole"; renderResults(true);
    notice(`Đã phân tích toàn video trong ${payload.elapsed_seconds}s. Bảng mô tả cả đoạn; bấm phát video để đối chiếu.`);
  } catch (error) { notice(`Phân tích toàn video chưa hoàn tất: ${error.message}`, "error"); }
  finally { clearInterval(timer); S.busy = false; updateControls(); }
}
function download(blob, filename) {
  const link = document.createElement("a"), url = URL.createObjectURL(blob);
  link.href = url; link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

$("settings-toggle").onclick = () => { $("settings-panel").hidden = !$("settings-panel").hidden; };
$("save-server").onclick = () => {
  try {
    const url = new URL($("server-url").value.trim());
    if (!["http:", "https:"].includes(url.protocol)) throw new Error("Chỉ hỗ trợ http:// hoặc https://.");
    S.api = url.origin; localStorage.setItem("smartgym.server", S.api); $("api-address").textContent = url.host;
    stopAnalysis(false); connect();
  } catch (error) { notice(error.message, "error"); }
};
$("reconnect").onclick = () => { stopAnalysis(false); connect(); };
$("camera-source").onclick = () => selectSource("camera");
$("video-source").onclick = () => selectSource("video");
$("open-camera").onclick = openCamera;
$("empty-open").onclick = () => S.source === "camera" ? openCamera() : $("video-file").click();
$("video-file").onchange = (event) => selectFile(event.target.files[0]);
$("camera-device").onchange = () => { if (S.stream) openCamera(); };
$("mirror").onchange = mirror;
$("start-analysis").onclick = startAnalysis;
$("reset-session").onclick = () => { configure(false); notice("Đã đặt lại bộ đếm và kết quả đoạn trực tiếp."); };
$("pause-video").onclick = async () => { if (video.paused) await video.play(); else video.pause(); };
$("analyze-whole").onclick = analyzeWholeVideo;
$("live-view").onclick = () => { S.view = "live"; renderResults(true); };
$("whole-view").onclick = () => { if (S.whole) { S.view = "whole"; renderResults(true); } };
$("export-json").onclick = () => download(new Blob([JSON.stringify({exercise: S.exercise, source: S.source, scope: S.view, result: displayResult()}, null, 2)], {type: "application/json"}), `smartgym_${S.exercise}_${S.view}_${Date.now()}.json`);
$("save-snapshot").onclick = () => {
  const image = document.createElement("canvas"); image.width = video.videoWidth; image.height = video.videoHeight;
  const c = image.getContext("2d");
  if ($("mirror").checked) { c.translate(image.width, 0); c.scale(-1, 1); }
  c.drawImage(video, 0, 0); if (S.running && performance.now() - S.pointsAt < 500) {
    c.fillStyle = "#d5f5a8";
    for (const [x,y,score] of S.points) { if (score >= .25) { c.beginPath(); c.arc(x*image.width, y*image.height, 3, 0, Math.PI*2); c.fill(); } }
  }
  image.toBlob((blob) => { if (blob) download(blob, `smartgym_${S.exercise}_${Date.now()}.png`); });
};
video.addEventListener("loadeddata", () => { if (video.videoWidth) mediaReady(); });
video.addEventListener("play", () => { $("pause-video").textContent = "Tạm dừng video"; });
video.addEventListener("pause", () => { $("pause-video").textContent = "Tiếp tục video"; S.points = []; });
video.addEventListener("ended", () => { stopAnalysis(false); $("pose-status").textContent = "HẾT VIDEO"; notice("Video đã kết thúc. Bấm Bắt đầu để phân tích lại hoặc xem kết quả toàn video."); });
video.addEventListener("seeking", () => { if (S.source === "video" && S.running) configure(false); });
video.addEventListener("error", () => { stopAnalysis(false); S.hasMedia = false; updateControls(); notice("Trình duyệt không đọc được video. Hãy thử tệp MP4 mã hóa H.264 hoặc WebM.", "error"); });
document.addEventListener("keydown", (event) => {
  if (/input|select|textarea/i.test(event.target.tagName) || S.busy) return;
  const index = Number(event.key) - 1;
  if (index >= 0 && index < 4 && Number.isInteger(index)) selectExercise(ORDER[index]);
});
window.addEventListener("beforeunload", () => { S.socket?.close(); if (S.stream) for (const track of S.stream.getTracks()) track.stop(); });

$("server-url").value = S.api; $("web-address").textContent = location.host;
$("api-address").textContent = new URL(S.api).host;
drawExercises(); buildRows(); mirror(); connect();
listCameras().catch(() => {});
if (video.requestVideoFrameCallback) video.requestVideoFrameCallback(onVideoFrame);
requestAnimationFrame(animate);
