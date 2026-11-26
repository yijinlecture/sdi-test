# SDI 시설 신고함 · 8일차 실습 폴더

설치할 것은 없습니다. Node 24만 있으면 됩니다.
**오늘의 기획서는 `SPEC.md`입니다.** 먼저 읽고, Claude에게 보낼 요청문을 직접 씁니다.

## 실행 (명령 3개)

| 하고 싶은 것 | 명령 | 결과 |
|---|---|---|
| 서버 켜기 | `npm start` | http://localhost:8080 · 끌 때는 Ctrl+C |
| 자동 확인 | `npm test` | 모두 ✔ 이면 통과 · 처음에는 10개 모두 ✖ (오늘 아침 목표) |
| SQLite 들여다보기 | `npm run peek` | 테이블 · 칸 · 건수 · 최근 신고 5건 (SQLite 트랙만) |

## DB 고르기 (`.env.example` → `.env`로 복사)

| 트랙 | `.env`에 넣을 것 | 테이블 만들기 | 들여다보기 |
|---|---|---|---|
| **Supabase (기본)** | `SUPABASE_URL` · `SUPABASE_SECRET_KEY` (서버 전용 키 · 공개 키 아님) | `migrations/supabase/001_reports.sql`을 SQL Editor에서 Run | Table Editor |
| **SQLite (사내 방식)** | `DB_MODE=sqlite` 한 줄 | 서버가 켤 때 `migrations/sqlite/`를 자동 실행 | `npm run peek` |

Supabase에서 막히면 `.env`를 `DB_MODE=sqlite` 한 줄로 바꿔 이어 갑니다. 테스트는 두 트랙 모두 같습니다(테스트는 진짜 DB를 건드리지 않는 memory 모드로 돕니다).

## 파일 지도 — "무엇을 바꾸려면 어느 파일?"

```
 ① 화면                 ② API                  ③ DB 창구           ④ DB
 public/index.html ──▶ server.js ──────▶ db.js ──────▶ Supabase / SQLite 파일 / memory
   (fetch로 부탁)       (주소 · 입력 검사)    (DB는 여기만 앎)
                                               ▲
                                        migrations/ (테이블 모양)
```

| 바꾸고 싶은 것 | 열 파일 | 확인 방법 |
|---|---|---|
| 화면 모양 · 버튼 · 문구 | `public/index.html` | 브라우저 새로고침 |
| API 주소 · 입력 검사 | `server.js` | `npm test` |
| 데이터를 읽고 쓰는 방법 · 정렬 | `db.js` | 서버 터미널의 `[API→DB]` 줄 |
| 테이블 칸 | `migrations/`에 **새 파일** | Table Editor · `npm run peek` |
| 정해진 규칙 · 완료 기준 | `SPEC.md` | — |
| 자동 확인 | `tests/` | `npm test` |

## 요청문 쓰는 법 (3줄)

```
[어디] 고칠 파일 (위 파일 지도에서 고름)
[무엇] SPEC.md의 몇 절을 어떻게. 한 층만
[확인] SPEC.md 7절의 AC 중 무엇으로 끝을 판단하나 (브라우저 · npm test · Table Editor/peek)
```

로그인은 없습니다. 화면 하나에서 누구나 신고하고 누구나 처리합니다(SPEC.md 8절).
