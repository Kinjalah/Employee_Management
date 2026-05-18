-- Enforce that employees can only insert/update check_ins during the active quarter window.
-- Admins and managers are allowed to update at any time.

CREATE OR REPLACE FUNCTION public.enforce_checkin_window()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  actor uuid := auth.uid();
  actor_is_admin boolean := public.has_role(actor, 'admin');
  actor_is_manager boolean := public.has_role(actor, 'manager');
  sheet_owner uuid;
  sheet_manager uuid;
  m int := extract(month from now())::int;
  active_quarter text;
BEGIN
  IF actor_is_admin OR actor_is_manager THEN
    RETURN NEW; -- allow managers/admins
  END IF;

  -- find the sheet and its manager
  SELECT s.employee_id, s.manager_id INTO sheet_owner, sheet_manager FROM public.goals g JOIN public.goal_sheets s ON s.id = g.sheet_id WHERE g.id = NEW.goal_id LIMIT 1;
  IF sheet_owner IS NULL THEN
    RAISE EXCEPTION 'Invalid goal reference';
  END IF;

  -- only the employee who owns the sheet may insert/update, and only during quarter window
  IF actor <> sheet_owner THEN
    RAISE EXCEPTION 'Not permitted';
  END IF;

  IF m = 7 THEN active_quarter := 'Q1';
  ELSIF m = 10 THEN active_quarter := 'Q2';
  ELSIF m = 1 THEN active_quarter := 'Q3';
  ELSIF m = 3 OR m = 4 THEN active_quarter := 'Q4';
  ELSE active_quarter := NULL;
  END IF;

  IF active_quarter IS NULL THEN
    RAISE EXCEPTION 'Check-in window is closed';
  END IF;

  IF NEW.quarter <> active_quarter AND NEW.quarter <> 'YEAR_END' THEN
    RAISE EXCEPTION 'Not in active quarter window';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_enforce_checkin_window ON public.check_ins;
CREATE TRIGGER trg_enforce_checkin_window BEFORE INSERT OR UPDATE ON public.check_ins
FOR EACH ROW EXECUTE FUNCTION public.enforce_checkin_window();
