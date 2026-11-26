// eval/candidates.js — 미션 ②: 사람이 정하거나 고친 심각도를 평가셋 후보로 내보냄
// 실행: npm start로 서버를 켠 상태에서 새 터미널로 node eval/candidates.js → eval/candidates.json
// 후보를 읽어 보고 맞는 것만 golden.json에 옮겨 붙임(사람이 고름)
import { writeFileSync } from "node:fs";

const port = process.env.PORT || 8080;
const res = await fetch(`http://localhost:${port}/api/eval/candidates`).catch(() => null);
if (!res?.ok) {
  console.log(`서버(http://localhost:${port})에 닿지 않습니다. npm start로 켠 뒤 다시 실행하세요`);
  process.exit(1);
}
const list = await res.json();
writeFileSync(new URL("./candidates.json", import.meta.url), JSON.stringify({ items: list }, null, 2) + "\n");
console.log(`평가셋 후보 ${list.length}건 → eval/candidates.json`);
for (const c of list) console.log(`- ${c.id}번 ${c.title} · AI ${c.ai || "-"} → 사람 ${c.expected}${c.hold ? " (AI가 보류했던 건)" : ""}`);
