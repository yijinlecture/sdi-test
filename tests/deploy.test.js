// tests/deploy.test.js — 실습 3-1 배포 전 점검: 이 테스트가 통과해야 Vercel에 올림
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (f) => readFileSync(path.join(ROOT, f), "utf-8");

test("public/에 비밀 값(키 · 서버 전용 키 · 프롬프트)이 없다", () => {
  // 배포하면 public/ 파일은 접속한 누구나 F12로 내려받음 → 키와 규칙은 서버에만
  const secret = /sk-ant-|sb_secret_|SUPABASE_SECRET_KEY|ANTHROPIC_API_KEY|# PROMPT:/;
  for (const f of readdirSync(path.join(ROOT, "public"))) {
    if (!/\.(html|js|css|json)$/.test(f)) continue;
    assert.doesNotMatch(read(path.join("public", f)), secret, `public/${f}에 비밀 값이 있음`);
  }
});

test("server.js는 Vercel 입구(기본으로 내보내는 함수)를 내보낸다", async () => {
  const mod = await import("../server.js");
  assert.equal(typeof mod.default, "function", "export default handle;이 필요");
});

test(".env(키)는 올리지 않는다", () => {
  assert.match(read(".gitignore"), /^\.env$/m);
});

test("Node 버전은 24.x로 고정 (>=24로 쓰면 Vercel이 더 새 버전을 고름)", () => {
  assert.equal(JSON.parse(read("package.json")).engines.node, "24.x");
});
