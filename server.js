// server.js — API 창구. 하는 일 3가지: ① 주소 찾기 ② 입력 검사 ③ db.js를 부르고 응답
// 실행: npm start → http://localhost:8080 (PORT 환경변수로 바꿀 수 있음)
import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readFileSync } from "node:fs";
import * as db from "./db.js";
import * as ai from "./ai.js";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, "public");
// 미션: 자산 대장 (설비 번호 · 이름 · 보증 만료일) — 읽기 전용 파일
const ASSETS = JSON.parse(readFileSync(path.join(ROOT, "data", "assets.json"), "utf-8"));
// 실습 1-4: 긴급 신고 안내문의 안전 문구는 AI가 쓰지 않고 이 정해진 문장만 씀
export const SAFETY = "[안전 안내] 누수 · 타는 냄새 · 스파크가 있는 곳에는 가까이 가지 말고, 시설팀이 도착할 때까지 주변 사람의 접근을 막아 주세요.";

// SPEC.md 2절 · 5절의 정해진 값
const HANDLERS = ["이주임", "최대리", "정사원", "한과장"];
const STATUSES = ["open", "assigned", "resolved"];
const BUILDINGS = ["office", "plant"];

// ── 실패 응답: 항상 { error: { code, message } } ──
class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
const bad = (message) => {
  throw new HttpError(400, "BAD_INPUT", message);
};
const notFound = (message) => {
  throw new HttpError(404, "NOT_FOUND", message);
};

// ── 입력 검사 (SPEC.md 5절 입력 규칙) ──
// 글자 칸: 앞뒤 빈칸을 빼고 길이를 봄. 필수인데 비었으면 400
function text(value, { name, max, required }) {
  if (value === undefined || value === null) value = "";
  if (typeof value !== "string") bad(`${name}은(는) 글자로 보내 주세요`);
  const v = value.trim();
  if (required && !v) bad(`${name}을(를) 입력하세요`);
  if (v.length > max) bad(`${name}은(는) ${max}자 이하로 써 주세요`);
  return v;
}
function checkNewReport(b) {
  const row = {
    title: text(b.title, { name: "제목", max: 100, required: true }),
    location: text(b.location, { name: "장소", max: 50, required: true }),
    reporter_name: text(b.reporter_name, { name: "이름", max: 20, required: true }),
    body: text(b.body, { name: "내용", max: 1000 }),
    asset_id: text(b.asset_id, { name: "설비 번호", max: 20 }),
    building: b.building ?? "office",
  };
  if (!BUILDINGS.includes(row.building)) bad("건물은 office(사무동) 또는 plant(생산동)입니다");
  // AC-15 (피드백 FB-3): 생산동 신고는 어느 기계인지 알아야 하므로 설비 번호가 필수
  if (row.building === "plant" && !row.asset_id) bad("생산동 신고는 설비 번호를 써 주세요");
  return row;
}
function checkPatch(b) {
  const patch = {};
  if (b.assignee !== undefined) {
    if (!HANDLERS.includes(b.assignee)) bad(`담당자는 ${HANDLERS.join(" · ")} 중 한 명입니다`);
    patch.assignee = b.assignee;
    patch.status = "assigned"; // 담당자를 정하면 상태는 자동으로 '배정'
  }
  if (b.status !== undefined) {
    if (!STATUSES.includes(b.status)) bad(`상태는 ${STATUSES.join(" · ")} 중 하나입니다`);
    patch.status = b.status;
  }
  // 실습 1-4: 사람이 [보내기]를 누른 안내문
  if (b.answer !== undefined) patch.answer = text(b.answer, { name: "안내문", max: 2000, required: true });
  // 미션 ②: 사람이 심각도를 직접 정하거나 고침
  if (b.severity !== undefined) {
    if (!ai.SEVERITIES.includes(b.severity)) bad("심각도는 urgent · warning · info 중 하나입니다");
    patch.severity = b.severity;
  }
  if (Object.keys(patch).length === 0) bad("바꿀 값(assignee · status · answer · severity)을 보내 주세요");
  return patch;
}

// 미션 ②: 사람이 AI와 다르게 정했거나, AI가 보류한 건을 사람이 정했으면 → 평가셋 후보로 표시
function markCorrection(t, patch) {
  if (patch.severity === undefined || !t.ai_severity) return patch;
  if (patch.severity !== t.ai_severity || Number(t.ai_hold) === 1) return { ...patch, ai_corrected: 1, ai_before: t.ai_severity };
  return patch;
}
// 평가셋 후보: eval/golden.json과 같은 모양 (eval/candidates.js가 파일로 내보냄)
export async function candidates() {
  return (await db.list())
    .filter((t) => Number(t.ai_corrected) === 1)
    .map((t) => ({ id: t.id, title: t.title, location: t.location, body: t.body, expected: t.severity, ai: t.ai_before, hold: Number(t.ai_hold) === 1 }));
}
const idOf = (params) => Number(params.id);
async function mustGet(params) {
  const t = await db.get(idOf(params));
  if (!t) notFound(`${params.id}번 신고가 없습니다`);
  return t;
}

// ── AI 공통: 신입이 결근하면(키 · 네트워크 · 한도 · 시간 초과) 503 → 화면은 "직접 처리"를 안내 ──
async function aiOrFail(fn) {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ai.AiUnavailable) throw new HttpError(503, "AI_UNAVAILABLE", `지금은 AI를 쓸 수 없습니다(${e.message}). 직접 처리해 주세요`);
    throw e;
  }
}
const classifying = new Set(); // 실습 1-5: 같은 신고를 분류하는 중이면 409 (Claude 호출은 1번만)

// 방어 ④(실습 3-2): 연타 제한 — 접속 주소(IP)마다 AI 기능 1분에 10회 · 챗봇 20회 (서버 메모리) · 넘으면 429
// 로그인이 없으므로 사람 대신 접속 주소로 셈 (Vercel에서는 x-forwarded-for의 첫 주소가 접속한 사람)
const LIMITS = { ai: () => Number(process.env.AI_PER_MINUTE || 10), chat: () => Number(process.env.CHAT_PER_MINUTE || 20) };
const hits = new Map();
function limit(req, kind) {
  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket?.remoteAddress || "?";
  const key = `${ip}:${kind}`;
  const now = Date.now();
  const recent = (hits.get(key) || []).filter((t) => now - t < 60_000);
  if (recent.length >= LIMITS[kind]()) {
    throw new HttpError(429, "TOO_MANY", kind === "chat" ? "챗봇은 1분에 정해진 횟수까지입니다. 잠시 후 다시 시도하세요" : "AI 기능은 1분에 10번까지입니다. 잠시 후 다시 시도하세요");
  }
  hits.set(key, [...recent, now]);
}

// 도구 실행은 서버가 함 — 둘 다 조회만 (실습 1-3 · 미션)
const tools = {
  async get_handler_load() {
    const assigned = await db.list("assigned");
    return ai.HANDLERS.map((name) => ({ name, assigned: assigned.filter((t) => t.assignee === name).length }));
  },
  async get_asset_history(assetId) {
    const asset = ASSETS.find((a) => a.asset_id === assetId);
    if (!asset) return { error: "자산 대장에 없는 설비 번호" };
    // "최근 7일"은 DB에서 가장 최근 신고 시각을 기준으로 셈 (실습 데이터 날짜와 수업 날짜가 달라도 같은 결과)
    const all = await db.list();
    const latest = Math.max(...all.map((t) => new Date(t.created_at).getTime()));
    const recent = all.filter((t) => t.asset_id === assetId && new Date(t.created_at).getTime() >= latest - 7 * 24 * 3600e3);
    return { ...asset, reports_last_7_days: recent.length, titles: recent.map((t) => t.title) };
  },
};

// 글자를 받는 대로 화면에 흘려보냄 (안내문 초안 · 챗봇) · 끊기면 [연결 끊김] 한 줄
// 첫 글자가 오기 전에 실패하면 → 503 JSON (화면이 "직접 처리" 안내) · 중간에 끊기면 → 받은 글 + 안내 한 줄
async function streamText(res, run) {
  let started = false;
  const write = (piece) => {
    if (!started) res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache" });
    started = true;
    res.write(piece);
  };
  try {
    await run(write);
  } catch (e) {
    if (!started) {
      if (e instanceof ai.AiUnavailable) throw new HttpError(503, "AI_UNAVAILABLE", `지금은 AI를 쓸 수 없습니다(${e.message}). 직접 처리해 주세요`);
      throw e;
    }
    res.write(`\n[연결 끊김] AI 응답이 중간에 끊겼습니다(${e instanceof ai.AiUnavailable ? e.message : "오류"}). 받은 글까지는 남아 있습니다.`);
  }
  if (!started) res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
  res.end();
}

// 챗봇 입력 검사 (실습 1-6): 최근 10턴(20개)까지만 · 역할은 user/assistant · 마지막은 user
function checkChat(b) {
  const m = b.messages;
  if (!Array.isArray(m) || m.length === 0) bad("messages(대화)를 보내 주세요");
  if (m.length > 20) bad("대화는 최근 10턴(20개)까지만 보낼 수 있습니다");
  for (const x of m) {
    if (!["user", "assistant"].includes(x?.role) || typeof x.content !== "string" || !x.content.trim() || x.content.length > 2000) bad("대화 형식이 맞지 않습니다");
  }
  if (m.at(-1).role !== "user") bad("마지막은 질문(user)이어야 합니다");
  return m;
}

// ── 주소표: [방법, 주소 모양, 할 일] ──
const routes = [
  ["GET", "/api/reports", async ({ query }) => [200, await db.list(query.get("status") || undefined)]],
  ["POST", "/api/reports", async ({ body }) => [201, await db.create(checkNewReport(body))]],
  [
    "PATCH",
    "/api/reports/:id",
    async ({ params, body }) => {
      const patch = checkPatch(body);
      const t = await mustGet(params);
      return [200, await db.update(t.id, markCorrection(t, patch))];
    },
  ],
  // 미션 ②: 평가셋 후보 목록
  ["GET", "/api/eval/candidates", async () => [200, await candidates()]],

  // ── 실습 1-2 · 1-5: AI 분류 → 제안 칸(ai_*)에만 저장 ──
  [
    "POST",
    "/api/reports/:id/classify",
    async ({ params, req }) => {
      limit(req, "ai"); // 방어 ④
      const t = await mustGet(params);
      if (classifying.has(t.id)) throw new HttpError(409, "CLASSIFYING", "이미 분류 중입니다");
      classifying.add(t.id);
      let out;
      try {
        out = await aiOrFail(() => ai.classify(t));
      } finally {
        classifying.delete(t.id);
      }
      if (out.ok) {
        const { severity, category, reason, needs_human } = out.data;
        return [200, await db.update(t.id, { ai_severity: severity, ai_category: category, ai_reason: reason, ai_status: "suggested", ai_hold: needs_human ? 1 : 0 })];
      }
      // 빈 답 · 거절 · 검사 함수 불합격 → 멈추지 않고 '미분류 + 사유'를 제안으로 (실습 1-2 · 1-5)
      return [200, await db.update(t.id, { ai_severity: "none", ai_category: "none", ai_reason: out.why, ai_status: "suggested", ai_hold: 0 })];
    },
  ],
  // [승인]: 사람이 눌러야 제안이 진짜 칸으로 감 (선임의 결재)
  [
    "POST",
    "/api/reports/:id/approve",
    async ({ params }) => {
      const t = await mustGet(params);
      if (t.ai_status !== "suggested") throw new HttpError(409, "NO_SUGGESTION", "승인할 AI 제안이 없습니다");
      return [200, await db.update(t.id, { severity: t.ai_severity, category: t.ai_category, ai_status: "approved" })];
    },
  ],
  [
    "POST",
    "/api/reports/:id/reject",
    async ({ params }) => {
      const t = await mustGet(params);
      if (t.ai_status !== "suggested") throw new HttpError(409, "NO_SUGGESTION", "거절할 AI 제안이 없습니다");
      return [200, await db.update(t.id, { ai_status: "rejected" })];
    },
  ],
  // ── 실습 1-3: 담당 추천 (도구 사용 · 추천만, 배정은 사람이 [배정]에서) ──
  [
    "POST",
    "/api/reports/:id/recommend",
    async ({ params, req }) => {
      limit(req, "ai"); // 방어 ④
      const t = await mustGet(params);
      const out = await aiOrFail(() => ai.recommend(t, tools));
      if (!out.ok) throw new HttpError(502, "AI_BAD_OUTPUT", out.why || "AI 추천이 형식에 맞지 않습니다. 직접 골라 주세요");
      return [200, out.data];
    },
  ],
  // ── 실습 1-4: 안내문 초안 스트리밍 · 긴급이면 정해진 안전 문구를 맨 앞에 · 저장은 [보내기](PATCH answer)로 ──
  [
    "POST",
    "/api/reports/:id/draft",
    async ({ params, res, req }) => {
      limit(req, "ai"); // 방어 ④
      const t = await mustGet(params);
      const urgent = t.severity === "urgent" || t.ai_severity === "urgent";
      await streamText(res, async (write) => {
        if (urgent) write(SAFETY + "\n\n");
        await ai.draft(t, write);
      });
      return [200, null];
    },
  ],
  // ── 실습 1-6: 챗봇 (화면이 들고 있는 최근 10턴만 받음) ──
  [
    "POST",
    "/api/chat",
    async ({ body, res, req }) => {
      limit(req, "chat"); // 방어 ④
      const messages = checkChat(body);
      await streamText(res, (write) => ai.chat(messages, write));
      return [200, null];
    },
  ],
];

// "/api/reports/:id" 같은 모양과 실제 주소를 맞춰 봄
function match(pattern, pathname) {
  const a = pattern.split("/");
  const b = pathname.split("/");
  if (a.length !== b.length) return null;
  const params = {};
  for (let i = 0; i < a.length; i++) {
    if (a[i].startsWith(":")) params[a[i].slice(1)] = decodeURIComponent(b[i]);
    else if (a[i] !== b[i]) return null;
  }
  return params;
}

async function readJson(req) {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 100_000) bad("보낸 내용이 너무 큽니다");
  }
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    bad("JSON 형식이 아닙니다");
  }
}

const send = (res, status, data) => {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
};

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png" };
async function serveFile(res, pathname) {
  const file = path.join(PUBLIC, pathname === "/" ? "index.html" : decodeURIComponent(pathname));
  if (!file.startsWith(PUBLIC + path.sep)) return send(res, 404, { error: { code: "NOT_FOUND", message: "없는 파일입니다" } });
  try {
    const data = await readFile(file);
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
    res.end(data);
  } catch {
    send(res, 404, { error: { code: "NOT_FOUND", message: "없는 파일입니다" } });
  }
}

// ── 요청 하나를 처리 (Vercel도 이 함수를 입구로 씀) ──
export async function handle(req, res) {
  const url = new URL(req.url, "http://localhost");
  if (!url.pathname.startsWith("/api/")) return serveFile(res, url.pathname);

  const started = Date.now();
  console.log(`[화면→API] ${req.method} ${url.pathname}${url.search}`);
  let status = 500;
  try {
    let found = null;
    for (const [method, pattern, fn] of routes) {
      const params = match(pattern, url.pathname);
      if (params && method === req.method) found = { fn, params };
    }
    if (!found) notFound("없는 API 주소입니다");
    const body = ["POST", "PATCH"].includes(req.method) ? await readJson(req) : {};
    const [s, data] = await found.fn({ req, res, params: found.params, query: url.searchParams, body });
    status = s;
    if (!res.headersSent) send(res, s, data);
  } catch (e) {
    if (e instanceof HttpError) {
      status = e.status;
      send(res, e.status, { error: { code: e.code, message: e.message } });
    } else {
      status = 500;
      console.error(e); // 자세한 내용은 서버 터미널에만
      if (!res.headersSent) send(res, 500, { error: { code: "SERVER_ERROR", message: "서버 오류가 발생했습니다" } });
      else res.end();
    }
  }
  console.log(`[API→화면] ${status} (${Date.now() - started}ms)`);
}

// node server.js로 직접 켰을 때만 포트를 엶 (테스트 · Vercel은 handle만 가져다 씀)
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const port = Number(process.env.PORT || 8080);
  http.createServer(handle).listen(port, () => console.log(`SDI 시설 신고함 → http://localhost:${port} (DB: Supabase)`));
}

// Vercel 배포 입구 (실습 3-1): Vercel은 루트의 server.js가 기본으로 내보내는 함수를 입구로 씀
export default handle;
