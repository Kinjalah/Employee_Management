-- Migration: Enforce check-in windows for quarters
-- This trigger prevents inserts/updates to `check_ins` outside configured month windows.

create or replace function public.enforce_checkin_window() returns trigger as $$
declare
  m int := extract(month from current_date)::int;
  q text := coalesce(new.quarter, old.quarter);
begin
  -- Allow admin bypass by role is not handled here; this is a strict enforcement
  if tg_op = 'INSERT' or tg_op = 'UPDATE' then
    if q = 'Q1' and m <> 7 then
      raise exception 'Q1 check-ins are allowed only in July (month=7). Current month: %', m;
    elsif q = 'Q2' and m <> 10 then
      raise exception 'Q2 check-ins are allowed only in October (month=10). Current month: %', m;
    elsif q = 'Q3' and m <> 1 then
      raise exception 'Q3 check-ins are allowed only in January (month=1). Current month: %', m;
    elsif (q = 'Q4' or q = 'YEAR_END') and m not in (3,4) then
      raise exception 'Q4/Year-end check-ins are allowed only in March/April (months=3,4). Current month: %', m;
    elsif q = 'GOAL_SETTING' and m <> 5 then
      raise exception 'Goal setting window is open only in May (month=5). Current month: %', m;
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end case;
end;
$$ language plpgsql;

drop trigger if exists trg_enforce_checkin_window on public.check_ins;
create trigger trg_enforce_checkin_window
  before insert or update on public.check_ins
  for each row execute function public.enforce_checkin_window();
