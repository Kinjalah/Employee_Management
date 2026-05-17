
-- Roles enum + table
CREATE TYPE public.app_role AS ENUM ('admin', 'manager', 'employee');

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL DEFAULT '',
  department TEXT DEFAULT '',
  designation TEXT DEFAULT '',
  manager_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);

-- Security definer role check
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=_user_id AND role=_role) $$;

-- Goal sheet status
CREATE TYPE public.sheet_status AS ENUM ('draft','submitted','approved','returned','locked');
CREATE TYPE public.uom_type AS ENUM ('higher_better','lower_better','binary','milestone');

CREATE TABLE public.goal_sheets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  manager_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  cycle_year INT NOT NULL,
  status public.sheet_status NOT NULL DEFAULT 'draft',
  manager_comments TEXT DEFAULT '',
  submitted_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(employee_id, cycle_year)
);

CREATE TABLE public.goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sheet_id UUID NOT NULL REFERENCES public.goal_sheets(id) ON DELETE CASCADE,
  thrust_area TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  uom TEXT NOT NULL,
  uom_type public.uom_type NOT NULL DEFAULT 'higher_better',
  target NUMERIC NOT NULL,
  weightage NUMERIC NOT NULL,
  is_shared BOOLEAN NOT NULL DEFAULT false,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TYPE public.quarter AS ENUM ('Q1','Q2','Q3','Q4','YEAR_END');

CREATE TABLE public.check_ins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id UUID NOT NULL REFERENCES public.goals(id) ON DELETE CASCADE,
  quarter public.quarter NOT NULL,
  actual_value NUMERIC,
  employee_note TEXT DEFAULT '',
  manager_note TEXT DEFAULT '',
  score NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(goal_id, quarter)
);

CREATE TABLE public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  entity TEXT NOT NULL,
  entity_id UUID,
  action TEXT NOT NULL,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_sheets_updated BEFORE UPDATE ON public.goal_sheets
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_checkins_updated BEFORE UPDATE ON public.check_ins
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Auto create profile + employee role on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)));
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'employee');
  RETURN NEW;
END $$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goal_sheets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.check_ins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- PROFILES policies
CREATE POLICY "auth read profiles" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "self update profile" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid());
CREATE POLICY "admin manage profiles" ON public.profiles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- USER_ROLES policies
CREATE POLICY "auth read roles" ON public.user_roles FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin manage roles" ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- GOAL_SHEETS policies
CREATE POLICY "employee read own sheet" ON public.goal_sheets FOR SELECT TO authenticated
  USING (employee_id = auth.uid() OR manager_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "employee insert own sheet" ON public.goal_sheets FOR INSERT TO authenticated
  WITH CHECK (employee_id = auth.uid());
CREATE POLICY "employee update own draft" ON public.goal_sheets FOR UPDATE TO authenticated
  USING (
    (employee_id = auth.uid() AND status IN ('draft','returned'))
    OR manager_id = auth.uid()
    OR public.has_role(auth.uid(),'admin')
  );
CREATE POLICY "admin delete sheet" ON public.goal_sheets FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

-- GOALS policies (via sheet)
CREATE POLICY "read goals" ON public.goals FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.goal_sheets s WHERE s.id = sheet_id
    AND (s.employee_id = auth.uid() OR s.manager_id = auth.uid() OR public.has_role(auth.uid(),'admin')))
);
CREATE POLICY "write goals" ON public.goals FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM public.goal_sheets s WHERE s.id = sheet_id
    AND ((s.employee_id = auth.uid() AND s.status IN ('draft','returned'))
         OR s.manager_id = auth.uid()
         OR public.has_role(auth.uid(),'admin')))
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.goal_sheets s WHERE s.id = sheet_id
    AND ((s.employee_id = auth.uid() AND s.status IN ('draft','returned'))
         OR s.manager_id = auth.uid()
         OR public.has_role(auth.uid(),'admin')))
);

-- CHECK_INS policies
CREATE POLICY "read checkins" ON public.check_ins FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.goals g JOIN public.goal_sheets s ON s.id = g.sheet_id
    WHERE g.id = goal_id
    AND (s.employee_id = auth.uid() OR s.manager_id = auth.uid() OR public.has_role(auth.uid(),'admin')))
);
CREATE POLICY "write checkins" ON public.check_ins FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM public.goals g JOIN public.goal_sheets s ON s.id = g.sheet_id
    WHERE g.id = goal_id
    AND (s.employee_id = auth.uid() OR s.manager_id = auth.uid() OR public.has_role(auth.uid(),'admin')))
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.goals g JOIN public.goal_sheets s ON s.id = g.sheet_id
    WHERE g.id = goal_id
    AND (s.employee_id = auth.uid() OR s.manager_id = auth.uid() OR public.has_role(auth.uid(),'admin')))
);

-- AUDIT log
CREATE POLICY "admin read audit" ON public.audit_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "auth insert audit" ON public.audit_log FOR INSERT TO authenticated WITH CHECK (true);
