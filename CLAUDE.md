# CLAUDE.md — SDI 시설 신고함

## 이 프로젝트
사내 시설 · 장비 고장을 신고하고 시설팀이 처리하는 웹 서비스. 수강생(비개발자)이 읽고 고치는 실습용이므로 **코드는 짧고 쉽게, 주석은 한국어로**.
기획서는 `SPEC.md`. 요청문에 "SPEC.md 몇 절"이 나오면 그 절을 근거로 만든다. 기획서에 없는 기능은 만들지 않는다.

## 파일 지도 (요청은 이 순서로 흐름)
public/index.html(화면) → server.js(API: 주소 · 입력 검사) → db.js(DB 창구) → DB(Supabase · SQLite 파일 · memory)
- 테이블 모양: `migrations/supabase/*.sql`(사람이 Supabase SQL Editor에서 실행) · `migrations/sqlite/*.sql`(서버가 켤 때 자동 실행)
- 자동 확인: `tests/` (`npm test`)

## 명령
- 실행 `npm start` (http://localhost:8080) · 테스트 `npm test` · SQLite 들여다보기 `npm run peek`

## 지킬 것
1. 패키지 설치 금지. Node 24 내장 기능만 (node:http · node:sqlite · node:test · fetch).
2. SQL에 값을 문자열로 이어 붙이지 않는다. SQLite는 `?` 자리표시자, Supabase는 주소에 넣는 값을 `encodeURIComponent`로.
3. 테이블을 바꿀 때는 이미 있는 마이그레이션 파일을 고치지 말고, `migrations/supabase/`와 `migrations/sqlite/`에 다음 번호 새 파일을 같은 이름으로 하나씩 만든다.
4. 입력 검사는 `server.js`에서(400). 화면에서만 막는 것은 검사가 아니다. 실패 응답은 항상 `{ "error": { "code", "message" } }`, message는 한국어.
5. DB 종류는 `db.js`만 안다. `server.js`와 화면은 `DB_MODE`를 모른다. memory 모드는 테스트용이라 지우지 않는다.
6. `tests/api.test.js` · `tests/page.test.js`는 고치지 않는다(고정 테스트 · page.test.js는 화면 스크립트 문법 검사). 새 기능은 SPEC.md의 AC를 한국어 이름의 테스트로 새 파일에 추가한다.
7. 요청문의 [어디]에 적힌 파일만 고치고, 바꾼 것을 파일 이름과 함께 3줄 이내로 알려 준다. ([어디]가 없으면 고치기 전에 어느 파일을 고칠지 먼저 말한다. 단, `/goal`로 맡긴 일은 고칠 파일을 스스로 찾아 바로 고치고 끝에 알려 준다.) 보고는 항상 한국어로 쓴다.
8. `.env`는 읽거나 출력하지 않는다. 키는 화면(`public/`)에 절대 넣지 않는다.
9. 같은 오류를 두 번 고쳐도 그대로면, 세 번째 전에 원인부터 설명한다.

## AI 기능 (8일차 M1부터)
10. Claude 호출은 `ai.js` 한 곳에서만(fetch · 패키지 없음). 프롬프트는 `prompts/*.txt`. 키가 없으면 녹화 응답(규칙은 `replay/README.md`).
11. AI 결과는 제안 칸(`ai_*`)에만 저장한다. severity · category · assignee는 사람이 [승인] · 선택할 때만 바뀐다.
12. AI가 멈추면(키 · 네트워크 · 시간 초과) 서버는 503으로 "직접 처리"를 안내하고, 신고 접수는 계속 된다.
13. 긴급 안내문의 안전 문구는 AI가 쓰지 않는다. `server.js`의 정해진 문장(SAFETY)만 쓴다.
14. AI 답은 그대로 믿지 않는다. `ai.js`의 검사 함수(분류 `checkAiResult` · 추천 `checkRecommendResult`)를 통과한 값만 쓰고, 통과 못 하면 미분류(추천은 사람이 직접 고름). 패키지(Zod 등)는 쓰지 않는다.

## 이어 가기 (HANDOFF.md)
- 새 세션을 시작하면 HANDOFF.md를 먼저 읽고, 진행 기록의 마지막 줄부터 이어 간다.
- 실습 하나가 끝나면 HANDOFF.md 진행 기록에 한 줄(실습 · 한 일 · npm test 결과 · 다음 할 일)을 추가한다.
