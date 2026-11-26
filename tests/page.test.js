// tests/page.test.js — 고정 테스트(고치지 않음) · 화면 public/index.html의 스크립트에 문법 오류가 없는지
// API 테스트가 모두 통과해도, 화면 스크립트에 글자 하나가 틀리면 목록조차 뜨지 않습니다.
// (11/25 리허설: 1-6 챗봇을 넣다가 문자열 안에 줄바꿈이 들어가 화면 전체가 "불러오는 중…"에서 멈춤 · 테스트는 모두 통과)
// 브라우저 없이 확인: <script> 안의 코드를 꺼내 node --check(문법만 검사 · 실행은 안 함)로 봅니다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const page = new URL("../public/index.html", import.meta.url);

test("화면: index.html의 스크립트에 문법 오류가 없다", { skip: !existsSync(page) && "public/index.html이 아직 없음" }, () => {
  const html = readFileSync(page, "utf-8");
  // src="…"로 따로 불러오는 파일이 아니라, 페이지 안에 직접 쓴 <script>만 검사
  const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/gi)];
  const dir = mkdtempSync(path.join(tmpdir(), "page-check-"));
  try {
    for (const m of scripts) {
      const isModule = /type\s*=\s*["']module["']/i.test(m[1]);
      const file = path.join(dir, isModule ? "script.mjs" : "script.cjs");
      writeFileSync(file, m[2]);
      const r = spawnSync(process.execPath, ["--check", file], { encoding: "utf-8" });
      if (r.status !== 0) {
        // 오류 줄 번호를 index.html 기준으로 바꿔서 알려 줌
        const startLine = html.slice(0, m.index + m[0].indexOf(">") + 1).split("\n").length;
        const at = Number((r.stderr.match(/:(\d+)\r?\n/) || [])[1] || 0);
        const why = (r.stderr.match(/^\w*Error: .*$/m) || [r.stderr.trim()])[0];
        assert.fail(`public/index.html ${at ? `${startLine + at - 1}번째 줄` : ""}에 문법 오류: ${why} — 브라우저에서는 화면 전체가 멈춥니다`);
      }
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
