const configuredApiOrigin = document.querySelector("meta[name='musicdemo-api-origin']")?.content.trim();
const API_ORIGIN = (
  configuredApiOrigin
  || (location.port === "5173"
    ? `${location.protocol}//${location.hostname || "localhost"}:8787`
    : location.origin)
).replace(/\/$/, "");
const API = `${API_ORIGIN}/api`;
const AUTH_KEY = "songseed-auth-token";
const SHARE_ORIGIN = (document.querySelector("meta[name='musicdemo-share-origin']")?.content || location.origin).replace(/\/$/, "");
const SHARE_CODE_KEY = "songseed-share-code:";

const state = {
  user: null,
  token: localStorage.getItem(AUTH_KEY) || "",
  projects: [],
  inspirations: [],
  audioInspiration: null,
  recordAudioInspiration: null,
  social: { friends: [], incomingRequests: [], outgoingRequests: [] },
  socialReady: false,
  activeFriendId: "",
  friendMessages: [],
  socialPoll: null,
  collaborationPoll: null,
  currentShareToken: "",
  receivedShares: [],
  collaborations: [],
  librarySection: "mine",
  comments: [],
  reviewMode: false,
  currentProject: null,
  currentVersion: null,
  audio: null,
  shareToken: "",
  shareCode: "",
  provider: "minimax",
  minimaxAvailable: false,
  deepseekAvailable: false,
  stemSeparationAvailable: false,
  stemSeparationSetupUrl: "",
  editStems: [],
  activeStemKey: "",
  mode: "inspiration",
  isGenerating: false,
  currentJobId: "",
  cancelRequested: false,
  workspaceReady: false,
  returnPath: "",
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const { parse: parseRoute, pathFor: routePath } = window.AppRouter;
const modeNames = { inspiration: "灵感生成", lyrics: "自写歌词", instrumental: "纯音乐" };
const inspirationModeNames = { inspiration: "关键词灵感", lyrics: "歌词草稿", instrumental: "纯音乐设想" };
const modeCopy = {
  inspiration: {
    label: "描述你的灵感",
    placeholder: "例如：凌晨两点的末班车，孤独但治愈，温暖女声，副歌有记忆点……",
    help: "MiniMax 会根据描述自动作词并生成完整歌曲。",
    limit: 500,
    button: "根据灵感生成 Demo",
  },
  lyrics: {
    label: "粘贴或写下歌词",
    placeholder: "【主歌】\n写故事发生的画面，例如：凌晨两点的末班车\n继续写人物和感受，例如：倒影里的人没有回答\n\n【副歌】\n写最想重复、最有记忆点的一句，例如：如果孤独也有根号……",
    help: "可以直接粘贴完整歌词；需要分段时，用“主歌、预副歌、副歌”作为小标题。",
    limit: 3500,
    button: "用这段歌词生成 Demo",
  },
  instrumental: {
    label: "描述纯音乐的场景",
    placeholder: "例如：雨夜城市的梦幻电子乐，缓慢渐进，氛围感合成器，适合片尾……",
    help: "只生成无人声音乐，不需要填写歌词。",
    limit: 500,
    button: "生成纯音乐 Demo",
  },
};

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  }[char]));
}

function formatDate(value) {
  return new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
    .format(new Date(value));
}

function formatTime(value) {
  const seconds = Math.max(0, Math.floor(Number(value) || 0));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function audioSource(url = "") {
  return /^https?:\/\//i.test(url) ? url : `${API_ORIGIN}${url}`;
}

function savedShareCode(token) {
  try {
    return sessionStorage.getItem(`${SHARE_CODE_KEY}${token}`) || "";
  } catch {
    return "";
  }
}

function saveShareCode(token, code) {
  try {
    if (code) sessionStorage.setItem(`${SHARE_CODE_KEY}${token}`, code);
    else sessionStorage.removeItem(`${SHARE_CODE_KEY}${token}`);
  } catch {
    // 无痕模式禁用会话存储时，仍可继续本次试听。
  }
}

async function loadReceivedShares() {
  try {
    const { receivedShares } = await request("/received-shares");
    state.receivedShares = receivedShares;
  } catch {
    state.receivedShares = [];
  }
  updateLibraryCounts();
}

async function loadCollaborations() {
  const previousSignature = state.collaborations
    .map((item) => `${item.id}:${item.updatedAt || item.createdAt || ""}`)
    .join("|");
  try {
    const { collaborations } = await request("/collaborations");
    state.collaborations = collaborations;
  } catch {
    state.collaborations = [];
  }
  updateLibraryCounts();
  const nextSignature = state.collaborations
    .map((item) => `${item.id}:${item.updatedAt || item.createdAt || ""}`)
    .join("|");
  if (previousSignature !== nextSignature && state.librarySection === "collaborations" && !$("#library-view").hidden) {
    renderCollaborationLibrary();
  }
}

function updateLibraryCounts() {
  $("#project-count").textContent = state.projects.length;
  $("#received-count").textContent = state.receivedShares.length;
  $("#collaboration-count").textContent = state.collaborations.length;
}

function rememberReceivedShare(token, data) {
  const item = {
    token,
    title: data.version.title,
    inspiration: data.project.inspiration,
    style: data.version.style,
    mood: data.version.mood,
    versionNumber: data.version.versionNumber,
    duration: data.version.duration,
    expiresAt: data.share.expiresAt,
    creatorName: data.version.creatorName || data.project.creatorName,
    savedAt: new Date().toISOString(),
  };
  state.receivedShares = [item, ...state.receivedShares.filter((saved) => saved.token !== token)].slice(0, 100);
  updateLibraryCounts();
}

function toast(message) {
  const element = $("#toast");
  element.textContent = message;
  element.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => element.classList.remove("show"), 2200);
}

async function request(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}),
      ...(options.headers || {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.error || "请求失败");
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return body;
}

function audioUploadFor(scope) {
  return scope === "record" ? state.recordAudioInspiration : state.audioInspiration;
}

function setAudioUpload(scope, upload) {
  if (scope === "record") state.recordAudioInspiration = upload;
  else state.audioInspiration = upload;
  renderAudioUploader(scope);
  if (scope !== "record") updateProviderSwitch();
}

function formatFileSize(bytes) {
  const size = Number(bytes) || 0;
  return size >= 1024 * 1024
    ? `${(size / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(size / 1024))} KB`;
}

function renderAudioUploader(scope, loadingName = "") {
  const root = $(`[data-audio-uploader="${scope}"]`);
  if (!root) return;
  const dropzone = $(".audio-dropzone", root);
  const preview = $(`[data-audio-preview="${scope}"]`, root);
  const upload = audioUploadFor(scope);
  dropzone.hidden = Boolean(upload) || Boolean(loadingName);
  preview.hidden = !upload && !loadingName;
  if (loadingName) {
    preview.innerHTML = `
      <span class="audio-file-icon">↥</span>
      <span><b>正在上传 ${escapeHtml(loadingName)}</b><small>正在保存到本机创作空间…</small></span>
      <i class="upload-spinner" aria-hidden="true"></i>
    `;
    return;
  }
  if (!upload) {
    preview.innerHTML = "";
    return;
  }
  preview.innerHTML = `
    <span class="audio-file-icon">♪</span>
    <span><b>${escapeHtml(upload.name)}</b><small>${formatFileSize(upload.size)} · 已保存到本机</small></span>
    <audio controls preload="metadata" src="${audioSource(upload.url)}"></audio>
    <button type="button" data-audio-remove="${scope}" aria-label="移除音频灵感">×</button>
  `;
  $(`[data-audio-remove="${scope}"]`, preview).addEventListener("click", () => {
    setAudioUpload(scope, null);
    const input = $(`#${scope}-audio-file`);
    if (input) input.value = "";
  });
}

async function uploadAudioInspiration(scope, file, quiet = false) {
  if (!file) return;
  const suffix = file.name.split(".").pop()?.toLowerCase();
  if (!["mp3", "wav", "m4a", "aac", "ogg", "flac", "webm", "caf", "3gp"].includes(suffix)) {
    return toast("请选择常见的音频文件");
  }
  if (file.size > 50 * 1024 * 1024) return toast("音频文件不能超过 50 MB");
  renderAudioUploader(scope, file.name);
  try {
    const response = await fetch(`${API}/uploads/audio`, {
      method: "POST",
      headers: {
        "Content-Type": file.type || "application/octet-stream",
        "X-File-Name": encodeURIComponent(file.name),
        ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}),
      },
      body: file,
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || "音频上传失败");
    setAudioUpload(scope, body.upload);
    if (!quiet) toast("音频灵感已保存，可以随时试听");
    return body.upload;
  } catch (error) {
    setAudioUpload(scope, null);
    toast(error.message);
    return null;
  }
}

function setupAudioUploaders() {
  $$("[data-audio-uploader]").forEach((root) => {
    const scope = root.dataset.audioUploader;
    const input = $(`#${scope}-audio-file`);
    $(`[data-audio-pick="${scope}"]`, root).addEventListener("click", () => input.click());
    input.addEventListener("change", () => uploadAudioInspiration(scope, input.files[0]));
    ["dragenter", "dragover"].forEach((name) => root.addEventListener(name, (event) => {
      event.preventDefault();
      root.classList.add("dragging");
    }));
    ["dragleave", "drop"].forEach((name) => root.addEventListener(name, (event) => {
      event.preventDefault();
      root.classList.remove("dragging");
    }));
    root.addEventListener("drop", (event) => uploadAudioInspiration(scope, event.dataTransfer.files[0]));
    renderAudioUploader(scope);
  });
}

let voiceRecorder = null;
let voiceStream = null;
let voiceChunks = [];
let voiceStartedAt = 0;
let voiceTimer = null;
let voicePressActive = false;
let voiceCancelled = false;

function recordingExtension(type = "") {
  if (type.includes("mp4")) return "m4a";
  if (type.includes("ogg")) return "ogg";
  if (type.includes("wav")) return "wav";
  if (type.includes("mpeg")) return "mp3";
  if (type.includes("aac")) return "aac";
  if (type.includes("3gpp")) return "3gp";
  if (type.includes("caf")) return "caf";
  return "webm";
}

function setVoiceRecordUi(active, text = "") {
  const button = $("#hold-record-button");
  button.classList.toggle("recording", active);
  $("#hold-record-text").textContent = text || (active ? "松开 保存" : "按住 说话");
  if (!active) $("#hold-record-time").textContent = "00:00";
}

function closeVoiceStream() {
  clearInterval(voiceTimer);
  voiceTimer = null;
  voiceStream?.getTracks().forEach((track) => track.stop());
  voiceStream = null;
}

async function autoSaveVoiceInspiration(file) {
  const button = $("#hold-record-button");
  button.disabled = true;
  setVoiceRecordUi(false, "正在保存");
  const upload = await uploadAudioInspiration("record", file, true);
  if (!upload) {
    button.disabled = false;
    setVoiceRecordUi(false);
    return;
  }
  const writtenContent = $("#inspiration-record-content").value.trim();
  const content = writtenContent || `语音灵感 · ${new Date().toLocaleString("zh-CN", {
    month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit",
  })}`;
  try {
    const { inspiration } = await request("/inspirations", {
      method: "POST",
      body: JSON.stringify({ content, audioInspiration: upload }),
    });
    state.inspirations.unshift(inspiration);
    $("#inspiration-record-form").reset();
    state.recordAudioInspiration = null;
    renderAudioUploader("record");
    renderInspirations();
    toast("录音已自动保存到灵感记录");
  } catch (error) {
    toast(`${error.message}，录音仍保留在编辑区`);
  } finally {
    button.disabled = false;
    setVoiceRecordUi(false);
  }
}

async function startVoiceRecording(event) {
  if (event.type === "pointerdown" && event.button !== 0) return;
  if (event.repeat || voicePressActive) return;
  event.preventDefault();
  voicePressActive = true;
  voiceCancelled = false;

  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    voicePressActive = false;
    setVoiceRecordUi(false);
    toast(window.isSecureContext
      ? "当前浏览器不支持网页录音，请换用最新版 Chrome 或 Safari"
      : "麦克风需要安全连接，请使用 HTTPS 地址打开页面");
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    if (!voicePressActive) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }
    voiceStream = stream;
    const types = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"];
    const mimeType = types.find((type) => MediaRecorder.isTypeSupported(type)) || "";
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    voiceRecorder = recorder;
    voiceChunks = [];
    voiceStartedAt = Date.now();
    recorder.addEventListener("dataavailable", (item) => {
      if (item.data.size) voiceChunks.push(item.data);
    });
    recorder.addEventListener("stop", () => {
      const elapsed = Date.now() - voiceStartedAt;
      const cancelled = voiceCancelled || elapsed < 500;
      const type = recorder.mimeType || mimeType || "audio/webm";
      const chunks = voiceChunks;
      voiceRecorder = null;
      voiceChunks = [];
      closeVoiceStream();
      setVoiceRecordUi(false);
      if (cancelled || !chunks.length) {
        if (elapsed < 500 && !voiceCancelled) toast("录音时间太短，请按住后再说话");
        return;
      }
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const file = new File(chunks, `语音灵感-${stamp}.${recordingExtension(type)}`, { type });
      autoSaveVoiceInspiration(file);
    });
    recorder.start(250);
    setVoiceRecordUi(true);
    voiceTimer = setInterval(() => {
      const seconds = Math.floor((Date.now() - voiceStartedAt) / 1000);
      $("#hold-record-time").textContent = formatTime(seconds);
      if (seconds >= 60) finishVoiceRecording(null, false);
    }, 250);
  } catch (error) {
    voicePressActive = false;
    closeVoiceStream();
    setVoiceRecordUi(false);
    toast(error.name === "NotAllowedError" ? "请允许浏览器使用麦克风后再试" : "无法开始录音，请检查麦克风");
  }
}

function finishVoiceRecording(event, cancel = false) {
  event?.preventDefault();
  voicePressActive = false;
  voiceCancelled = cancel;
  if (voiceRecorder?.state === "recording") voiceRecorder.stop();
}

function setupVoiceRecorder() {
  const button = $("#hold-record-button");
  const directRecording = Boolean(
    window.isSecureContext && navigator.mediaDevices?.getUserMedia && window.MediaRecorder
  );
  if (window.PointerEvent) {
    button.addEventListener("pointerdown", startVoiceRecording);
    button.addEventListener("pointerup", (event) => finishVoiceRecording(event));
    button.addEventListener("pointercancel", (event) => finishVoiceRecording(event, true));
  } else {
    button.addEventListener("touchstart", startVoiceRecording, { passive: false });
    button.addEventListener("touchend", (event) => finishVoiceRecording(event), { passive: false });
    button.addEventListener("touchcancel", (event) => finishVoiceRecording(event, true), { passive: false });
  }
  button.addEventListener("contextmenu", (event) => event.preventDefault());
  button.addEventListener("keydown", (event) => {
    if (event.key === " " || event.key === "Enter") startVoiceRecording(event);
  });
  button.addEventListener("keyup", (event) => {
    if (event.key === " " || event.key === "Enter") finishVoiceRecording(event);
  });
  if (!directRecording) {
    button.classList.add("microphone-unavailable");
    $("#voice-record-help").textContent = window.isSecureContext
      ? "当前浏览器不支持网页录音，请使用最新版 Chrome 或 Safari"
      : "局域网 HTTP 无法直接调用麦克风，请改用 HTTPS；上传音频仍可使用";
  }
}

let authMode = "login";

function setAuthMode(mode) {
  authMode = mode === "register" ? "register" : "login";
  const registering = authMode === "register";
  const sharing = Boolean(state.shareToken);
  $("#auth-title").textContent = registering ? "创建你的创作账户" : sharing ? "选择试听身份" : "登录 SongSeed";
  $("#auth-copy").textContent = registering
    ? "保存属于你的灵感、Demo 和协作记录。"
    : sharing ? "登录后可保存这次分享，也可以直接以游客身份试听。" : "回到你的灵感、Demo 和协作评价。";
  $("#auth-submit-text").textContent = registering ? "注册账户" : "登录";
  $("#auth-toggle").textContent = registering ? "已有账户？返回登录" : "没有账户？立即注册";
  $("#auth-password").autocomplete = registering ? "new-password" : "current-password";
  $("#guest-button").hidden = !sharing;
}

function showAuth() {
  $("#auth-screen").hidden = false;
  document.body.classList.add("auth-open");
  setTimeout(() => $("#auth-username").focus(), 0);
}

function hideAuth() {
  $("#auth-screen").hidden = true;
  document.body.classList.remove("auth-open");
}

function showAccount(user) {
  state.user = user;
  $("#account-name").textContent = user.username;
  $("#account-avatar").textContent = user.username.slice(0, 1).toUpperCase();
  $("#comment-author").value = user.username;
}

async function restoreSession() {
  if (!state.token) return false;
  try {
    const { user } = await request("/auth/me");
    showAccount(user);
    return true;
  } catch {
    state.token = "";
    localStorage.removeItem(AUTH_KEY);
    return false;
  }
}

async function submitAuth(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = $("button[type='submit']", form);
  const submittingMode = authMode;
  const username = $("#auth-username").value.trim();
  button.disabled = true;
  $("#auth-submit-text").textContent = submittingMode === "register" ? "正在注册…" : "正在登录…";
  try {
    const result = await request(`/auth/${submittingMode}`, {
      method: "POST",
      body: JSON.stringify({
        username,
        password: $("#auth-password").value,
      }),
    });
    if (submittingMode === "register") {
      setAuthMode("login");
      $("#auth-username").value = username;
      $("#auth-password").value = "";
      if (!state.shareToken) {
        const next = state.returnPath || new URLSearchParams(location.search).get("next") || routePath("studio");
        setRoute(`${routePath("login")}?next=${encodeURIComponent(next)}`, true);
      }
      $("#auth-password").focus();
      toast("注册成功，请登录");
      return;
    }
    state.token = result.token;
    localStorage.setItem(AUTH_KEY, result.token);
    showAccount(result.user);
    hideAuth();
    form.reset();
    if (state.shareToken) {
      await openSharedDemo();
    } else {
      await initializeWorkspace();
      const target = state.returnPath || new URLSearchParams(location.search).get("next") || routePath("studio");
      state.returnPath = "";
      history.replaceState({}, "", target);
      await applyCurrentRoute();
    }
    toast(`欢迎回来，${result.user.username}`);
  } catch (error) {
    toast(error.message);
  } finally {
    button.disabled = false;
    $("#auth-submit-text").textContent = authMode === "register" ? "注册账户" : "登录";
  }
}

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function waitForGeneration(jobId, pollInterval) {
  while (true) {
    const job = await request(`/jobs/${jobId}`);
    if (job.status === "ready") return job.result;
    if (job.status === "cancelled") {
      const error = new Error(job.message || "歌曲生成已暂停");
      error.cancelled = true;
      throw error;
    }
    if (job.status === "failed") {
      const error = new Error(job.error || job.message || "生成失败");
      error.status = job.errorStatus || 500;
      error.body = job;
      throw error;
    }
    await wait(pollInterval);
  }
}

async function requestMusic(path, input, headers = {}) {
  const submit = async (payload) => {
    const response = await request(path, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
    if (response.jobId && state.isGenerating) {
      state.currentJobId = response.jobId;
      if (state.cancelRequested) {
        await request(`/jobs/${response.jobId}/cancel`, { method: "POST" });
      }
    }
    return response.jobId
      ? waitForGeneration(response.jobId, payload.provider === "local" ? 200 : 1000)
      : response;
  };
  try {
    return await submit(input);
  } catch (error) {
    const canUseLocal = input.provider === "minimax" && error.body?.fallbackAvailable;
    if (!canUseLocal) throw error;
    const useLocal = confirm(
      `${error.message}\n\n是否改用本地极速合成生成一段器乐试听？`
    );
    if (!useLocal) throw error;
    showGenerating("正在生成本地试听", "local");
    return submit({ ...input, provider: "local" });
  }
}

function switchView(name) {
  if (state.audio) state.audio.pause();
  const editorAudio = $("#edit-audio");
  if (name !== "editor" && editorAudio) editorAudio.pause();
  $$(".view").forEach((view) => { view.hidden = view.id !== `${name}-view`; });
  $$(".nav-link").forEach((button) => button.classList.toggle("active", button.dataset.view === name));
  $("#my-menu").classList.toggle("active", name === "library");
  if (name === "library") renderLibrary();
  if (name === "inspirations") loadInspirations();
  scrollTo({ top: 0, behavior: "smooth" });
}

function setRoute(path, replace = false) {
  if (`${location.pathname}${location.search}` === path) return;
  history[replace ? "replaceState" : "pushState"]({}, "", path);
}

function showInspirations(updateRoute = true) {
  switchView("inspirations");
  if (updateRoute) setRoute(routePath("inspirations"));
}

function openLibrary(section, updateRoute = true) {
  state.librarySection = ["received", "collaborations"].includes(section) ? section : "mine";
  $("#my-menu").removeAttribute("open");
  switchView("library");
  if (updateRoute) {
    const route = state.librarySection === "mine" ? "library" : state.librarySection;
    setRoute(routePath(route));
  }
}

async function loadProjects() {
  try {
    const { projects } = await request("/projects");
    state.projects = projects;
    updateLibraryCounts();
  } catch {
    toast("无法连接本地服务，请确认项目已启动");
  }
}

function renderInspirations() {
  const list = $("#inspiration-record-list");
  $("#inspiration-record-count").textContent = `${state.inspirations.length} 条`;
  if (!state.inspirations.length) {
    list.innerHTML = `<div class="empty-inspirations"><span>♫</span><p>还没有记录，先留下此刻的一句话。</p></div>`;
    return;
  }
  list.innerHTML = state.inspirations.map((item) => `
    <article class="inspiration-record" data-inspiration-record="${item.id}">
      <span class="inspiration-mode">${inspirationModeNames[item.mode] || inspirationModeNames.inspiration}</span>
      <p>${escapeHtml(item.content)}</p>
      ${item.audioInspiration ? `
        <div class="inspiration-audio">
          <span>♪ ${escapeHtml(item.audioInspiration.name)}</span>
          <audio controls preload="metadata" src="${escapeHtml(audioSource(item.audioInspiration.url))}"></audio>
        </div>
      ` : ""}
      <div>
        <small>${formatDate(item.createdAt)}</small>
        <span>
          <button type="button" data-inspiration-use>拿去创作</button>
          <button type="button" data-inspiration-delete>删除</button>
        </span>
      </div>
    </article>
  `).join("");

  $$("[data-inspiration-use]", list).forEach((button) => button.addEventListener("click", () => {
    const item = state.inspirations.find(
      (saved) => saved.id === button.closest("[data-inspiration-record]").dataset.inspirationRecord
    );
    if (!item) return;
    state.mode = modeCopy[item.mode] ? item.mode : "inspiration";
    state.audioInspiration = item.audioInspiration || null;
    updateCreationMode();
    $("#inspiration").value = item.content;
    $("#char-count").textContent = item.content.length;
    renderAudioUploader("studio");
    showCreationWorkspace();
    toast("已把这条灵感带到创作台");
  }));

  $$("[data-inspiration-delete]", list).forEach((button) => button.addEventListener("click", async () => {
    const card = button.closest("[data-inspiration-record]");
    if (!confirm("确认删除这条灵感记录吗？")) return;
    try {
      await request(`/inspirations/${card.dataset.inspirationRecord}`, { method: "DELETE" });
      state.inspirations = state.inspirations.filter((item) => item.id !== card.dataset.inspirationRecord);
      renderInspirations();
      toast("灵感记录已删除");
    } catch (error) {
      toast(error.message);
    }
  }));
}

async function loadInspirations() {
  $("#inspiration-record-list").innerHTML = `<div class="empty-inspirations"><p>正在加载灵感记录…</p></div>`;
  try {
    const { inspirations } = await request("/inspirations");
    state.inspirations = inspirations;
    renderInspirations();
  } catch (error) {
    $("#inspiration-record-list").innerHTML = `<div class="empty-inspirations"><p>${escapeHtml(error.message)}</p></div>`;
  }
}

function updateShareFriendOptions() {
  const select = $("#share-friend-select");
  if (!select) return;
  const selected = select.value;
  select.innerHTML = state.social.friends.length
    ? state.social.friends.map((friend) => (
      `<option value="${escapeHtml(friend.id)}">${escapeHtml(friend.username)}</option>`
    )).join("")
    : `<option value="">还没有好友</option>`;
  if (state.social.friends.some((friend) => friend.id === selected)) select.value = selected;
  $("#share-to-friend").disabled = !state.social.friends.length || !state.currentShareToken;
}

function renderSocial() {
  const { friends, incomingRequests, outgoingRequests } = state.social;
  $("#friend-request-count").textContent = incomingRequests.length;
  const notificationCount = incomingRequests.length
    + friends.reduce((sum, friend) => sum + Number(friend.unread || 0), 0);
  $("#friend-unread-count").textContent = friends.reduce((sum, friend) => sum + Number(friend.unread || 0), 0);
  $("#friend-nav-badge").textContent = notificationCount;
  $("#friend-nav-badge").hidden = notificationCount === 0;

  $("#friend-request-list").innerHTML = [
    ...incomingRequests.map((item) => `
      <article class="friend-request-card">
        <span class="friend-avatar">${escapeHtml(item.username.slice(0, 1).toUpperCase())}</span>
        <div><b>${escapeHtml(item.username)}</b><small>请求添加你为好友</small></div>
        <span class="friend-request-actions">
          <button type="button" data-friend-request="${item.id}" data-action="accept">接受</button>
          <button type="button" data-friend-request="${item.id}" data-action="reject">忽略</button>
        </span>
      </article>
    `),
    ...outgoingRequests.map((item) => `
      <article class="friend-request-card waiting">
        <span class="friend-avatar">${escapeHtml(item.username.slice(0, 1).toUpperCase())}</span>
        <div><b>${escapeHtml(item.username)}</b><small>好友申请已发送</small></div>
      </article>
    `),
  ].join("") || `<p class="friend-empty">暂无好友申请</p>`;

  $("#friend-list").innerHTML = friends.length
    ? friends.map((friend) => `
      <button type="button" class="friend-row${friend.id === state.activeFriendId ? " active" : ""}" data-friend-id="${escapeHtml(friend.id)}">
        <span class="friend-avatar">${escapeHtml(friend.username.slice(0, 1).toUpperCase())}</span>
        <span><b>${escapeHtml(friend.username)}</b><small>${friend.unread ? `${friend.unread} 条新消息` : "点击开始聊天"}</small></span>
        ${friend.unread ? `<em>${friend.unread}</em>` : `<i>›</i>`}
      </button>
    `).join("")
    : `<p class="friend-empty">还没有好友，先从上方搜索添加吧</p>`;

  $$("[data-friend-request]").forEach((button) => button.addEventListener("click", async () => {
    const accepting = button.dataset.action === "accept";
    if (!confirm(`确认${accepting ? "接受" : "忽略"}这条好友申请吗？`)) return;
    try {
      await request(`/friend-requests/${button.dataset.friendRequest}`, {
        method: "PATCH",
        body: JSON.stringify({ action: button.dataset.action }),
      });
      await loadSocial(true);
      toast(accepting ? "已成为好友，现在可以聊天了" : "已忽略好友申请");
    } catch (error) {
      toast(error.message);
    }
  }));
  $$("[data-friend-id]").forEach((button) => button.addEventListener("click", () => openFriendChat(button.dataset.friendId)));
  updateShareFriendOptions();
}

async function loadSocial(silent = false) {
  if (!state.token || state.user?.guest) return;
  const previousIncoming = state.social.incomingRequests.length;
  const wasReady = state.socialReady;
  try {
    state.social = await request("/friends");
    state.socialReady = true;
    renderSocial();
    if (state.social.incomingRequests.length > previousIncoming) {
      $("#add-friend-panel").open = true;
      if (!silent || wasReady) toast("你收到了一条新的好友申请");
    }
  } catch (error) {
    if (!silent) toast(error.message);
  }
}

async function searchFriends(event) {
  event.preventDefault();
  const keyword = $("#friend-search-input").value.trim();
  if (!keyword) return toast("请输入要搜索的用户名");
  const exact = $("#friend-search-mode").value === "exact";
  const results = $("#friend-search-results");
  results.innerHTML = `<p class="friend-empty">正在搜索…</p>`;
  try {
    const { users } = await request(`/users/search?q=${encodeURIComponent(keyword)}&exact=${exact ? 1 : 0}`);
    const labels = {
      friend: "已经是好友",
      requested: "等待对方接受",
      incoming: "请处理对方申请",
      none: "添加朋友",
    };
    results.innerHTML = users.length ? users.map((user) => `
      <article class="friend-search-result">
        <span class="friend-avatar">${escapeHtml(user.username.slice(0, 1).toUpperCase())}</span>
        <b>${escapeHtml(user.username)}</b>
        <button type="button" data-add-friend="${escapeHtml(user.id)}" ${user.relation !== "none" ? "disabled" : ""}>
          ${labels[user.relation] || labels.none}
        </button>
      </article>
    `).join("") : `<p class="friend-empty">没有找到匹配的注册用户</p>`;
    $$("[data-add-friend]", results).forEach((button) => button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        await request("/friend-requests", {
          method: "POST",
          body: JSON.stringify({ userId: button.dataset.addFriend }),
        });
        button.textContent = "等待对方接受";
        await loadSocial(true);
        toast("好友申请已发送");
      } catch (error) {
        button.disabled = false;
        toast(error.message);
      }
    }));
  } catch (error) {
    results.innerHTML = `<p class="friend-empty">${escapeHtml(error.message)}</p>`;
  }
}

async function openFriendChat(friendId) {
  state.activeFriendId = friendId;
  const friend = state.social.friends.find((item) => item.id === friendId);
  if (!friend) return;
  $("#friend-list").hidden = true;
  $("#friend-chat").hidden = false;
  $("#friend-chat-name").textContent = friend.username;
  renderSocial();
  await loadFriendMessages();
}

function renderFriendMessages() {
  const container = $("#friend-messages");
  container.innerHTML = state.friendMessages.length
    ? state.friendMessages.map((message) => {
      const mine = message.senderId === state.user?.id;
      const content = message.kind === "demo"
        ? `<a href="${routePath("share", { token: message.shareToken })}"><b>${escapeHtml(message.content)}</b><span>打开 Demo ›</span></a>`
        : `<p>${escapeHtml(message.content)}</p>`;
      return `<article class="friend-message ${mine ? "mine" : ""} ${message.kind === "demo" ? "demo-message" : ""}">
        ${content}<small>${formatDate(message.createdAt)}</small>
      </article>`;
    }).join("")
    : `<p class="friend-empty">还没有消息，打个招呼吧</p>`;
  container.scrollTop = container.scrollHeight;
}

async function loadFriendMessages(silent = false) {
  if (!state.activeFriendId) return;
  try {
    const { messages } = await request(`/friends/${state.activeFriendId}/messages`);
    state.friendMessages = messages;
    renderFriendMessages();
  } catch (error) {
    if (!silent) toast(error.message);
  }
}

async function sendFriendMessage(event) {
  event.preventDefault();
  const input = $("#friend-message-input");
  const content = input.value.trim();
  if (!content || !state.activeFriendId) return;
  try {
    await request(`/friends/${state.activeFriendId}/messages`, {
      method: "POST",
      body: JSON.stringify({ content }),
    });
    input.value = "";
    await loadFriendMessages(true);
  } catch (error) {
    toast(error.message);
  }
}

async function saveInspiration(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const writtenContent = $("#inspiration-record-content").value.trim();
  const content = writtenContent || (
    state.recordAudioInspiration ? `音频灵感：${state.recordAudioInspiration.name}` : ""
  );
  if (!content) return toast("写下一句话，或上传一段音频灵感吧");
  if (!confirm("确认保存这条灵感吗？")) return;
  const button = $("button[type='submit']", form);
  button.disabled = true;
  $("span", button).textContent = "正在保存…";
  try {
    const { inspiration } = await request("/inspirations", {
      method: "POST",
      body: JSON.stringify({
        content,
        audioInspiration: state.recordAudioInspiration,
      }),
    });
    state.inspirations.unshift(inspiration);
    form.reset();
    state.recordAudioInspiration = null;
    renderAudioUploader("record");
    renderInspirations();
    toast("灵感已经替你收好");
  } catch (error) {
    toast(error.message);
  } finally {
    button.disabled = false;
    $("span", button).textContent = "保存这条灵感";
  }
}

async function saveCurrentDraft() {
  const writtenContent = $("#inspiration").value.trim();
  const content = writtenContent || (
    state.audioInspiration ? `音频灵感：${state.audioInspiration.name}` : ""
  );
  if (content.length < 2) return toast("写下至少两个字，或上传一段音频再暂存吧");
  const type = inspirationModeNames[state.mode];
  if (!confirm(`确认把当前${type}暂存到灵感记录吗？`)) return;
  const button = $("#save-draft-button");
  button.disabled = true;
  $("span", button).textContent = "正在暂存…";
  try {
    const { inspiration } = await request("/inspirations", {
      method: "POST",
      body: JSON.stringify({
        content,
        mode: state.mode,
        audioInspiration: state.audioInspiration,
      }),
    });
    state.inspirations = [inspiration, ...state.inspirations.filter((item) => item.id !== inspiration.id)];
    toast(`${type}已存入灵感记录`);
  } catch (error) {
    toast(error.message);
  } finally {
    button.disabled = false;
    $("span", button).textContent = "暂存灵感";
  }
}

async function loadMeta() {
  try {
    const meta = await request("/meta");
    state.minimaxAvailable = meta.minimaxAvailable;
    state.deepseekAvailable = meta.deepseekAvailable;
    state.stemSeparationAvailable = Boolean(meta.stemSeparationAvailable);
    state.stemSeparationSetupUrl = meta.stemSeparationSetupUrl || "";
    if (!state.minimaxAvailable) state.provider = "local";
  } catch {
    state.provider = "local";
  }
  updateProviderSwitch();
  updateDeepseekOption();
}

function updateProviderSwitch() {
  $$(".provider-option").forEach((button) => {
    button.disabled = button.dataset.provider === "minimax" && !state.minimaxAvailable;
    button.classList.toggle("active", button.dataset.provider === state.provider);
  });
  const note = $("#generation-note");
  if (!note) return;
  note.innerHTML = state.provider === "minimax"
    ? state.audioInspiration
      ? "<span>✓</span> MiniMax music-cover-free · 将上传的哼唱作为真实参考音频完成编曲 · 失败后可选择本地试听"
      : `<span>✓</span> MiniMax 免费接口 · ${state.mode === "instrumental" ? "生成无人声音乐" : "生成完整歌曲"} · 失败后可选择本地试听`
    : "<span>✓</span> 完全本地生成 · 无需网络 · 灵感不会离开电脑";
}

function updateCreationMode() {
  const copy = modeCopy[state.mode];
  $$(".mode-option").forEach((button) => {
    const active = button.dataset.mode === state.mode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  $("#inspiration-label").textContent = copy.label;
  $("#inspiration").placeholder = copy.placeholder;
  $("#inspiration").maxLength = copy.limit;
  $("#inspiration-help").textContent = copy.help;
  $("#char-count").textContent = $("#inspiration").value.length;
  $("#char-limit").textContent = copy.limit;
  $("#vocal-setting").hidden = state.mode === "instrumental";
  $("#lyrics-assistant").hidden = state.mode !== "lyrics";
  if (!state.isGenerating) $("#generate-button span").textContent = copy.button;
  updateProviderSwitch();
  updateDeepseekOption();
}

function updateDeepseekOption() {
  const button = $("#deepseek-button");
  if (!button) return;
  button.disabled = !state.deepseekAvailable;
  $("#deepseek-status").textContent = state.deepseekAvailable
    ? "已连接 · Cloudflare 每日免费额度"
    : "未配置 · 查看 README 获取免费 Key";
}

function waveform(seed = 1) {
  return Array.from({ length: 58 }, (_, index) => {
    const wave = Math.abs(Math.sin((index + seed % 11) * 0.52));
    const wobble = ((seed >> (index % 12)) & 7) / 12;
    const height = Math.round(16 + (wave * 58) + (wobble * 24));
    return `<i style="--h:${height}px;--n:${index}"></i>`;
  }).join("");
}

function renderLyrics(lyrics, shared = false) {
  if (!lyrics?.length) {
    return `<p class="${shared ? "shared-lyrics " : ""}arrangement">这是纯音乐版本，没有人声歌词。</p>`;
  }
  return `<div class="${shared ? "shared-lyrics" : ""}">${lyrics.map((section) => `
    <div class="lyrics-section">
      <b>${escapeHtml(section.name)}</b>
      <p>${section.lines.map(escapeHtml).join("<br>")}</p>
    </div>
  `).join("")}</div>`;
}

function setupAudio(version, root = $("#preview-panel")) {
  if (state.audio) state.audio.pause();
  const source = /^https?:\/\//i.test(version.audioUrl)
    ? version.audioUrl
    : `${API_ORIGIN}${version.audioUrl}`;
  const audio = new Audio(source);
  state.audio = audio;
  const play = $(".play-button", root);
  const progress = $(".seek span", root);
  const seek = $(".seek", root);
  const time = $(".time", root);
  let dragging = false;
  let pendingSeek = null;

  const setCurrentTime = (seconds) => {
    const duration = Number.isFinite(audio.duration) && audio.duration > 0
      ? audio.duration
      : Number(version.duration) || 0;
    if (!duration) return;
    const current = Math.max(0, Math.min(duration, seconds));
    if (audio.readyState) audio.currentTime = current;
    else pendingSeek = current;
    progress.style.width = `${(current / duration) * 100}%`;
    time.textContent = `${formatTime(current)} / ${formatTime(version.duration)}`;
    seek.setAttribute("aria-valuenow", String(Math.round(current)));
    seek.setAttribute("aria-valuetext", formatTime(current));
  };

  const seekTo = (clientX) => {
    const rect = seek.getBoundingClientRect();
    const percent = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    setCurrentTime(percent * (audio.duration || version.duration));
  };

  seek.tabIndex = 0;
  seek.setAttribute("aria-valuemin", "0");
  seek.setAttribute("aria-valuemax", String(Math.round(version.duration)));

  play.addEventListener("click", () => {
    if (audio.paused) audio.play();
    else audio.pause();
  });
  audio.addEventListener("play", () => {
    play.textContent = "Ⅱ";
    root.classList.add("playing");
  });
  audio.addEventListener("pause", () => {
    play.textContent = "▶";
    root.classList.remove("playing");
  });
  audio.addEventListener("loadedmetadata", () => {
    if (pendingSeek !== null) {
      audio.currentTime = pendingSeek;
      pendingSeek = null;
    }
  });
  audio.addEventListener("timeupdate", () => {
    const percent = audio.duration ? (audio.currentTime / audio.duration) * 100 : 0;
    progress.style.width = `${percent}%`;
    time.textContent = `${formatTime(audio.currentTime)} / ${formatTime(version.duration)}`;
    seek.setAttribute("aria-valuenow", String(Math.round(audio.currentTime)));
    seek.setAttribute("aria-valuetext", formatTime(audio.currentTime));
  });
  audio.addEventListener("ended", () => {
    audio.currentTime = 0;
    progress.style.width = "0";
  });
  seek.addEventListener("pointerdown", (event) => {
    dragging = true;
    seek.classList.add("dragging");
    seek.setPointerCapture(event.pointerId);
    seekTo(event.clientX);
  });
  seek.addEventListener("pointermove", (event) => {
    if (dragging) seekTo(event.clientX);
  });
  const stopDragging = () => {
    dragging = false;
    seek.classList.remove("dragging");
  };
  seek.addEventListener("pointerup", stopDragging);
  seek.addEventListener("pointercancel", stopDragging);
  seek.addEventListener("keydown", (event) => {
    const duration = audio.duration || version.duration;
    if (!duration || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    if (event.key === "Home") setCurrentTime(0);
    else if (event.key === "End") setCurrentTime(duration);
    else setCurrentTime(audio.currentTime + (event.key === "ArrowRight" ? 5 : -5));
  });
}

const commentStatusText = {
  pending: "待处理",
  accepted: "已接受",
  rejected: "不接受",
};

function renderCommentList(project, version) {
  const list = $("#comment-list");
  $("#comment-count").textContent = `${state.comments.length} 条`;
  if (!state.comments.length) {
    list.innerHTML = `<div class="empty-comments"><p>还没有评价，先写下第一条修改意见。</p></div>`;
    return;
  }
  list.innerHTML = state.comments.map((comment) => `
    <article class="comment-card" data-comment="${comment.id}">
      <div class="comment-card-head">
        <strong>${escapeHtml(comment.author || "匿名")}</strong>
        <span class="comment-status ${comment.status}">${commentStatusText[comment.status] || "待处理"}</span>
      </div>
      <p>${escapeHtml(comment.content)}</p>
      <div class="comment-card-footer">
        <small>${escapeHtml(comment.source)} · ${escapeHtml(comment.section)} · ${formatDate(comment.createdAt)}</small>
        <div class="comment-status-actions">
          <button type="button" class="${comment.status === "accepted" ? "accepted" : ""}" data-comment-status="accepted">接受</button>
          <button type="button" class="${comment.status === "rejected" ? "rejected" : ""}" data-comment-status="rejected">不接受</button>
        </div>
      </div>
      <div class="comment-replies">
        ${(comment.replies || []).map((reply) => `
          <div class="comment-reply">
            <small><b>${escapeHtml(reply.author || "我")}</b> · ${formatDate(reply.createdAt)}</small>
            <p>${escapeHtml(reply.content)}</p>
          </div>
        `).join("")}
        <form class="comment-reply-form" data-comment-reply>
          <input name="reply" maxlength="300" required placeholder="回复这条评价…">
          <button type="submit">回复</button>
        </form>
      </div>
    </article>
  `).join("");

  $$("[data-comment-status]", list).forEach((button) => button.addEventListener("click", async () => {
    const card = button.closest(".comment-card");
    const comment = state.comments.find((item) => item.id === card.dataset.comment);
    const status = button.dataset.commentStatus;
    if (!comment || comment.status === status) return;
    const label = status === "accepted" ? "接受" : "不接受";
    if (!confirm(`确认将这条评价标记为“${label}”吗？`)) return;
    try {
      const { comment: updated } = await request(
        `/projects/${project.id}/versions/${version.id}/comments/${comment.id}`,
        { method: "PATCH", body: JSON.stringify({ status }) }
      );
      state.comments = state.comments.map((item) => item.id === updated.id ? updated : item);
      renderCommentList(project, version);
      toast(`已标记为${label}`);
    } catch (error) {
      toast(error.message);
    }
  }));

  $$("[data-comment-reply]", list).forEach((form) => form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const card = form.closest(".comment-card");
    const comment = state.comments.find((item) => item.id === card.dataset.comment);
    const input = $("input[name='reply']", form);
    const content = input.value.trim();
    if (!comment || content.length < 2) return toast("回复请至少写两个字");
    const button = $("button[type='submit']", form);
    button.disabled = true;
    try {
      const { comment: updated } = await request(
        `/projects/${project.id}/versions/${version.id}/comments/${comment.id}/replies`,
        { method: "POST", body: JSON.stringify({ content }) }
      );
      state.comments = state.comments.map((item) => item.id === updated.id ? updated : item);
      renderCommentList(project, version);
      toast("回复已保存");
    } catch (error) {
      toast(error.message);
    } finally {
      button.disabled = false;
    }
  }));
}

async function loadVersionComments(project, version) {
  $("#review-version-title").textContent = `${version.title} · VERSION ${version.versionNumber}`;
  $("#comment-list").innerHTML = `<div class="empty-comments"><p>正在加载历史评价…</p></div>`;
  try {
    const { comments } = await request(`/projects/${project.id}/versions/${version.id}/comments`);
    state.comments = comments;
    renderCommentList(project, version);
  } catch (error) {
    state.comments = [];
    $("#comment-count").textContent = "0 条";
    $("#comment-list").innerHTML = `<div class="empty-comments"><p>${escapeHtml(error.message)}</p></div>`;
  }
}

function showCreationWorkspace(updateRoute = true) {
  state.reviewMode = false;
  $("#variation-field").hidden = true;
  $("#creation-form").hidden = false;
  $("#review-panel").hidden = true;
  switchView("studio");
  if (updateRoute) setRoute(routePath("studio"));
}

function openReviewWorkspace(project, version, updateRoute = true) {
  state.reviewMode = true;
  $("#creation-form").hidden = true;
  $("#review-panel").hidden = false;
  switchView("studio");
  renderResult(project, version);
  if (updateRoute) setRoute(routePath("demo", { projectId: project.id, versionId: version.id }));
}

function renderResult(project, version) {
  state.currentProject = project;
  state.currentVersion = version;
  $("#variation-field").hidden = false;
  const panel = $("#preview-panel");
  panel.className = "preview-panel result-state";
  panel.innerHTML = `
    <div class="result-content">
      <div class="result-top">
        <div>
          <p class="eyebrow">GENERATED LOCALLY</p>
          <h2>${escapeHtml(version.title)}</h2>
          ${renderCreatorMark(project, version)}
          <div class="result-meta">
            <span>${modeNames[version.mode] || "灵感生成"}</span>
            <span>${escapeHtml(version.style)}</span>
            ${version.subgenre ? `<span>${escapeHtml(version.subgenre)}</span>` : ""}
            <span>${escapeHtml(version.mood)}</span>
            ${version.instrument ? `<span>${escapeHtml(version.instrument)}</span>` : ""}
            ${version.mature ? "<span>成熟版</span>" : ""}
            ${renderCoCreationMark(version)}
            ${version.variation ? `<span>${escapeHtml(version.variation)}变化</span>` : ""}
            <span>${version.bpm} BPM</span>
            ${version.meter ? `<span>${escapeHtml(version.meter)}</span>` : ""}
            <span>${escapeHtml(version.key)}</span>
            <span>${version.provider === "minimax-cover" ? "MiniMax 哼唱编曲" : version.provider === "minimax" ? "MiniMax AI" : version.provider === "local-fallback" ? "本地降级" : "本地合成"}</span>
            ${version.cacheStatus === "downloading" ? "<span>后台保存中</span>" : ""}
          </div>
        </div>
        <details class="result-version-selector">
          <summary class="version-badge">VERSION ${version.versionNumber}<i aria-hidden="true"></i></summary>
          <div class="result-version-dropdown">
            ${project.versions.map((item) => `
              <button type="button" class="${item.id === version.id ? "active" : ""}" data-result-version="${item.id}">
                <b>VERSION ${item.versionNumber}</b>
                <small>${escapeHtml(item.versionName || item.style)} · ${item.bpm} BPM${item.mature ? " · 接力版" : ""}</small>
              </button>
            `).join("")}
          </div>
        </details>
      </div>
      <div class="waveform" aria-label="Demo 音频波形">${waveform(version.seed)}</div>
      <div class="player">
        <button class="play-button" type="button" aria-label="播放或暂停">▶</button>
        <div class="seek" role="slider" aria-label="播放进度"><span></span></div>
        <span class="time">0:00 / ${formatTime(version.duration)}</span>
      </div>
      <div class="result-tabs">
        <button class="result-tab active" type="button" data-tab="lyrics">歌词</button>
        <button class="result-tab" type="button" data-tab="arrangement">编曲构想</button>
        <button class="result-tab" type="button" data-tab="versions">版本</button>
      </div>
      <div class="result-body">${renderLyrics(version.lyrics)}</div>
      <div class="result-actions">
        <button type="button" data-action="regenerate">＋ 新版本</button>
        <button type="button" data-action="copy-prompt">复制成品提示词</button>
        <button type="button" class="danger" data-action="delete-version">删除当前版本</button>
        <button type="button" class="accent" data-action="share">分享 Demo</button>
      </div>
    </div>
  `;
  setupAudio(version, panel);

  $$("[data-result-version]", panel).forEach((button) => button.addEventListener("click", () => {
    const selected = project.versions.find((item) => item.id === button.dataset.resultVersion);
    renderResult(project, selected);
    if (state.reviewMode) setRoute(routePath("demo", { projectId: project.id, versionId: selected.id }));
  }));

  $$(".result-tab", panel).forEach((button) => button.addEventListener("click", () => {
    $$(".result-tab", panel).forEach((item) => item.classList.toggle("active", item === button));
    const body = $(".result-body", panel);
    if (button.dataset.tab === "lyrics") body.innerHTML = renderLyrics(version.lyrics);
    if (button.dataset.tab === "arrangement") {
      body.innerHTML = `<p class="arrangement">${escapeHtml(version.arrangement)}</p>`;
    }
    if (button.dataset.tab === "versions") {
      body.innerHTML = project.versions.map((item) => `
        <button class="version-chip ${item.id === version.id ? "featured" : ""}" data-version="${item.id}">
          V${item.versionNumber} · ${escapeHtml(item.style)} · ${item.bpm} BPM
        </button>
      `).join("");
      $$("[data-version]", body).forEach((item) => item.addEventListener("click", () => {
        renderResult(project, project.versions.find((versionItem) => versionItem.id === item.dataset.version));
      }));
    }
  }));

  $("[data-action='regenerate']", panel).addEventListener("click", () => generateVersion(project));
  $("[data-action='copy-prompt']", panel).addEventListener("click", async () => {
    await navigator.clipboard.writeText(version.prompt);
    toast("成品生成提示词已复制");
  });
  $("[data-action='delete-version']", panel).addEventListener("click", () => {
    deleteVersion(project, version);
  });
  $("[data-action='share']", panel).addEventListener("click", () => openShare(project, version));
  if (state.reviewMode) loadVersionComments(project, version);
}

async function deleteVersion(project, version, returnToLibrary = false) {
  if (project.versions.length <= 1) {
    return toast("这是作品的最后一个版本，不能单独删除");
  }
  if (!confirm(`只删除「${project.title}」的 V${version.versionNumber} 吗？\n\n该版本对应的分享链接也会失效，其他版本会保留。`)) return;
  try {
    await request(`/projects/${project.id}/versions/${version.id}`, { method: "DELETE" });
    await loadProjects();
    const updated = state.projects.find((item) => item.id === project.id);
    if (returnToLibrary) {
      renderLibrary();
    } else {
      const next = updated.versions.find((item) => item.featured) || updated.versions.at(-1);
      renderResult(updated, next);
      if (state.reviewMode) setRoute(routePath("demo", { projectId: updated.id, versionId: next.id }), true);
    }
    toast(`V${version.versionNumber} 已删除，其他版本已保留`);
  } catch (error) {
    toast(error.message);
  }
}

async function createComment(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const project = state.currentProject;
  const version = state.currentVersion;
  if (!project || !version) return;
  const button = $("button[type='submit']", form);
  button.disabled = true;
  $("span", button).textContent = "正在保存…";
  try {
    const { comment } = await request(`/projects/${project.id}/versions/${version.id}/comments`, {
      method: "POST",
      body: JSON.stringify({
        section: $("#comment-section").value,
        content: $("#comment-content").value,
      }),
    });
    state.comments.unshift(comment);
    form.reset();
    renderCommentList(project, version);
    toast("评论已保存");
  } catch (error) {
    toast(error.message);
  } finally {
    button.disabled = false;
    $("span", button).textContent = "保存评论";
  }
}

function showGenerating(title = "正在把文字变成声音", provider = state.provider) {
  clearInterval(showGenerating.timer);
  const panel = $("#preview-panel");
  panel.className = "preview-panel";
  const initialStep = provider === "minimax"
    ? state.audioInspiration
      ? "MiniMax 正在识别哼唱并完成编曲…"
      : "MiniMax 正在编曲和演唱…"
    : "正在生成本地器乐试听…";
  panel.innerHTML = `
    <div class="generating">
      <div>
        <div class="orb"></div>
        <h2>${title}</h2>
        <p id="generation-step">${initialStep} · 已等待 0 秒</p>
      </div>
    </div>
  `;
  let seconds = 0;
  showGenerating.timer = setInterval(() => {
    seconds += 1;
    const step = $("#generation-step");
    if (step) {
      step.textContent = `${initialStep} · 已等待 ${seconds} 秒`;
    }
  }, 1000);
}

function setGeneratingButton(active, pausing = false) {
  const button = $("#generate-button");
  state.isGenerating = active;
  button.classList.toggle("is-generating", active);
  button.disabled = pausing;
  $("span", button).textContent = active
    ? (pausing ? "正在暂停生成…" : "歌曲生成中")
    : modeCopy[state.mode].button;
  $("b", button).textContent = active ? "Ⅱ" : "↗";
}

function renderGenerationPaused() {
  clearInterval(showGenerating.timer);
  const panel = $("#preview-panel");
  panel.className = "preview-panel empty-state";
  panel.innerHTML = `
    <p class="eyebrow">GENERATION PAUSED</p>
    <h2>歌曲生成已暂停</h2>
    <p>本次生成结果不会保存，可以修改灵感后重新开始。</p>
  `;
}

async function generateVersion(project) {
  showGenerating("新版本正在生长");
  const input = {
    style: state.currentVersion.style,
    mood: state.currentVersion.mood,
    vocal: state.currentVersion.vocal,
    instrument: state.currentVersion.instrument || "自动配器",
    mode: state.currentVersion.mode,
    variation: $(".choice-row[data-choice='variation'] .choice.active").dataset.value,
    provider: state.provider,
  };
  try {
    const { project: updated, version } = await requestMusic(
      `/projects/${project.id}/versions`,
      input
    );
    clearInterval(showGenerating.timer);
    await loadProjects();
    renderResult(updated, version);
    if (state.reviewMode) setRoute(routePath("demo", { projectId: updated.id, versionId: version.id }));
    toast(`版本 V${version.versionNumber} 已生成`);
  } catch (error) {
    clearInterval(showGenerating.timer);
    toast(error.message);
    renderResult(project, state.currentVersion);
  }
}

function colorFor(seed = 0) {
  return ["#6658d7", "#ff6b4a", "#2e8b78", "#d59b31", "#486eaa"][seed % 5];
}

function versionCollaborators(version) {
  const saved = Array.isArray(version.collaborators) ? version.collaborators : [];
  const derived = (version.integratedCollaborationIds || []).map((id) => {
    const collaboration = state.collaborations.find((item) => item.id === id);
    return collaboration && {
      id: collaboration.collaboratorId,
      username: collaboration.collaboratorName,
    };
  }).filter(Boolean);
  return [...new Map([...saved, ...derived].map((item) => [
    item.id || item.username,
    { id: item.id || "", username: item.username || "接力创作者" },
  ])).values()];
}

function renderCoCreationMark(version) {
  const collaborators = versionCollaborators(version);
  if (!version.mature && !(version.integratedCollaborationIds || []).length) return "";
  return `
    <span class="co-created-mark">Demo 接力</span>
    <span class="co-creator-avatars" aria-label="接力创作者：${escapeHtml(collaborators.map((item) => item.username).join("、") || "多人")}">
      ${collaborators.slice(0, 4).map((item) => `
        <i title="${escapeHtml(item.username)}">${escapeHtml(item.username.slice(0, 1).toUpperCase())}</i>
      `).join("")}
    </span>
  `;
}

function renderCreatorMark(project, version, fallback = "") {
  const name = version?.creatorName
    || project?.ownerName
    || project?.creatorName
    || fallback
    || state.user?.username
    || "SongSeed 创作者";
  return `
    <span class="creator-mark" title="创作者：${escapeHtml(name)}">
      <i aria-hidden="true">${escapeHtml(name.slice(0, 1).toUpperCase())}</i>
      <small>创作者</small>
      <b>${escapeHtml(name)}</b>
    </span>
  `;
}

function lyricsForEditing(version) {
  if (version.userLyrics) return version.userLyrics;
  return (version.lyrics || []).map((section) => (
    `【${section.name}】\n${(section.lines || []).join("\n")}`
  )).join("\n\n");
}

function setEditorSelect(selector, value) {
  const select = $(selector);
  if (![...select.options].some((option) => option.value === value)) {
    select.add(new Option(value, value));
  }
  select.value = value;
}

function updateStemInspector() {
  const stem = state.editStems.find((item) => item.key === state.activeStemKey);
  if (!stem) return;
  $("#edit-stem-title").textContent = stem.label;
  const preview = $("#edit-stem-audio");
  if (preview.dataset.stemKey !== stem.key) {
    preview.src = audioSource(stem.audioUrl);
    preview.dataset.stemKey = stem.key;
  }
  preview.volume = Math.min(1, Math.max(0, Number(stem.gain ?? 1)));
  preview.muted = Boolean(stem.muted);
  $("#edit-stem-gain").value = Math.round((stem.gain ?? 1) * 100);
  $("#edit-stem-gain-value").value = `${$("#edit-stem-gain").value}%`;
  $("#edit-stem-muted").checked = Boolean(stem.muted);
  $$("[data-edit-stem]").forEach((button) => {
    button.classList.toggle("active", button.dataset.editStem === stem.key);
    button.setAttribute("aria-selected", String(button.dataset.editStem === stem.key));
  });
  $$(".stem-track-row").forEach((row) => {
    const item = state.editStems.find((saved) => saved.key === row.dataset.stemRow);
    row.classList.toggle("active", item?.key === stem.key);
    row.classList.toggle("muted", Boolean(item?.muted));
    $("[data-stem-mute]", row)?.classList.toggle("active", Boolean(item?.muted));
    $("[data-stem-solo]", row)?.classList.toggle("active", Boolean(item?.solo));
  });
}

function stemWaveform(stem, count = 76) {
  const seed = [...stem.key].reduce((total, char) => total + char.charCodeAt(0), 0);
  const peaks = Array.isArray(stem.waveform) && stem.waveform.length ? stem.waveform : [];
  return Array.from({ length: count }, (_, index) => {
    const height = peaks[index] ?? (18 + ((seed * 17 + index * 29 + (index % 7) * 13) % 70));
    return `<i style="--wave:${height}%"></i>`;
  }).join("");
}

function renderStemRows() {
  $("#edit-stem-list").innerHTML = `
    <div class="stem-timeline-head">
      <span>音轨控制</span>
      <div>${["0:00", "0:30", "1:00", "1:30", "2:00", "2:30", "3:00"].map((time) => `<i>${time}</i>`).join("")}</div>
    </div>
    ${state.editStems.map((stem) => `
      <div class="stem-track-row" data-stem-row="${escapeHtml(stem.key)}">
        <div class="stem-track-header">
          <span class="stem-icon">♪</span>
          <button type="button" class="stem-track-name" data-edit-stem="${escapeHtml(stem.key)}">
            <b>${escapeHtml(stem.label)}</b>
            <small>${stem.muted ? "已静音" : `音量 ${Math.round((stem.gain ?? 1) * 100)}%`}</small>
          </button>
          <div class="stem-track-toggles">
            <button type="button" data-stem-solo="${escapeHtml(stem.key)}" aria-label="独奏${escapeHtml(stem.label)}">S</button>
            <button type="button" data-stem-mute="${escapeHtml(stem.key)}" aria-label="静音${escapeHtml(stem.label)}">M</button>
          </div>
          <input data-stem-row-gain="${escapeHtml(stem.key)}" type="range" min="0" max="200" value="${Math.round((stem.gain ?? 1) * 100)}" aria-label="${escapeHtml(stem.label)}音量">
        </div>
        <button type="button" class="stem-region" data-edit-stem="${escapeHtml(stem.key)}" aria-label="选择并试听${escapeHtml(stem.label)}">
          <span class="stem-region-label">${escapeHtml(stem.label)}.wav</span>
          <span class="stem-waveform" aria-hidden="true">${stemWaveform(stem)}</span>
        </button>
      </div>
    `).join("")}
  `;
  $$("[data-edit-stem]", $("#edit-stem-list")).forEach((button) => {
    button.addEventListener("click", () => {
      state.activeStemKey = button.dataset.editStem;
      updateStemInspector();
    });
  });
  $$("[data-stem-mute]", $("#edit-stem-list")).forEach((button) => {
    button.addEventListener("click", () => {
      const stem = state.editStems.find((item) => item.key === button.dataset.stemMute);
      stem.muted = !stem.muted;
      renderStemRows();
      updateStemInspector();
    });
  });
  $$("[data-stem-solo]", $("#edit-stem-list")).forEach((button) => {
    button.addEventListener("click", () => {
      const stem = state.editStems.find((item) => item.key === button.dataset.stemSolo);
      stem.solo = !stem.solo;
      renderStemRows();
      updateStemInspector();
    });
  });
  $$("[data-stem-row-gain]", $("#edit-stem-list")).forEach((input) => {
    input.addEventListener("input", () => {
      const stem = state.editStems.find((item) => item.key === input.dataset.stemRowGain);
      stem.gain = Number(input.value) / 100;
      if (stem.key === state.activeStemKey) updateStemInspector();
      const summary = $(`[data-stem-row="${stem.key}"] .stem-track-name small`);
      if (summary && !stem.muted) summary.textContent = `音量 ${input.value}%`;
    });
  });
}

function renderStemEditor(version) {
  state.editStems = (version.stems || []).map((item) => ({ ...item }));
  state.activeStemKey = state.editStems[0]?.key || "";
  const workspace = $("#edit-stem-workspace");
  const stemsOption = $("#edit-audio-mode").querySelector("option[value='stems']");
  stemsOption.disabled = !state.editStems.length;
  if (!state.editStems.length) {
    workspace.hidden = true;
    $("#edit-stem-status").innerHTML = state.stemSeparationAvailable
      ? "尚未拆分音轨。点击按钮后会在本机处理当前音频。"
      : `需要先安装免费的 Demucs 分轨模型。${state.stemSeparationSetupUrl ? `<a href="${escapeHtml(state.stemSeparationSetupUrl)}" target="_blank" rel="noreferrer">查看官方说明</a>` : ""}`;
    return;
  }
  workspace.hidden = false;
  $("#edit-stem-status").textContent = `已拆分 ${state.editStems.length} 条音轨，选择一条开始编辑。`;
  renderStemRows();
  $("#edit-audio-mode").value = "stems";
  updateStemInspector();
}

async function splitCurrentAudio() {
  const project = state.currentProject;
  const version = state.currentVersion;
  if (!project || !version) return;
  const button = $("#edit-split-audio");
  button.disabled = true;
  button.textContent = "正在拆分音轨…";
  $("#edit-stem-status").textContent = "首次运行会下载开源模型，CPU 处理可能需要几分钟。";
  try {
    const result = await requestMusic(
      `/projects/${project.id}/versions/${version.id}/stems`,
      { provider: "stems" }
    );
    await loadProjects();
    state.currentProject = state.projects.find((item) => item.id === project.id) || result.project;
    state.currentVersion = state.currentProject.versions.find((item) => item.id === version.id) || result.version;
    renderStemEditor(state.currentVersion);
    toast("当前音频已拆分为可编辑音轨");
  } catch (error) {
    const link = error.body?.setupUrl || state.stemSeparationSetupUrl;
    $("#edit-stem-status").innerHTML = `${escapeHtml(error.message)}${link ? ` · <a href="${escapeHtml(link)}" target="_blank" rel="noreferrer">安装说明</a>` : ""}`;
    toast(error.message);
  } finally {
    button.disabled = false;
    button.textContent = state.editStems.length ? "重新拆分当前音频" : "拆分当前音频";
  }
}

function openVersionEditor(project, version, updateRoute = true) {
  state.currentProject = project;
  state.currentVersion = version;
  $("#edit-title").value = version.title || project.title;
  $("#edit-version-name").value = version.versionName || `V${version.versionNumber} 编辑版`;
  $("#edit-lyrics").value = lyricsForEditing(version);
  $("#edit-audio").src = audioSource(version.audioUrl);
  $("#edit-audio-mode").value = "regenerate";
  $("#edit-bpm").value = version.bpm || 90;
  setEditorSelect("#edit-style", version.style || "流行");
  setEditorSelect("#edit-mood", version.mood || "治愈");
  setEditorSelect("#edit-vocal", version.vocal || "温暖女声");
  setEditorSelect("#edit-instrument", version.instrument || "自动配器");
  setEditorSelect("#edit-variation", version.variation || "明显");
  renderStemEditor(version);
  $("#edit-split-audio").textContent = state.editStems.length ? "重新拆分当前音频" : "拆分当前音频";
  switchView("editor");
  if (updateRoute) setRoute(routePath("editor", { projectId: project.id, versionId: version.id }));
}

async function saveEditedVersion(event) {
  event.preventDefault();
  const project = state.currentProject;
  const source = state.currentVersion;
  if (!project || !source) return;
  if ($("#edit-audio-mode").value === "stems" && !state.editStems.length) {
    return toast("请先拆分当前版本的音轨");
  }
  if (!confirm(`确认保存修改并基于 V${source.versionNumber} 生成一个新版本吗？\n\n原版本不会被覆盖。`)) return;
  const button = $("#editor-save");
  button.disabled = true;
  $("span", button).textContent = $("#edit-audio-mode").value === "keep" ? "正在保存新版本…" : "正在生成新版本…";
  try {
    const { project: updated, version } = await requestMusic(
      `/projects/${project.id}/versions/${source.id}/edit`,
      {
        title: $("#edit-title").value.trim(),
        versionName: $("#edit-version-name").value.trim(),
        lyrics: $("#edit-lyrics").value.trim(),
        audioMode: $("#edit-audio-mode").value,
        style: $("#edit-style").value,
        mood: $("#edit-mood").value,
        bpm: Number($("#edit-bpm").value),
        vocal: $("#edit-vocal").value,
        instrument: $("#edit-instrument").value,
        variation: $("#edit-variation").value,
        provider: state.provider,
        stemMix: state.editStems.map(({ key, gain, muted, solo }) => ({
          key,
          gain,
          muted: Boolean(muted || (state.editStems.some((item) => item.solo) && !solo)),
        })),
      }
    );
    await loadProjects();
    openReviewWorkspace(updated, version);
    toast(`修改已保存为 V${version.versionNumber}`);
  } catch (error) {
    toast(error.message);
  } finally {
    button.disabled = false;
    $("span", button).textContent = "保存并生成新版本";
  }
}

function renderLibrary() {
  const received = state.librarySection === "received";
  const collaborating = state.librarySection === "collaborations";
  $("#library-view").classList.toggle("received-library", received || collaborating);
  $("#library-eyebrow").textContent = collaborating ? "CO-CREATED MUSIC" : received ? "SHARED WITH ME" : "YOUR MUSIC SHELF";
  $("#library-title").textContent = collaborating ? "Demo 接力" : received ? "分享给我的 Demo" : "我的 Demo";
  $("#library-description").textContent = collaborating
    ? "你发起或收到的接力方案，都会作为双方的协作记录保存在这里。"
    : received
      ? "别人递来的灵感，会留在这里等待再次试听。"
      : "每一个版本，都是灵感生长过的证据。";
  $("#library-create-button").hidden = received || collaborating;
  if (collaborating) return renderCollaborationLibrary();
  if (received) return renderReceivedLibrary();

  const list = $("#project-list");
  if (!state.projects.length) {
    list.innerHTML = `<div class="empty-library"><h2>你的第一段 Demo 还没出现</h2><p>从一句话开始就好。</p><button class="outline-button" data-view="studio">去创作</button></div>`;
    $("[data-view='studio']", list).addEventListener("click", showCreationWorkspace);
    return;
  }

  list.innerHTML = state.projects.map((project) => {
    const featured = project.versions.find((version) => version.featured) || project.versions.at(-1);
    return `
      <article class="project-card" data-project="${project.id}">
        <div class="project-cover" style="--cover:${colorFor(featured.seed)}"></div>
        <div class="project-info">
          <h2>${escapeHtml(project.title)}</h2>
          <span data-version-creator>${renderCreatorMark(project, featured)}</span>
          <p>${escapeHtml(project.inspiration.slice(0, 70))}${project.inspiration.length > 70 ? "…" : ""}</p>
          <div class="version-row">
            <details class="card-version-selector">
              <summary class="version-chip featured">V${featured.versionNumber} · ${escapeHtml(featured.style)}<i aria-hidden="true"></i></summary>
              <div class="card-version-dropdown">
                ${project.versions.map((version) => `
                  <button type="button" class="${version.id === featured.id ? "active" : ""}" data-card-version="${version.id}">
                    <b>V${version.versionNumber} · ${escapeHtml(version.style)}</b>
                    <small>${version.bpm} BPM · ${escapeHtml(version.mood)}</small>
                  </button>
                `).join("")}
              </div>
            </details>
            <span class="version-collaboration" data-version-collaboration>${renderCoCreationMark(featured)}</span>
          </div>
          <small>${formatDate(project.updatedAt)} · ${project.versions.length} 个版本</small>
        </div>
        <div class="project-actions">
          <button class="listen" data-action="listen">试听</button>
          <button data-action="edit">编辑</button>
          <button data-action="share">分享</button>
          <button data-action="delete" aria-label="删除当前选中的版本">删除版本</button>
        </div>
      </article>
    `;
  }).join("");

  $$(".project-card", list).forEach((card) => {
    const project = state.projects.find((item) => item.id === card.dataset.project);
    let chosen = project.versions.find((version) => version.featured) || project.versions.at(-1);
    $$("[data-card-version]", card).forEach((button) => button.addEventListener("click", () => {
      chosen = project.versions.find((version) => version.id === button.dataset.cardVersion);
      $(".card-version-selector summary", card).innerHTML = `V${chosen.versionNumber} · ${escapeHtml(chosen.style)}<i aria-hidden="true"></i>`;
      $("[data-version-collaboration]", card).innerHTML = renderCoCreationMark(chosen);
      $("[data-version-creator]", card).innerHTML = renderCreatorMark(project, chosen);
      $$("[data-card-version]", card).forEach((item) => item.classList.toggle("active", item === button));
      $(".card-version-selector", card).removeAttribute("open");
    }));
    $("[data-action='listen']", card).addEventListener("click", () => {
      openReviewWorkspace(project, chosen);
    });
    $("[data-action='edit']", card).addEventListener("click", () => openVersionEditor(project, chosen));
    $("[data-action='share']", card).addEventListener("click", () => openShare(project, chosen));
    $("[data-action='delete']", card).addEventListener("click", () => deleteVersion(project, chosen, true));
  });
}

function renderReceivedLibrary() {
  const list = $("#project-list");
  if (!state.receivedShares.length) {
    list.innerHTML = `<div class="empty-library"><h2>还没有收到 Demo</h2><p>成功打开别人发来的私密分享链接后，它会自动出现在这里。</p></div>`;
    return;
  }

  list.innerHTML = state.receivedShares.map((share) => {
    const expired = new Date(share.expiresAt) < new Date();
    const seed = [...share.token].reduce((total, char) => total + char.charCodeAt(0), 0);
    return `
      <article class="project-card received-card" data-token="${escapeHtml(share.token)}">
        <div class="project-cover shared-cover" style="--cover:${colorFor(seed)}" aria-hidden="true"></div>
        <div class="project-info">
          <h2>${escapeHtml(share.title)}</h2>
          ${renderCreatorMark(null, null, share.creatorName)}
          <p>${escapeHtml(share.inspiration.slice(0, 70))}${share.inspiration.length > 70 ? "…" : ""}</p>
          <div class="version-row">
            <span class="version-chip featured">V${share.versionNumber} · ${escapeHtml(share.style)}</span>
            <span class="version-chip">${escapeHtml(share.mood)}</span>
            <span class="version-chip">${formatTime(share.duration)}</span>
          </div>
          <small>${expired ? "分享已过期" : `有效至 ${formatDate(share.expiresAt)}`} · 来自一位创作者</small>
        </div>
        <div class="project-actions">
          <button class="listen" data-action="open" ${expired ? "disabled" : ""}>${expired ? "已过期" : "打开 Demo"}</button>
          <button data-action="forget">移除</button>
        </div>
      </article>
    `;
  }).join("");

  $$(".received-card", list).forEach((card) => {
    $("[data-action='open']", card).addEventListener("click", () => {
      location.href = `${SHARE_ORIGIN}${routePath("share", { token: card.dataset.token })}`;
    });
    $("[data-action='forget']", card).addEventListener("click", async () => {
      try {
        await request(`/received-shares/${encodeURIComponent(card.dataset.token)}`, { method: "DELETE" });
        state.receivedShares = state.receivedShares.filter((item) => item.token !== card.dataset.token);
        updateLibraryCounts();
        renderReceivedLibrary();
        toast("已从列表移除");
      } catch (error) {
        toast(error.message);
      }
    });
  });
}

function renderCollaborationLibrary() {
  const list = $("#project-list");
  const integrated = state.projects.flatMap((project) => project.versions
    .filter((version) => version.mature && (version.integratedCollaborationIds || []).length)
    .map((version) => ({ project, version })))
    .sort((left, right) => new Date(right.version.createdAt) - new Date(left.version.createdAt));
  if (!state.collaborations.length && !integrated.length) {
    list.innerHTML = `<div class="empty-library"><h2>还没有 Demo 接力</h2><p>从别人分享给你的 Demo 中发起接力创作，或等待合作方递来新的方案。</p></div>`;
    return;
  }

  const received = state.collaborations.filter((item) => item.role === "creator");
  const participated = state.collaborations.filter((item) => item.role === "collaborator");
  const collaborationCards = (items, selectable) => items.length ? `
    <div class="collaboration-list">
      ${items.map((item) => {
        const version = item.version;
        return `
          <article class="collaboration-card" data-collaboration="${item.id}">
            <div class="collaboration-card-head">
              ${selectable ? `<label class="collaboration-select"><input type="checkbox" value="${item.id}"><span>加入整合</span></label>` : `<span class="role-chip">我参与的接力</span>`}
              <span class="scope-chip">按照灵感修改</span>
            </div>
            <h3>${escapeHtml(item.sourceTitle)}</h3>
            ${renderCreatorMark(null, version, item.collaboratorName)}
            <p class="collaboration-source">基于原作 V${item.sourceVersionNumber} · 接力创作者 ${escapeHtml(item.collaboratorName)}</p>
            <blockquote>${escapeHtml(item.instruction)}</blockquote>
            <audio controls preload="metadata" src="${audioSource(version.audioUrl)}"></audio>
            <div class="collaboration-meta">
              <span>${escapeHtml(version.style)} · ${escapeHtml(version.mood)} · ${version.bpm} BPM</span>
              <span>${formatDate(item.createdAt)}</span>
            </div>
            ${selectable ? `<button class="adopt-button ${item.adopted ? "adopted" : ""}" type="button" data-action="adopt">${item.adopted ? "已采纳" : "标记采纳"}</button>` : `<span class="adopt-state">${item.adopted ? "创作者已采纳" : "等待创作者查看"}</span>`}
          </article>
        `;
      }).join("")}
    </div>
  ` : `<div class="collaboration-empty">暂无内容</div>`;
  const participatedSection = participated.length ? `
    <section class="collaboration-section">
      <div class="collaboration-section-head">
        <div><h2>我参与的 Demo 接力</h2><p>这些是你参与完善歌曲的协作记录。</p></div>
      </div>
      ${collaborationCards(participated, false)}
    </section>
  ` : "";

  list.innerHTML = `
    <div class="collaboration-columns">
      <section class="collaboration-section">
        <div class="collaboration-section-head">
          <div><h2>收到的接力方案</h2><p>可试听对比、采纳，并让 AI 整合多个方案。</p></div>
          <button class="primary-button compact" type="button" data-action="integrate"><span>整合已选方案</span><b>↗</b></button>
        </div>
        ${collaborationCards(received, true)}
      </section>
      <section class="collaboration-section">
        <div class="collaboration-section-head">
          <div><h2>已经整合的歌曲</h2><p>选中方案生成的成熟版 Demo 会保存在这里。</p></div>
        </div>
        <div class="collaboration-list">
          ${integrated.length ? integrated.map(({ project, version }) => {
            const collaborators = versionCollaborators(version);
            return `
              <article class="collaboration-card integrated-card" data-integrated-project="${project.id}" data-integrated-version="${version.id}">
                <div class="collaboration-card-head"><span class="role-chip">已整合</span>${renderCoCreationMark(version)}</div>
                <h3>${escapeHtml(version.title)}</h3>
                ${renderCreatorMark(project, version)}
                <p class="collaboration-source">V${version.versionNumber} · 接力创作者 ${escapeHtml(collaborators.map((item) => item.username).join("、") || "多人")}</p>
                <blockquote>已整合 ${(version.integratedCollaborationIds || []).length} 个接力方案，生成成熟版 Demo。</blockquote>
                <audio controls preload="metadata" src="${audioSource(version.audioUrl)}"></audio>
                <div class="collaboration-meta"><span>${escapeHtml(version.style)} · ${escapeHtml(version.mood)} · ${version.bpm} BPM</span><span>${formatDate(version.createdAt)}</span></div>
                <button class="adopt-button adopted" type="button" data-action="open-integrated">查看 Demo 版本</button>
              </article>
            `;
          }).join("") : `<div class="collaboration-empty">还没有整合歌曲，请先从左侧选择方案。</div>`}
        </div>
      </section>
    </div>
    ${participatedSection}
  `;

  $$(".collaboration-card", list).forEach((card) => {
    const item = state.collaborations.find((entry) => entry.id === card.dataset.collaboration);
    const adopt = $("[data-action='adopt']", card);
    if (!adopt) return;
    adopt.addEventListener("click", async () => {
      const next = !item.adopted;
      if (!confirm(`确定${next ? "采纳" : "取消采纳"}这个接力方案吗？`)) return;
      try {
        const { collaboration } = await request(`/collaborations/${item.id}`, {
          method: "PATCH",
          body: JSON.stringify({ adopted: next }),
        });
        Object.assign(item, collaboration);
        renderCollaborationLibrary();
        toast(next ? "已采纳接力方案" : "已取消采纳");
      } catch (error) {
        toast(error.message);
      }
    });
  });

  $$("[data-action='open-integrated']", list).forEach((button) => button.addEventListener("click", () => {
    const card = button.closest("[data-integrated-project]");
    const project = state.projects.find((item) => item.id === card.dataset.integratedProject);
    const version = project?.versions.find((item) => item.id === card.dataset.integratedVersion);
    if (project && version) openReviewWorkspace(project, version);
  }));

  const integrate = $("[data-action='integrate']", list);
  if (integrate) integrate.addEventListener("click", async () => {
    const ids = $$("input[type='checkbox']:checked", list).map((input) => input.value);
    if (!ids.length) return toast("请先选择至少一个接力方案");
    if (!confirm(`将 ${ids.length} 个接力方案交给 AI 整合为成熟版 Demo，是否继续？`)) return;
    integrate.disabled = true;
    $("span", integrate).textContent = "AI 正在整合…";
    try {
      const { project, version } = await requestMusic("/collaborations/integrate", {
        ids,
        provider: state.provider,
      });
      await Promise.all([loadProjects(), loadCollaborations()]);
      renderCollaborationLibrary();
      toast("成熟版 Demo 已生成，并保存为原作的新版本");
    } catch (error) {
      toast(error.message);
    } finally {
      integrate.disabled = false;
      $("span", integrate).textContent = "整合已选方案";
    }
  });
}

function openShare(project, version) {
  state.currentProject = project;
  state.currentVersion = version;
  state.currentShareToken = "";
  $("#share-version-id").value = version.id;
  $("#access-code").value = "";
  $("#share-result").hidden = true;
  $("#share-friend-panel").hidden = true;
  updateShareFriendOptions();
  $("#share-dialog").showModal();
}

function closeShareDialog() {
  const dialog = $("#share-dialog");
  if (dialog.open) dialog.close();
}

async function createShare(event) {
  event.preventDefault();
  const button = $("#create-share");
  button.disabled = true;
  button.textContent = "正在生成…";
  try {
    const { share } = await request(`/projects/${state.currentProject.id}/shares`, {
      method: "POST",
      body: JSON.stringify({
        versionId: $("#share-version-id").value,
        accessCode: $("#access-code").value.trim(),
        expiresDays: Number($("#expires-days").value),
      }),
    });
    const url = `${SHARE_ORIGIN}${routePath("share", { token: share.token })}`;
    state.currentShareToken = share.token;
    $("#share-url").value = url;
    $("#share-expiry").textContent = `有效至 ${formatDate(share.expiresAt)}${share.hasAccessCode ? " · 已设置访问口令" : ""}`;
    $("#share-result").hidden = false;
    $("#share-friend-panel").hidden = false;
    updateShareFriendOptions();
    toast("私密分享链接已生成");
  } catch (error) {
    toast(error.message);
  } finally {
    button.disabled = false;
    button.textContent = "生成私密链接";
  }
}

async function shareDemoWithFriend() {
  const friendId = $("#share-friend-select").value;
  if (!friendId) return toast("请先添加一位好友");
  if (!state.currentShareToken) return toast("请先生成分享链接");
  const button = $("#share-to-friend");
  button.disabled = true;
  button.textContent = "正在发送…";
  try {
    await request(`/friends/${friendId}/share`, {
      method: "POST",
      body: JSON.stringify({ shareToken: state.currentShareToken }),
    });
    const friend = state.social.friends.find((item) => item.id === friendId);
    toast(`已把 Demo 分享给 ${friend?.username || "好友"}`);
  } catch (error) {
    toast(error.message);
  } finally {
    button.disabled = false;
    button.textContent = "发送给好友";
  }
}

function renderFeedback(feedback = []) {
  if (!feedback.length) return `<p class="dialog-note">还没有历史评价，成为第一个留下想法的人吧。</p>`;
  const statusNames = { pending: "待处理", accepted: "已接受", rejected: "未接受" };
  return feedback.map((item) => `
    <div class="feedback-item">
      <div class="feedback-item-head">
        <small>${escapeHtml(item.author)} · ${escapeHtml(item.source || "分享反馈")} · ${escapeHtml(item.section)} · ${formatDate(item.createdAt)}</small>
        <span class="feedback-status ${item.status || "pending"}">${statusNames[item.status] || statusNames.pending}</span>
      </div>
      <p>${escapeHtml(item.content)}</p>
      ${(item.replies || []).length ? `
        <div class="feedback-replies">
          ${item.replies.map((reply) => `
            <div><small>${escapeHtml(reply.author || "创作者")} 回复 · ${formatDate(reply.createdAt)}</small><p>${escapeHtml(reply.content)}</p></div>
          `).join("")}
        </div>
      ` : ""}
    </div>
  `).join("");
}

async function loadShare(token, code = "", showLoading = true) {
  $("#share-loading").hidden = !showLoading;
  if (showLoading) $("#share-content").innerHTML = "";
  try {
    const data = await request(`/share/${token}`, { headers: { "X-Share-Code": code } });
    state.shareCode = code;
    saveShareCode(token, code);
    rememberReceivedShare(token, data);
    $("#share-loading").hidden = true;
    renderSharePage(token, data);
  } catch (error) {
    $("#share-loading").hidden = true;
    if (error.status === 401 && error.body.locked) {
      saveShareCode(token, "");
      return renderUnlock(token, code ? "口令不正确，请和创作者确认后重试。" : "");
    }
    $("#share-content").innerHTML = `<div class="unlock-card"><div class="unlock-icon">♪</div><h2>暂时听不到这段 Demo</h2><p>${escapeHtml(error.message)}</p></div>`;
  }
}

function renderUnlock(token, message = "") {
  $("#share-content").innerHTML = `
    <form class="unlock-card" id="unlock-form">
      <div class="unlock-icon">♩</div>
      <p class="eyebrow">PRIVATE DEMO</p>
      <h2>这是一段私密灵感</h2>
      <p>${message ? escapeHtml(message) : "输入创作者给你的访问口令，即可开始试听。"}</p>
      <input id="unlock-code" maxlength="12" autocomplete="off" placeholder="输入访问口令" aria-label="访问口令">
      <button class="primary-button" type="submit"><span>打开 Demo</span><b>→</b></button>
    </form>
  `;
  $("#unlock-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = $("button[type='submit']", form);
    const code = $("#unlock-code").value.trim();
    button.disabled = true;
    $("span", button).textContent = "正在验证口令…";
    await loadShare(token, code, false);
  });
}

function renderSharePage(token, data) {
  const { project, version, feedback } = data;
  $("#share-content").innerHTML = `
    <article class="share-hero">
      <span class="shared-by">SongSeed 私密分享</span>
      <h1>${escapeHtml(version.title)}</h1>
      ${renderCreatorMark(project, version)}
      <p class="share-inspiration">“${escapeHtml(project.inspiration)}”</p>
      <div class="result-meta">
        <span>${escapeHtml(version.style)}</span>
        <span>${escapeHtml(version.mood)}</span>
        ${version.instrument ? `<span>${escapeHtml(version.instrument)}</span>` : ""}
        <span>${version.bpm} BPM</span>
        <span>V${version.versionNumber}</span>
      </div>
      <div class="share-player">
        <audio controls preload="metadata" src="${API_ORIGIN}${version.audioUrl}"></audio>
      </div>
      <p class="shared-by">${escapeHtml(version.arrangement)}</p>
    </article>
    <div class="share-grid">
      <section class="share-box">
        <p class="eyebrow">LYRICS</p>
        <h2>歌词草稿</h2>
        ${renderLyrics(version.lyrics, true)}
      </section>
      <section class="share-box">
        <p class="eyebrow">LEAVE A NOTE</p>
        <h2>告诉我你的感觉</h2>
        <form id="feedback-form" class="feedback-form">
          <label><span class="field-label">反馈身份</span><input id="feedback-author" readonly value="${escapeHtml(state.user?.username || "游客")}"></label>
          <label><span class="field-label">反馈位置</span>
            <select id="feedback-section"><option>整体</option><option>主歌</option><option>副歌</option><option>歌词</option><option>编曲</option></select>
          </label>
          <label><span class="field-label">想说的话</span><textarea id="feedback-content" maxlength="600" required placeholder="副歌第二句很抓耳，如果鼓再晚两拍进入可能更有张力……"></textarea></label>
          <button class="primary-button" type="submit"><span>提交反馈</span><b>→</b></button>
        </form>
        <div class="feedback-history-head">
          <h3>历史评价</h3>
          <span id="shared-feedback-count">${feedback.length} 条</span>
        </div>
        <div id="feedback-list" class="feedback-list">${renderFeedback(feedback)}</div>
      </section>
      <section class="share-box collaboration-box">
        <p class="eyebrow">CREATE TOGETHER</p>
        <h2>为这首歌发起 Demo 接力</h2>
        <p>写下想完善的部分，生成的接力 Demo 会同时保存在双方账户中。</p>
        ${state.user?.guest ? `
          <div class="collaboration-login">
            <strong>登录后才能留下共同创作记录</strong>
            <button id="collaboration-login" class="outline-button" type="button">登录或注册</button>
          </div>
        ` : `
          <form id="collaboration-form" class="collaboration-form">
            <label><span class="field-label">按照灵感修改</span><textarea id="collaboration-instruction" maxlength="600" required placeholder="写下你希望这首歌如何继续生长，例如：保留主歌，把副歌改成更有爆发力的摇滚编曲，第二遍加入和声……"></textarea></label>
            <button class="primary-button" type="submit"><span>生成接力 Demo</span><b>↗</b></button>
          </form>
        `}
      </section>
    </div>
  `;
  $("#feedback-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = $("button[type='submit']", form);
    button.disabled = true;
    try {
      const { feedback: item } = await request(`/share/${token}/feedback`, {
        method: "POST",
        headers: { "X-Share-Code": state.shareCode },
        body: JSON.stringify({
          section: $("#feedback-section").value,
          content: $("#feedback-content").value,
        }),
      });
      feedback.unshift(item);
      $("#feedback-list").innerHTML = renderFeedback(feedback);
      $("#shared-feedback-count").textContent = `${feedback.length} 条`;
      form.reset();
      toast("反馈已送达创作者");
    } catch (error) {
      toast(error.message);
    } finally {
      button.disabled = false;
    }
  });
  $("#collaboration-login")?.addEventListener("click", () => {
    state.user = null;
    setAuthMode("login");
    showAuth();
  });
  $("#collaboration-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = $("button[type='submit']", form);
    button.disabled = true;
    $("span", button).textContent = "正在生成接力 Demo…";
    try {
      const instruction = $("#collaboration-instruction").value.trim();
      const { collaboration } = await requestMusic(`/share/${token}/collaborations`, {
        instruction,
        provider: state.provider,
      }, { "X-Share-Code": state.shareCode });
      await loadCollaborations();
      form.reset();
      form.innerHTML = `
        <div class="collaboration-success">
          <strong>接力 Demo 已生成</strong>
          <p>它已保存为你与原创作者双方可见的共享成果。</p>
          <button class="outline-button" type="button" data-open-collaborations>查看 Demo 接力</button>
        </div>
      `;
      $("[data-open-collaborations]", form).addEventListener("click", () => {
        location.href = routePath("collaborations");
      });
      toast(`接力 Demo《${collaboration.version.title}》已生成`);
    } catch (error) {
      toast(error.message);
      button.disabled = false;
      $("span", button).textContent = "生成接力 Demo";
    }
  });
}

$("#inspiration").addEventListener("input", (event) => {
  $("#char-count").textContent = event.target.value.length;
});

$$(".choice-row").forEach((row) => {
  $$(".choice", row).forEach((button) => button.addEventListener("click", () => {
    $$(".choice", row).forEach((item) => {
      const active = item === button;
      item.classList.toggle("active", active);
      if (row.getAttribute("role") === "group") item.setAttribute("aria-pressed", String(active));
    });
  }));
});

$$(".provider-option").forEach((button) => button.addEventListener("click", () => {
  if (button.disabled) return;
  state.provider = button.dataset.provider;
  updateProviderSwitch();
}));

$$(".mode-option").forEach((button) => button.addEventListener("click", () => {
  state.mode = button.dataset.mode;
  updateCreationMode();
}));

$("#deepseek-button").addEventListener("click", async () => {
  const lyrics = $("#inspiration").value.trim();
  if (lyrics.length < 2) return toast("请先写下一句歌词");
  const button = $("#deepseek-button");
  button.disabled = true;
  button.textContent = "DeepSeek 创作中…";
  try {
    const { lyrics: improved } = await request("/lyrics/improve", {
      method: "POST",
      body: JSON.stringify({
        lyrics,
        action: $("#deepseek-action").value,
        style: $(".choice-row[data-choice='style'] .choice.active").dataset.value,
        mood: $("#mood").value,
      }),
    });
    $("#inspiration").value = improved;
    $("#char-count").textContent = improved.length;
    toast("DeepSeek 已回填歌词，请确认后再生成音乐");
  } catch (error) {
    toast(error.message);
  } finally {
    button.disabled = !state.deepseekAvailable;
    button.textContent = "使用 DeepSeek";
  }
});

$("#creation-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = $("#generate-button");
  if (state.isGenerating) {
    const shouldPause = confirm("歌曲仍在生成中，确定暂停本次生成吗？\n\n暂停后，本次结果不会保存。");
    if (!shouldPause) return;
    state.cancelRequested = true;
    setGeneratingButton(true, true);
    try {
      if (state.currentJobId) {
        await request(`/jobs/${state.currentJobId}/cancel`, { method: "POST" });
        renderGenerationPaused();
        toast("已暂停当前歌曲生成");
      } else {
        toast("正在暂停当前歌曲生成…");
      }
    } catch (error) {
      toast(error.message);
    }
    return;
  }
  const writtenInspiration = $("#inspiration").value.trim();
  const inspiration = writtenInspiration || (
    state.audioInspiration ? `音频灵感：${state.audioInspiration.name}` : ""
  );
  if (inspiration.length < 2) return toast("写下至少两个字，或上传一段音频灵感吧");
  const input = {
    inspiration,
    audioInspiration: state.audioInspiration,
    style: $(".choice-row[data-choice='style'] .choice.active").dataset.value,
    mood: $("#mood").value,
    vocal: state.mode === "instrumental" ? "纯音乐" : $("#vocal").value,
    instrument: $("#instrument").value,
    mode: state.mode,
    variation: $(".choice-row[data-choice='variation'] .choice.active").dataset.value,
    provider: state.provider,
  };
  state.currentJobId = "";
  state.cancelRequested = false;
  setGeneratingButton(true);
  showGenerating();
  try {
    const { project, version } = await requestMusic("/projects", input);
    clearInterval(showGenerating.timer);
    await loadProjects();
    renderResult(project, version);
    toast("第一版 Demo 已经响起来了");
  } catch (error) {
    clearInterval(showGenerating.timer);
    if (error.cancelled) {
      renderGenerationPaused();
      toast("已暂停当前歌曲生成");
    } else {
      toast(error.message);
      $("#preview-panel").className = "preview-panel empty-state";
      $("#preview-panel").innerHTML = `<p class="eyebrow">GENERATION PAUSED</p><h2>这次没有成功生成</h2><p>${escapeHtml(error.message)}</p>`;
    }
  } finally {
    state.currentJobId = "";
    state.cancelRequested = false;
    setGeneratingButton(false);
  }
});

$$("[data-view]").forEach((button) => button.addEventListener("click", () => {
  if (button.dataset.view === "studio") showCreationWorkspace();
  else if (button.dataset.view === "inspirations") showInspirations();
  else switchView(button.dataset.view);
}));
$$("[data-library-section]").forEach((button) => button.addEventListener("click", () => openLibrary(button.dataset.librarySection)));
$("[data-route='studio']").addEventListener("click", (event) => {
  event.preventDefault();
  showCreationWorkspace();
});
document.addEventListener("click", (event) => {
  if (!$("#my-menu").contains(event.target)) $("#my-menu").removeAttribute("open");
  if (!$("#friends-menu").contains(event.target)) $("#friends-menu").removeAttribute("open");
});
$("#friends-menu").addEventListener("toggle", () => {
  if ($("#friends-menu").open) {
    $("#my-menu").removeAttribute("open");
    loadSocial(true);
  }
});
$("#my-menu").addEventListener("toggle", () => {
  if ($("#my-menu").open) $("#friends-menu").removeAttribute("open");
});
$("#share-form").addEventListener("submit", createShare);
$("#share-to-friend").addEventListener("click", shareDemoWithFriend);
$("#comment-form").addEventListener("submit", createComment);
$("#version-editor-form").addEventListener("submit", saveEditedVersion);
$("#edit-split-audio").addEventListener("click", splitCurrentAudio);
$("#edit-stem-gain").addEventListener("input", (event) => {
  const stem = state.editStems.find((item) => item.key === state.activeStemKey);
  if (!stem) return;
  stem.gain = Number(event.target.value) / 100;
  $("#edit-stem-gain-value").value = `${event.target.value}%`;
  const summary = $(`[data-edit-stem="${stem.key}"] small`);
  if (summary && !stem.muted) summary.textContent = `音量 ${event.target.value}%`;
  const rowGain = $(`[data-stem-row-gain="${stem.key}"]`);
  if (rowGain) rowGain.value = event.target.value;
});
$("#edit-stem-muted").addEventListener("change", (event) => {
  const stem = state.editStems.find((item) => item.key === state.activeStemKey);
  if (!stem) return;
  stem.muted = event.target.checked;
  const summary = $(`[data-edit-stem="${stem.key}"] small`);
  if (summary) summary.textContent = stem.muted ? "已静音" : `音量 ${Math.round((stem.gain ?? 1) * 100)}%`;
  updateStemInspector();
});
$("#editor-cancel").addEventListener("click", () => openLibrary("mine"));
$("#inspiration-record-form").addEventListener("submit", saveInspiration);
$("#friend-search-form").addEventListener("submit", searchFriends);
$("#friend-message-form").addEventListener("submit", sendFriendMessage);
$("#close-friend-chat").addEventListener("click", () => {
  state.activeFriendId = "";
  state.friendMessages = [];
  $("#friend-chat").hidden = true;
  $("#friend-list").hidden = false;
  renderSocial();
});
$("#save-draft-button").addEventListener("click", saveCurrentDraft);
$("#auth-form").addEventListener("submit", submitAuth);
$("#auth-toggle").addEventListener("click", () => {
  setAuthMode(authMode === "login" ? "register" : "login");
  if (!state.shareToken) {
    const next = state.returnPath || new URLSearchParams(location.search).get("next") || routePath("studio");
    setRoute(`${routePath(authMode)}?next=${encodeURIComponent(next)}`, true);
  }
});
$("#guest-button").addEventListener("click", async () => {
  state.user = { username: "游客", guest: true };
  hideAuth();
  await openSharedDemo();
});
$("#logout-button").addEventListener("click", async () => {
  try {
    await request("/auth/logout", { method: "POST" });
  } catch {
    // 本地会话无论后端是否在线都可以安全退出。
  }
  state.token = "";
  state.user = null;
  state.projects = [];
  state.inspirations = [];
  state.audioInspiration = null;
  state.recordAudioInspiration = null;
  state.social = { friends: [], incomingRequests: [], outgoingRequests: [] };
  state.socialReady = false;
  state.activeFriendId = "";
  state.friendMessages = [];
  clearInterval(state.socialPoll);
  state.socialPoll = null;
  clearInterval(state.collaborationPoll);
  state.collaborationPoll = null;
  state.receivedShares = [];
  state.collaborations = [];
  localStorage.removeItem(AUTH_KEY);
  $("#account-menu").removeAttribute("open");
  updateLibraryCounts();
  setAuthMode("login");
  state.workspaceReady = false;
  state.returnPath = routePath("studio");
  setRoute(`${routePath("login")}?next=${encodeURIComponent(state.returnPath)}`, true);
  showAuth();
});
$("#back-to-creation").addEventListener("click", showCreationWorkspace);
$("#close-share-dialog").addEventListener("click", closeShareDialog);
$("#share-dialog").addEventListener("click", (event) => {
  if (event.target === event.currentTarget) closeShareDialog();
});
$("#share-dialog").addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    event.preventDefault();
    closeShareDialog();
  }
});
$("#share-dialog").addEventListener("close", () => {
  state.currentShareToken = "";
  $("#share-result").hidden = true;
  $("#share-friend-panel").hidden = true;
  $("#access-code").value = "";
  $("#expires-days").value = "7";
});
$("#copy-link").addEventListener("click", async () => {
  await navigator.clipboard.writeText($("#share-url").value);
  toast("分享链接已复制");
});

async function initializeWorkspace() {
  if (state.workspaceReady) return;
  await loadMeta();
  updateCreationMode();
  await Promise.all([loadProjects(), loadReceivedShares(), loadCollaborations(), loadSocial(true)]);
  if (!state.socialPoll) {
    state.socialPoll = setInterval(async () => {
      await loadSocial(true);
      if (state.activeFriendId) await loadFriendMessages(true);
    }, 2000);
  }
  if (!state.collaborationPoll) {
    state.collaborationPoll = setInterval(loadCollaborations, 5000);
  }
  state.workspaceReady = true;
}

async function openSharedDemo() {
  $("#main-nav").hidden = false;
  $("#account-menu").hidden = false;
  switchView("share");
  await loadShare(state.shareToken, savedShareCode(state.shareToken));
}

async function applyCurrentRoute() {
  let route = parseRoute(location.pathname, location.search);
  if (route.legacy) {
    setRoute(routePath("share", { token: route.token }), true);
    route = parseRoute(location.pathname, location.search);
  }
  if (route.root) {
    setRoute(routePath("studio"), true);
    route = parseRoute(location.pathname, location.search);
  }

  if (route.name === "share") {
    state.shareToken = route.token;
    $("#main-nav").hidden = false;
    $("#account-menu").hidden = false;
    if (!state.user) {
      setAuthMode("login");
      showAuth();
      return;
    }
    hideAuth();
    await openSharedDemo();
    return;
  }

  state.shareToken = "";
  $("#main-nav").hidden = false;
  $("#account-menu").hidden = false;

  if (route.name === "login" || route.name === "register") {
    if (state.user && !state.user.guest) {
      const next = new URLSearchParams(location.search).get("next") || routePath("studio");
      setRoute(next, true);
      await applyCurrentRoute();
      return;
    }
    state.returnPath = new URLSearchParams(location.search).get("next") || routePath("studio");
    setAuthMode(route.name);
    showAuth();
    return;
  }

  if (!state.user || state.user.guest) {
    state.user = null;
    state.returnPath = `${location.pathname}${location.search}`;
    setRoute(`${routePath("login")}?next=${encodeURIComponent(state.returnPath)}`, true);
    setAuthMode("login");
    showAuth();
    return;
  }

  hideAuth();
  await initializeWorkspace();

  if (route.name === "studio") return showCreationWorkspace(false);
  if (route.name === "inspirations") return showInspirations(false);
  if (route.name === "library") return openLibrary("mine", false);
  if (route.name === "received") return openLibrary("received", false);
  if (route.name === "collaborations") return openLibrary("collaborations", false);
  if (route.name === "editor") {
    const project = state.projects.find((item) => item.id === route.projectId);
    const version = project?.versions.find((item) => item.id === route.versionId);
    if (project && version) return openVersionEditor(project, version, false);
    toast("没有找到要编辑的 Demo 版本");
    setRoute(routePath("library"), true);
    return openLibrary("mine", false);
  }
  if (route.name === "demo") {
    const project = state.projects.find((item) => item.id === route.projectId);
    const version = project?.versions.find((item) => item.id === route.versionId);
    if (project && version) return openReviewWorkspace(project, version, false);
    toast("没有找到这个 Demo 版本");
    setRoute(routePath("library"), true);
    return openLibrary("mine", false);
  }

  setRoute(routePath("studio"), true);
  showCreationWorkspace(false);
}

addEventListener("popstate", () => {
  applyCurrentRoute().catch((error) => toast(error.message));
});

(async function init() {
  setupAudioUploaders();
  setupVoiceRecorder();
  await restoreSession();
  await applyCurrentRoute();
})();
