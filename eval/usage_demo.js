// eval/usage_demo.js — 실습 1-7: 같은 신고를 네 번 분류해 usage(토큰 사용량)를 표로 비교
// 실행: node --env-file=.env eval/usage_demo.js   (키가 없으면 오류로 멈춤)
// 이 파일은 ai.js를 부르지 않고 Messages API를 직접 부릅니다 → 내가 만든 ai.js의 함수 이름 · 모양과 상관없이 돌아감
// (11/25 리허설: 학생 ai.js에는 mode() · classify(t, 옵션)가 없어 예전 버전이 바로 오류가 났음)
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf-8");
const key = process.env.ANTHROPIC_API_KEY;
if (!key) {
  console.error("ANTHROPIC_API_KEY가 없습니다. .env에 키를 넣고 node --env-file=.env eval/usage_demo.js 로 실행하세요");
  process.exit(1);
}
const MODEL = process.env.AI_MODEL || "claude-sonnet-5-5";

// 분류할 신고 (랩업에서 만든 누수 신고)
const report = "제목: 2층 천장에서 물이 샙니다\n장소: 사무동 2F 복도\n내용: 복도 끝 천장 타일이 젖어 있고 바닥에 물이 고였어요";
// 답의 모양(구조화 출력) — SPEC.md 4절 심각도 · 6절 유형
const FORMAT = {
  type: "json_schema",
  schema: {
    type: "object",
    properties: {
      severity: { type: "string", enum: ["urgent", "warning", "info"] },
      category: { type: "string", enum: ["ELECTRIC", "HVAC", "IT_DEVICE", "BUILDING"] },
      reason: { type: "string" },
    },
    required: ["severity", "category", "reason"],
    additionalProperties: false,
  },
};

async function classifyOnce({ cache, effort, marker = "" }) {
  // 기준표(prompts/classify.txt)를 system에 넣고, cache면 캐시 표시를 붙임
  const text = (marker ? marker + "\n" : "") + read("../prompts/classify.txt");
  const body = {
    model: MODEL,
    max_tokens: 2000,
    system: [{ type: "text", text, ...(cache ? { cache_control: { type: "ephemeral" } } : {}) }],
    messages: [{ role: "user", content: report }],
    output_config: { format: FORMAT, effort },
  };
  const t0 = Date.now();
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const msg = await res.json();
  if (!res.ok) throw new Error(`HTTP ${res.status} ${msg.error?.message || ""} — .env의 ANTHROPIC_API_KEY · AI_MODEL 확인`);
  let result = "-";
  try {
    const out = JSON.parse((msg.content || []).filter((b) => b.type === "text").map((b) => b.text).join(""));
    result = `${out.severity} · ${out.category}`;
  } catch {
    result = "(JSON 아님)";
  }
  return { usage: msg.usage, ms: Date.now() - t0, result };
}

let runs;
{
  runs = [];
  // 측정마다 새 표시를 붙여 새 캐시로 시작 → ②-1은 "저장", ②-2부터 "읽기"가 나옴 (5분 안에 누가 같은 기준표로 불렀어도)
  const marker = `(측정 ${Date.now()})`;
  const cases = [
    ["① 기본 (캐시 없음 · effort high)", { cache: false, effort: "high" }],
    ["②-1 캐싱 첫 호출 (저장)", { cache: true, effort: "high", marker }],
    ["②-2 캐싱 두 번째 (읽기)", { cache: true, effort: "high", marker }],
    ["③ 캐싱 + effort low", { cache: true, effort: "low", marker }],
  ];
  for (const [label, opt] of cases) runs.push({ case: label, ...(await classifyOnce(opt)) });
}
console.log("경우 | 입력 | 캐시 저장 | 캐시 읽기 | 출력 | 걸린 시간 | 분류 결과");
for (const r of runs) {
  const u = r.usage || {};
  console.log(`${r.case} | ${u.input_tokens ?? 0} | ${u.cache_creation_input_tokens ?? 0} | ${u.cache_read_input_tokens ?? 0} | ${u.output_tokens ?? 0} | ${r.ms}ms | ${r.result ?? "-"}`);
}
console.log("\n읽는 법: ②-2의 캐시 읽기가 0보다 크면 성공 (같은 기준표는 캐시로 할인)");
console.log("③은 effort를 낮춘 것 — 분류 결과가 ①과 같은지 확인 (쉬운 일은 낮은 effort로)");
console.log("짧은 분류는 effort를 낮춰도 출력 토큰 차이가 작을 수 있음 → 비용은 주로 캐시에서 줄어듦 (11/24 실측: 출력 60 그대로)");
console.log("9일차 운영비 계산의 '건당 토큰'에 ③의 입력 · 캐시 읽기 · 출력 값을 씀");
console.log("캐시 읽기가 계속 0이면: 기준표(prompts/classify.txt)가 모델의 최소 캐시 길이보다 짧은지 확인");
