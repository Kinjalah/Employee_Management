-- Migration: Enforce goal limits and total weightage per sheet
-- Ensures: each goal weightage >= 10, max 8 goals per sheet, total weightage == 100

create or replace function public.validate_goal_limits() returns trigger as $$
declare
  v_total numeric := 0;
  v_count int := 0;
  v_sheet uuid;
begin
  if (tg_op = 'INSERT') then
    v_sheet := new.sheet_id;
    select coalesce(sum(weightage),0), count(*) into v_total, v_count from public.goals where sheet_id = v_sheet;
    v_total := v_total + coalesce(new.weightage,0);
    v_count := v_count + 1;
    if coalesce(new.weightage,0) < 10 then
      raise exception 'Each goal must have at least 10%% weightage';
    end if;
  elsif (tg_op = 'UPDATE') then
    v_sheet := coalesce(new.sheet_id, old.sheet_id);
    select coalesce(sum(weightage),0), count(*) into v_total, v_count from public.goals where sheet_id = v_sheet and id <> coalesce(new.id, old.id);
    v_total := v_total + coalesce(new.weightage,0);
    v_count := v_count + 1;
    if coalesce(new.weightage,0) < 10 then
      raise exception 'Each goal must have at least 10%% weightage';
    end if;
  elsif (tg_op = 'DELETE') then
    v_sheet := old.sheet_id;
    select coalesce(sum(weightage),0), count(*) into v_total, v_count from public.goals where sheet_id = v_sheet and id <> old.id;
  end if;

  if v_count > 8 then
    raise exception 'Maximum 8 goals allowed per sheet (found %)', v_count;
  end if;

  -- Allow temporary drafts with zero goals (avoid dividing by zero); require exactly 100 when there is at least one goal
  if v_count > 0 and abs(v_total - 100) > 0.0001 then
    raise exception 'Total weightage across goals for sheet % must equal 100 (current: %)', v_sheet, v_total;
  end if;

  return case when tg_op = 'DELETE' then old else new end case;
end;
$$ language plpgsql;

drop trigger if exists trg_validate_goal_limits on public.goals;
create trigger trg_validate_goal_limits
  after insert or update or delete on public.goals
  for each row execute function public.validate_goal_limits();
