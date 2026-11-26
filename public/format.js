// public/format.js — 화면에 보일 글자와 색을 정하는 곳 (SPEC.md 3절 · 4절)
// 화면(index.html)과 테스트(tests/ui.test.js)가 같이 씀 → 화면 규칙도 npm test로 확인할 수 있음

export const SEVERITY = { urgent: "긴급", warning: "주의", info: "정보", none: "미분류" };
export const STATUS = { open: "접수", assigned: "배정", resolved: "완료" };
export const CATEGORY = { ELECTRIC: "전기", HVAC: "공조", IT_DEVICE: "IT기기", BUILDING: "건물", none: "미분류" };
export const BUILDING = { office: "사무동", plant: "생산동" };

// 심각도 배지: 글자와 색 이름(class) — 긴급 빨강 · 주의 주황 · 정보 회색 · 미분류 회색 점선
export function severityBadge(severity) {
  if (severity === "urgent") return { label: SEVERITY.urgent, cls: "sev-urgent" };
  if (severity === "warning") return { label: SEVERITY.warning, cls: "sev-warning" };
  if (severity === "info") return { label: SEVERITY.info, cls: "sev-info" };
  return { label: SEVERITY.none, cls: "sev-none" };
}

// AC-13 (피드백 FB-1): AI 제안을 승인 · 거절했는지 카드에서 바로 보이게
export function aiStatusBadge(aiStatus) {
  if (aiStatus === "approved") return { label: "AI 제안 승인됨", cls: "ai-approved" };
  if (aiStatus === "rejected") return { label: "AI 제안 거절함", cls: "ai-rejected" };
  return null;
}

// AC-14 (피드백 FB-2): 긴급 카드는 휴대폰에서도 한눈에 (빨간 굵은 띠 · CSS는 index.html)
export function cardClass(t) {
  return t.severity === "urgent" ? "card urgent" : "card";
}

// 상태 배지: 접수 파랑 · 배정 노랑 · 완료 초록
export function statusBadge(status) {
  return { label: STATUS[status] || status, cls: `st-${status}` };
}
