# DEPLOY.md — Vercel 배포 (8일차 실습 3-1)

## 0. 배포 전 점검 (요청문)
```
Vercel에 배포하려고 해. server.js의 맨 아래 export default와 vercel.json이 무슨 일을 하는지 비전공자도 알게 설명하고,
배포에 올라가면 안 되는 파일(.env · data/app.db)이 빠지는지 확인해줘. Vercel에 넣을 환경변수 이름 목록을 표로 정리해줘.
```
그다음 `npm test` → 모두 통과(특히 `deploy.test.js` 4개)

## 1. GitHub에 올리기
- GitHub → New repository(Private) → **Add file → Upload files**로 폴더 안 파일을 끌어 넣음
- `.env`와 `data/app.db`는 올리지 않음 (`.gitignore`에 있음 · 웹 업로드는 직접 빼야 함)

## 2. Vercel에서 Import
- Vercel → Add New → Project → 방금 만든 저장소 Import → Framework Preset: **Other** → 빌드 설정은 비워 둠
- Vercel은 루트의 `server.js`가 **기본으로 내보내는 함수**(`export default handle`)를 입구로 씀 · 화면(public/)도 같은 함수가 내어 줌
- `vercel.json`: 서울 리전(icn1)

## 3. 환경변수 (Settings → Environment Variables)
| 트랙 | 이름 | 값 |
|---|---|---|
| Supabase (기본) | `SUPABASE_URL` · `SUPABASE_SECRET_KEY` | 내 `.env`와 같은 값 |
| SQLite (병렬) | `DB_MODE` | `sqlite` |
| 공통 | `ANTHROPIC_API_KEY` | 키가 있으면 · 없으면 아래 줄 |
| 공통 | `AI_MODE` | `replay` (키 없이 녹화 응답) |

→ Deploy → 생긴 주소(…vercel.app)를 휴대폰으로 열기

## 4. 확인 (휴대폰)
신고 1건 → [AI 분류] → 제안 확인 → [승인] → 배지가 바뀜

## 5. 관찰 두 가지 (3-1 안 · 토의 1문장씩)
- **관찰 ① 데이터가 남나?** 반 전체가 같은 주소로 신고 → Supabase 트랙은 남고, SQLite 트랙은 10~15분 뒤 · 재배포하면 40건으로 돌아감
  → Vercel은 서버를 여러 대로 늘리고 새로 띄움 · SQLite 파일은 서버마다 임시 폴더(/tmp)에 따로 있음 → "그래서 회사에서는 DB가 있는 사내 서버로"
- **관찰 ② 로그인이 없으면?** 옆 사람 주소로 들어가 남의 신고를 [완료] → "주소만 알면 누구나 처리할 수 있다" → 3-4 도입 전 점검의 "사내 SSO" 칸

## 6. 운영 기본기 (5분)
README 한 줄 고쳐 다시 올림 → 새 배포 생김 → 이전 배포 **Rollback** → 최신 **Promote** → Logs에서 `[화면→API] POST /api/reports/…/classify` 줄 찾기

## 7. 끝나면
실습이 끝나면 Vercel 프로젝트를 지웁니다(Settings → Delete Project). 로그인이 없는 서비스라 주소가 남아 있으면 누구나 AI를 부를 수 있습니다.

## 막혔을 때
| 증상 | 원인 | 조치 |
|---|---|---|
| 화면까지 전부 500 · "default export must be a function" | `server.js`에 `export default handle;`이 없음 | 맨 아래 한 줄 추가 (`deploy.test.js`가 잡음) |
| 목록 500 · Supabase 오류 401/403 | 환경변수에 공개 키(Publishable)를 넣음 | 서버 전용 키(Secret)로 바꾸고 Redeploy |
| AI 분류 503 | 키가 없거나 틀림 | `AI_MODE=replay` 추가 후 Redeploy |
| Node 버전 오류 | `engines`를 `>=24`로 씀 | `"24.x"`로 고정 |
