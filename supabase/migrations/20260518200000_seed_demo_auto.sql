-- Automated demo seeding: creates a goal sheet, 3 goals and a Q1 check-in for up to 3 existing profiles.
-- This script only uses `profiles` rows that already exist in the DB (created by auth triggers).

DO $$
DECLARE
  rec RECORD;
  s_id uuid;
  g_id uuid;
  cycle INT := extract(year from now())::int;
BEGIN
  FOR rec IN SELECT id, email FROM public.profiles LIMIT 3 LOOP
    -- create sheet if not exists
    INSERT INTO public.goal_sheets (employee_id, cycle_year, status, created_at, updated_at)
    SELECT rec.id, cycle, 'submitted', now(), now()
    WHERE NOT EXISTS (SELECT 1 FROM public.goal_sheets s WHERE s.employee_id = rec.id AND s.cycle_year = cycle)
    RETURNING id INTO s_id;

    IF s_id IS NULL THEN
      SELECT id INTO s_id FROM public.goal_sheets WHERE employee_id = rec.id AND cycle_year = cycle LIMIT 1;
    END IF;

    -- insert three sample goals if not present
    IF NOT EXISTS (SELECT 1 FROM public.goals WHERE sheet_id = s_id) THEN
      INSERT INTO public.goals (sheet_id, thrust_area, title, description, uom, uom_type, target, weightage, sort_order)
      VALUES
        (s_id, 'Customer', 'Increase NPS', 'Improve customer satisfaction', 'points', 'higher_better', 8, 40, 0),
        (s_id, 'Efficiency', 'Reduce TAT', 'Reduce turnaround time', 'hours', 'lower_better', 24, 40, 1),
        (s_id, 'Quality', 'Zero P1 incidents', 'Maintain zero P1 incidents', 'count', 'binary', 1, 20, 2);
    END IF;

    -- create a sample Q1 check-in for each goal
    FOR g_id IN SELECT id FROM public.goals WHERE sheet_id = s_id LOOP
      INSERT INTO public.check_ins (goal_id, quarter, actual_value, employee_note, manager_note, score, created_at, updated_at)
      VALUES (g_id, 'Q1', 1, 'Demo actual', 'Manager demo note', 100, now(), now())
      ON CONFLICT (goal_id, quarter) DO NOTHING;
    END LOOP;
  END LOOP;
END$$;

-- Insert audit entries for visibility
INSERT INTO public.audit_log (actor_id, entity, entity_id, action, payload)
SELECT NULL, 'seed', NULL, 'demo_seed', jsonb_build_object('seeded_at', now()) WHERE TRUE;
