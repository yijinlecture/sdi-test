// ai.js — Claude(신입 사원) 호출은 모두 이 파일 하나에서. 서버의 다른 곳은 Claude를 직접 부르지 않음
// 패키지 없이 fetch로 Messages API를 부름: POST https://api.anthropic.com/v1/messages
// 항상 실제 호출 (.env의 ANTHROPIC_API_KEY) · 키가 없으면 AI를 쓸 수 없다는 오류(503)를 돌려줌 (녹화 응답으로 바뀌지 않음)
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const prompt = (name) => readFileSync(path.join(ROOT, "prompts", name), "utf-8");

export const MODEL = process.env.AI_MODEL || "claude-sonnet-5-5";
const TIMEOUT_MS = () => Number(process.env.AI_TIMEOUT_MS || 20000);

// 신입이 결근(키 오류 · 네트워크 · 한도 · 시간 초과) → 서버가 503으로 안내하고 사람이 직접 처리
export class AiUnavailable extends Error {}

// 최근 호출의 토큰 사용량(usage) — 실습 1-7 비용 비교용
export const usageLog = [];
function record(feature, usage) {
  if (!usage) return;
  usageLog.push({ at: new Date().toISOString(), feature, ...usage });
  if (usageLog.length > 50) usageLog.shift();
}

// ── 실제 호출 ──
async function post(body) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new AiUnavailable("키 없음");
  let res;
  try {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        // 안전 분류기가 거절하면 서버가 다른 모델로 한 번 더 시도 (refusal 대비 · 그래도 거절이면 stop_reason이 refusal)
        "anthropic-beta": "server-side-fallback-2026-07-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({ ...body, fallbacks: "default" }),
      signal: AbortSignal.timeout(TIMEOUT_MS()),
    });
  } catch (e) {
    throw new AiUnavailable(e.name === "TimeoutError" ? "시간 초과" : "네트워크");
  }
  if (!res.ok) throw new AiUnavailable({ 401: "키 오류", 429: "사용 한도", 529: "과부하" }[res.status] || `HTTP ${res.status}`);
  return res;
}

async function call(feature, body) {
  const msg = await (await post(body)).json();
  record(feature, msg.usage);
  return msg;
}
export const textOf = (msg) => (msg.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");

// 신고 글 (요청문에 넣는 모양)
// 방어 ①(실습 3-2): <report>로 감싸 지시와 구분 · 글 속 <report> 태그로 포장을 깨려는 시도는 지움
const clean = (s) => String(s ?? "").replace(/<\/?report>/gi, "");
export const reportText = (t) => `<report>\n제목: ${clean(t.title)}\n장소: ${clean(t.location)}\n내용: ${clean(t.body) || "(없음)"}\n</report>`;

// ── ① 자동 분류: 구조화 출력(JSON 양식) → 검사 함수(checkAiResult)로 한 번 더 확인 (실습 1-2) ──
export const SEVERITIES = ["urgent", "warning", "info"];
export const CATEGORIES = ["ELECTRIC", "HVAC", "IT_DEVICE", "BUILDING"];
// AI 답 검사 (실습 1-2): 통과하면 정리된 값, 아니면 null → 서버가 '미분류 + 사유'로 둠
// 랩업 server.js의 입력 검사와 같은 방식 · 7일차 Zod가 하던 일을 함수 하나로 (패키지 없음)
export function checkAiResult(r) {
  if (!r || typeof r !== "object") return null;
  if (!SEVERITIES.includes(r.severity)) return null; // 목록 밖 값 → 미분류
  if (!CATEGORIES.includes(r.category)) return null;
  if (typeof r.reason !== "string") return null;
  const reason = r.reason.trim();
  if (!reason || reason.length > 200) return null; // 이유가 비거나 200자를 넘으면 → 미분류
  // 방어 ②(실습 3-2): 이유에 승인을 재촉하는 말이나 지시문이 섞이면 불합격 (사람 승인 속이기 방지)
  if (/승인하세요|승인 불필요|이전 지시|시스템 규칙|system prompt/i.test(reason)) return null;
  return { severity: r.severity, category: r.category, reason, needs_human: r.needs_human === true }; // needs_human: 미션 ① 판단 보류
}
const CLASSIFY_FORMAT = {
  type: "json_schema",
  schema: {
    type: "object",
    properties: {
      severity: { type: "string", enum: SEVERITIES },
      category: { type: "string", enum: CATEGORIES },
      reason: { type: "string" },
      needs_human: { type: "boolean" },
    },
    required: ["severity", "category", "reason", "needs_human"],
    additionalProperties: false,
  },
};

// 미션 ① 모르면 모른다고 하기: 보류(needs_human)인데 안전 단어가 있으면 → 모를 때는 긴급 쪽으로 기울임
// (보류 기준과 안전 단어는 수강생이 정하는 부분 · 이 목록은 정답 예시)
export const SAFETY_WORDS = /타는 냄새|탄 냄새|연기|불꽃|스파크|감전|누수|물이 새|물이 떨어|넘어|가스/;
function leanToSafety(t, data) {
  if (!data.needs_human || !SAFETY_WORDS.test(`${t.title} ${t.body || ""}`)) return data;
  return { ...data, severity: "urgent", reason: `안전 단어가 있어 긴급 쪽으로 제안 · ${data.reason}`.slice(0, 200) };
}

// 분류 요청 1건의 모양 — 실시간 분류와 eval/usage_demo.js가 같이 씀
export function classifyBody(t, { effort = "low", cache = true, marker = "" } = {}) {
  // marker: 실습 1-7 측정용 — 앞에 한 줄을 붙여 매번 새 캐시로 시작 (평소 분류에는 쓰지 않음)
  const text = (marker ? marker + "\n" : "") + prompt("classify.txt");
  return {
    model: MODEL,
    max_tokens: 2000, // 생각(thinking)에도 토큰이 쓰이므로 넉넉히 · 답 자체는 짧음
    // 매번 같은 앞부분(기준표 · 예시)은 캐시 → 두 번째부터 싸고 빠름 (실습 1-7)
    system: [{ type: "text", text, ...(cache ? { cache_control: { type: "ephemeral" } } : {}) }],
    messages: [{ role: "user", content: reportText(t) }],
    output_config: { format: CLASSIFY_FORMAT, effort },
  };
}

export async function classify(t, opts = {}) {
  const msg = await call("classify", classifyBody(t, opts));
  // 실습 1-5: 거절(refusal)이거나 빈 답이면 → 서비스는 멈추지 않고 '미분류 + 사유'로
  if (msg.stop_reason === "refusal") return { ok: false, empty: true, why: "AI가 답을 거절함 — 직접 분류해 주세요", usage: msg.usage };
  if (!textOf(msg).trim()) return { ok: false, empty: true, why: "AI가 결과를 주지 않음 — 직접 분류해 주세요", usage: msg.usage };
  let json = null;
  try {
    json = JSON.parse(textOf(msg));
  } catch {
    // JSON이 아니면 아래에서 불합격
  }
  const data = checkAiResult(json);
  return data ? { ok: true, data: leanToSafety(t, data), usage: msg.usage } : { ok: false, why: "AI 답이 형식에 맞지 않음 — 직접 분류해 주세요", usage: msg.usage };
}

// ── ② 담당 추천: 도구 사용(읽기 전용) → 추천만, 배정은 사람이 (실습 1-3 · 미션) ──
export const HANDLERS = ["이주임", "최대리", "정사원", "한과장"];
// 추천 결과 검사 (실습 1-3): checkAiResult의 짝 — 담당자는 4명 중 한 명 · 이유는 1~200자
export function checkRecommendResult(r) {
  if (!r || typeof r !== "object" || !HANDLERS.includes(r.name)) return null;
  if (typeof r.reason !== "string") return null;
  const reason = r.reason.trim();
  if (!reason || reason.length > 200) return null;
  return { name: r.name, reason };
}
const TOOLS = [
  {
    name: "get_handler_load",
    description: "시설팀 담당자 4명과 사람마다 지금 처리 중(assigned)인 신고 건수를 조회한다. 읽기 전용.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  // 미션: 두 번째 도구 — 같은 설비의 최근 신고 · 보증 기간(data/assets.json) · 읽기 전용
  {
    name: "get_asset_history",
    description: "설비 번호(예: PR-3F-02)로 그 설비의 이름 · 보증 만료일 · 최근 7일 신고 건수를 조회한다. 신고에 설비 번호가 있을 때만 쓴다. 읽기 전용.",
    input_schema: { type: "object", properties: { asset_id: { type: "string" } }, required: ["asset_id"], additionalProperties: false },
  },
];

// tools: { get_handler_load: async () => ..., get_asset_history: async (asset_id) => ... } — 실행은 서버가 함
export async function recommend(t, tools) {
  const used = [];
  const messages = [
    { role: "user", content: `아래 신고를 맡을 담당자 1명을 추천해 줘.\n${reportText(t)}\n설비 번호: ${t.asset_id || "(없음)"}` },
  ];
  for (let turn = 0; turn < 3; turn++) {
    // 최대 3바퀴 (도구를 끝없이 부르지 않게)
    const msg = await call("recommend", { model: MODEL, max_tokens: 2000, system: prompt("recommend.txt"), tools: TOOLS, messages });
    if (msg.stop_reason === "tool_use") {
      messages.push({ role: "assistant", content: msg.content });
      const results = [];
      for (const b of msg.content.filter((x) => x.type === "tool_use")) {
        used.push(b.name);
        const fn = tools[b.name];
        const out = fn ? await fn(String(b.input?.asset_id || "")) : { error: "없는 도구" };
        results.push({ type: "tool_result", tool_use_id: b.id, content: JSON.stringify(out) });
      }
      messages.push({ role: "user", content: results });
      continue;
    }
    if (msg.stop_reason === "refusal") throw new AiUnavailable("답 거절");
    const raw = textOf(msg).replace(/^```(json)?|```$/g, "").trim();
    const data = checkRecommendResult((() => { try { return JSON.parse(raw); } catch { return null; } })());
    if (!data) return { ok: false };
    return { ok: true, data: { ...data, tools: used } };
  }
  return { ok: false, why: "도구를 너무 많이 불렀습니다" };
}

// ── 스트리밍 공통: 글자가 도착하는 대로 onText로 넘김 (안내문 초안 · 챗봇이 같이 씀) ──
async function stream(feature, body, onText) {
  // 서버가 보내는 이벤트(SSE)를 한 줄씩 읽음: data: {...}
  const res = await post({ ...body, stream: true });
  const decoder = new TextDecoder();
  let buf = "";
  let full = "";
  let usage = {};
  for await (const chunk of res.body) {
    buf += decoder.decode(chunk, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop();
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const ev = JSON.parse(line.slice(6));
      if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") {
        full += ev.delta.text;
        onText(ev.delta.text);
      }
      if (ev.type === "message_start") usage = { ...ev.message.usage };
      if (ev.type === "message_delta" && ev.usage) usage = { ...usage, ...ev.usage };
    }
  }
  record(feature, usage);
  return full;
}

// ── ③ 안내문 초안: 스트리밍 (실습 1-4) · 안전 문구는 AI가 아니라 서버가 정해진 문장으로 붙임 ──
export async function draft(t, onText) {
  return stream("draft", { model: MODEL, max_tokens: 800, system: prompt("draft.txt"), messages: [{ role: "user", content: reportText(t) }] }, onText);
}

// ── ④ 챗봇 (실습 1-6): API는 기억이 없음 → 화면이 들고 온 대화(최근 10턴 = 20개)를 매번 다시 보냄 ──
// 질문은 <question>으로 감싸 지시와 구분 (질문 속 "규칙 무시" 같은 지시는 따르지 않게)
const cleanQ = (s) => String(s ?? "").replace(/<\/?question>/gi, "");
export const chatMessages = (history) =>
  history.slice(-20).map((m) => ({ role: m.role, content: m.role === "user" ? `<question>\n${cleanQ(m.content)}\n</question>` : m.content }));

export async function chat(history, onText) {
  return stream("chat", { model: MODEL, max_tokens: 600, system: prompt("chat.txt"), messages: chatMessages(history) }, onText);
}

// node --env-file=.env ai.js 로 이 파일만 직접 실행하면: 연결 확인 1번 ("연결 성공" + usage)
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const r = await classify({ title: "연결 확인", location: "사무동", body: "연결 확인용 신고" });
    console.log(`연결 성공 · 답: ${r.ok ? JSON.stringify(r.data) : "형식 불일치"}`);
    console.log("usage:", JSON.stringify({ input: r.usage?.input_tokens, output: r.usage?.output_tokens, cache_read: r.usage?.cache_read_input_tokens ?? 0 }));
  } catch (e) {
    console.log(`연결 실패: ${e.message} → .env의 ANTHROPIC_API_KEY 확인`);
  }
}
