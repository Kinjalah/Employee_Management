-- Add source link for shared goals
ALTER TABLE public.goals
  ADD COLUMN IF NOT EXISTS source_goal_id UUID REFERENCES public.goals(id) ON DELETE SET NULL;

-- Trigger: validate per-goal limits (min weightage, max goals per sheet)
CREATE OR REPLACE FUNCTION public.validate_goal_limits()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  cnt INT;
BEGIN
  IF NEW.weightage < 10 THEN
    RAISE EXCEPTION 'Minimum weightage per individual goal is 10';
  END IF;

  SELECT COUNT(1) INTO cnt FROM public.goals WHERE sheet_id = NEW.sheet_id;
  IF TG_OP = 'INSERT' THEN
    IF cnt + 1 > 8 THEN
      RAISE EXCEPTION 'Maximum number of goals per employee is 8';
    END IF;
  ELSE
    -- For update, if sheet_id changed consider the target sheet count
    IF COALESCE(OLD.sheet_id, NULL) IS DISTINCT FROM NEW.sheet_id THEN
      SELECT COUNT(1) INTO cnt FROM public.goals WHERE sheet_id = NEW.sheet_id;
      IF cnt + 1 > 8 THEN
        RAISE EXCEPTION 'Maximum number of goals per employee is 8';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_validate_goal_limits ON public.goals;
CREATE TRIGGER trg_validate_goal_limits BEFORE INSERT OR UPDATE ON public.goals
FOR EACH ROW EXECUTE FUNCTION public.validate_goal_limits();

-- Trigger: ensure total weightage equals 100% when submitting a sheet
CREATE OR REPLACE FUNCTION public.enforce_sheet_submission_totals()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  total NUMERIC;
  low_count INT;
BEGIN
  -- Only check when moving to 'submitted' from another status
  IF NEW.status = 'submitted' AND (TG_OP = 'UPDATE') AND OLD.status IS DISTINCT FROM NEW.status THEN
    SELECT COALESCE(SUM(weightage),0) INTO total FROM public.goals WHERE sheet_id = NEW.id;
    IF total <> 100 THEN
      RAISE EXCEPTION 'Total weightage across all goals must equal 100 (current: %)', total;
    END IF;
    SELECT COUNT(1) INTO low_count FROM public.goals WHERE sheet_id = NEW.id AND weightage < 10;
    IF low_count > 0 THEN
      RAISE EXCEPTION 'Each goal must have at least 10%% weightage';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_enforce_sheet_submission_totals ON public.goal_sheets;
CREATE TRIGGER trg_enforce_sheet_submission_totals BEFORE UPDATE ON public.goal_sheets
FOR EACH ROW EXECUTE FUNCTION public.enforce_sheet_submission_totals();

-- Audit: log changes to goals when their sheet is locked
CREATE OR REPLACE FUNCTION public.audit_goal_changes_after_lock()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  s_status public.sheet_status;
BEGIN
  SELECT status INTO s_status FROM public.goal_sheets WHERE id = NEW.sheet_id;
  IF s_status = 'locked' THEN
    INSERT INTO public.audit_log (actor_id, entity, entity_id, action, payload)
    VALUES (NULL, 'goals', NEW.id, 'update_after_lock', jsonb_build_object('old', to_jsonb(OLD), 'new', to_jsonb(NEW)));
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_audit_goal_changes_after_lock ON public.goals;
CREATE TRIGGER trg_audit_goal_changes_after_lock AFTER UPDATE ON public.goals
FOR EACH ROW EXECUTE FUNCTION public.audit_goal_changes_after_lock();

-- Sync: propagate check-in actuals from a source goal to its shared copies
CREATE OR REPLACE FUNCTION public.sync_shared_checkins()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  target_goal RECORD;
BEGIN
  -- Only propagate when the changed checkin is for a master goal (i.e., it has copies)
  FOR target_goal IN SELECT id FROM public.goals WHERE source_goal_id = NEW.goal_id LOOP
    INSERT INTO public.check_ins (goal_id, quarter, actual_value, employee_note, manager_note, score, created_at, updated_at)
    VALUES (target_goal.id, NEW.quarter, NEW.actual_value, NEW.employee_note || ' (synced)', NEW.manager_note, NEW.score, now(), now())
    ON CONFLICT (goal_id, quarter) DO UPDATE
    SET actual_value = EXCLUDED.actual_value,
        score = EXCLUDED.score,
        employee_note = EXCLUDED.employee_note,
        manager_note = EXCLUDED.manager_note,
        updated_at = now();
  END LOOP;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sync_shared_checkins ON public.check_ins;
CREATE TRIGGER trg_sync_shared_checkins AFTER INSERT OR UPDATE ON public.check_ins
FOR EACH ROW EXECUTE FUNCTION public.sync_shared_checkins();
