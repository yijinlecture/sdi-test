-- migrations/supabase/002_ai.sql — 실습 1-2 · Supabase SQL Editor에 붙여 넣고 Run (한 번만)
-- AI는 진짜 칸(severity · category)이 아니라 이 제안 칸(ai_*)에만 씀. 사람이 [승인]해야 진짜 칸으로 옮김

alter table public.reports
  add column if not exists ai_severity text not null default '' check (ai_severity in ('', 'urgent', 'warning', 'info', 'none')),
  add column if not exists ai_category text not null default '' check (ai_category in ('', 'ELECTRIC', 'HVAC', 'IT_DEVICE', 'BUILDING', 'none')),
  add column if not exists ai_reason   text not null default '',
  add column if not exists ai_status   text not null default 'none' check (ai_status in ('none', 'suggested', 'approved', 'rejected')),
  add column if not exists answer      text not null default '';   -- 실습 1-4 · 사람이 [보내기]를 누른 안내문
