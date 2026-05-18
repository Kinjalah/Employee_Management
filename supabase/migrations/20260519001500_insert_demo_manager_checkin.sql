-- Insert manager check-ins for demo employee if an approved sheet exists
DO $$
DECLARE
  p_id uuid;
  s_id uuid;
  g_id uuid;
BEGIN
  SELECT id INTO p_id FROM public.profiles WHERE email='emp.demo@example.com' LIMIT 1;
  IF p_id IS NULL THEN
    RAISE NOTICE 'Profile emp.demo@example.com not found; skipping check-in insert';
    RETURN;
  END IF;

  SELECT id INTO s_id FROM public.goal_sheets WHERE employee_id = p_id AND status = 'approved' ORDER BY cycle_year DESC LIMIT 1;
  IF s_id IS NULL THEN
    RAISE NOTICE 'Approved goal_sheet not found for demo employee; skipping';
    RETURN;
  END IF;

  FOR g_id IN SELECT id FROM public.goals WHERE sheet_id = s_id LOOP
    INSERT INTO public.check_ins (goal_id, quarter, actual_value, employee_note, manager_note, score, created_at, updated_at)
    VALUES (g_id, 'Q1', 50, '', 'Manager demo check-in (migration)', NULL, now(), now())
    ON CONFLICT (goal_id, quarter) DO UPDATE
    SET actual_value = EXCLUDED.actual_value,
        manager_note = EXCLUDED.manager_note,
        updated_at = now();
  END LOOP;
END$$;
