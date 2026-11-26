-- migrations/supabase/003_eval.sql — M2 선택 미션 · Supabase SQL Editor에 붙여 넣고 Run (한 번만)
-- 미션 ① 판단 보류 · 미션 ② 사람이 정하거나 고친 심각도 → 평가셋 후보

alter table public.reports
  add column if not exists ai_hold      integer not null default 0 check (ai_hold in (0, 1)),       -- AI가 "판단 보류 · 사람 확인"을 냈나
  add column if not exists ai_corrected integer not null default 0 check (ai_corrected in (0, 1)),  -- 사람이 AI와 다르게(또는 보류 건을) 정했나
  add column if not exists ai_before    text not null default '';                                  -- 그때 AI가 냈던 심각도
