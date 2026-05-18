-- Filtered report RPC: accepts optional cycle_year and manager_id to restrict rows
CREATE OR REPLACE FUNCTION public.report_goal_sheets_filtered(_cycle INT DEFAULT NULL, _manager_id UUID DEFAULT NULL)
RETURNS TABLE(
  employee_id uuid,
  employee_name text,
  email text,
  department text,
  cycle_year int,
  sheet_status public.sheet_status,
  goal_id uuid,
  thrust_area text,
  goal_title text,
  goal_description text,
  uom text,
  uom_type public.uom_type,
  target numeric,
  weightage numeric,
  is_shared boolean,
  source_goal_id uuid,
  quarter public.quarter,
  actual_value numeric,
  employee_note text,
  manager_note text,
  score numeric
)
LANGUAGE SQL STABLE SECURITY DEFINER AS $$
  SELECT
    s.employee_id,
    p.full_name AS employee_name,
    p.email,
    p.department,
    s.cycle_year,
    s.status AS sheet_status,
    g.id AS goal_id,
    g.thrust_area,
    g.title AS goal_title,
    g.description AS goal_description,
    g.uom,
    g.uom_type,
    g.target,
    g.weightage,
    g.is_shared,
    g.source_goal_id,
    c.quarter,
    c.actual_value,
    c.employee_note,
    c.manager_note,
    c.score
  FROM public.goal_sheets s
  JOIN public.profiles p ON p.id = s.employee_id
  JOIN public.goals g ON g.sheet_id = s.id
  LEFT JOIN public.check_ins c ON c.goal_id = g.id
  WHERE (_cycle IS NULL OR s.cycle_year = _cycle)
    AND (_manager_id IS NULL OR s.manager_id = _manager_id)
  ORDER BY s.cycle_year DESC, p.full_name, g.sort_order, c.quarter;
$$;

GRANT EXECUTE ON FUNCTION public.report_goal_sheets_filtered(INT, UUID) TO authenticated;
