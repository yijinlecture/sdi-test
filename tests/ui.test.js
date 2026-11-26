// tests/ui.test.js — 화면 규칙 (SPEC.md 3절 · 4절): 배지 글자와 색은 public/format.js가 정함
import { test } from "node:test";
import assert from "node:assert/strict";
import { severityBadge, statusBadge } from "../public/format.js";

test("화면: 심각도 배지는 긴급 빨강 · 주의 주황 · 정보 회색 · 미분류 점선이다", () => {
  assert.deepEqual(severityBadge("urgent"), { label: "긴급", cls: "sev-urgent" });
  assert.deepEqual(severityBadge("warning"), { label: "주의", cls: "sev-warning" });
  assert.deepEqual(severityBadge("info"), { label: "정보", cls: "sev-info" });
  assert.deepEqual(severityBadge("none"), { label: "미분류", cls: "sev-none" });
});

test("화면: 상태 배지는 접수 · 배정 · 완료다", () => {
  assert.equal(statusBadge("open").label, "접수");
  assert.equal(statusBadge("assigned").label, "배정");
  assert.equal(statusBadge("resolved").label, "완료");
});
