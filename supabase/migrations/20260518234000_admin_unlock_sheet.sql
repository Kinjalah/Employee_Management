-- RPC to allow Admin to unlock a locked goal sheet (set status back to 'draft')
CREATE OR REPLACE FUNCTION public.unlock_goal_sheet(_sheet_id uuid, _actor_id uuid)
RETURNS void AS $$
BEGIN
  UPDATE public.goal_sheets SET status = 'draft' WHERE id = _sheet_id;
  INSERT INTO public.audit_log (actor_id, entity, entity_id, action, created_at)
  VALUES (_actor_id, 'goal_sheet', _sheet_id, 'admin_unlock', now());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
