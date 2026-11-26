// db.js — DB 창구 하나. server.js는 이 파일의 함수(list · get · create · update)만 부르고, DB가 무엇인지는 모름
// 저장소는 Supabase 하나. SUPABASE_URL · SUPABASE_SECRET_KEY가 없으면 오류로 멈춤 (다른 DB로 바뀌지 않음)
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));

// 시드 40건 (data/seed.json) · AI 칸은 비어 있음
const seed = () => JSON.parse(readFileSync(path.join(ROOT, "data", "seed.json"), "utf-8")).map((r) => ({ ...AI_EMPTY, ...r }));
// 한국 시각 문자열 (예: 2026-11-24T09:12:00+09:00)
const now = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 19) + "+09:00";
// 새 신고의 기본값 (SPEC.md 6절) + AI 제안 칸 (실습 1-2 · migrations/*/002_ai.sql)
const AI_EMPTY = { ai_severity: "", ai_category: "", ai_reason: "", ai_status: "none", answer: "", ai_hold: 0, ai_corrected: 0, ai_before: "" };
const DEFAULTS = { body: "", building: "office", asset_id: "", severity: "none", category: "none", status: "open", assignee: "", ...AI_EMPTY };
// 터미널에 "요청의 여정" 가운데 줄을 찍음
const log = (line, values) => console.log(`   [API→DB] ${line}${values ? "  ← " + JSON.stringify(values) : ""}`);

// 정렬 규칙 (SPEC.md 5절): 긴급 → 주의 → 정보 → 미분류, 같으면 번호가 작은 것부터
const RANK = { urgent: 0, warning: 1, info: 2, none: 3 };
const byUrgency = (a, b) => RANK[a.severity] - RANK[b.severity] || a.id - b.id;

// ── supabase: REST API를 fetch로 (서버 전용 키 · RLS는 켜고 정책 없음 → 이 키를 가진 서버만 들어감) ──
let seeded = false;
async function sb(pathAndQuery, options = {}) {
  const url = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error(".env에 SUPABASE_URL · SUPABASE_SECRET_KEY(서버 전용 키)가 필요합니다");
  const headers = { apikey: key, "Content-Type": "application/json", Prefer: "return=representation" };
  if (key.startsWith("eyJ")) headers.Authorization = `Bearer ${key}`; // 예전 방식 키(JWT)일 때만
  const sent = options.body ? JSON.parse(options.body) : undefined;
  log(`${options.method || "GET"} /rest/v1/${pathAndQuery}`, Array.isArray(sent) ? [`${sent.length}건`] : sent); // 여러 건이면 건수만
  const res = await fetch(`${url}/rest/v1/${pathAndQuery}`, { ...options, headers });
  const data = res.status === 204 ? null : await res.json();
  if (!res.ok) throw new Error(`Supabase 오류 ${res.status}: ${data?.message || ""} (공개 키를 넣지 않았는지 · 001_reports.sql을 Run 했는지 확인)`);
  return data;
}
async function seedSupabase() {
  if (seeded) return;
  const some = await sb("reports?select=id&limit=1");
  if (some.length === 0) {
    // 번호(id)는 Supabase가 1부터 매기게 빼고 넣음 (seed.json 순서 그대로 1~40)
    await sb("reports", { method: "POST", body: JSON.stringify(seed().map(({ id, ...r }) => r)) });
    console.log("[DB] 시드 40건 넣음 (Supabase)");
  }
  seeded = true;
}
const supabase = {
  async list(status) {
    await seedSupabase();
    return sb("reports?select=*" + (status ? `&status=eq.${encodeURIComponent(status)}` : ""));
  },
  async get(id) {
    await seedSupabase();
    return (await sb(`reports?select=*&id=eq.${Number(id)}`))[0] ?? null;
  },
  async create(row) {
    await seedSupabase();
    return (await sb("reports", { method: "POST", body: JSON.stringify({ ...DEFAULTS, ...row, created_at: now() }) }))[0];
  },
  async update(id, patch) {
    await seedSupabase();
    return (await sb(`reports?id=eq.${Number(id)}`, { method: "PATCH", body: JSON.stringify(patch) }))[0] ?? null;
  },
};

// ── server.js가 부르는 함수 4개 ──
export const list = async (status) => [...(await supabase.list(status))].sort(byUrgency);
export const get = (id) => supabase.get(id);
export const create = (row) => supabase.create(row);
export const update = (id, patch) => supabase.update(id, patch);
