-- NA Avn Comd - Corrective RLS migration (apply after 20251024_init_naavc.sql)
-- Do not execute against production. Review before applying.
-- Fixes over-permissive policies identified in security review.

CREATE OR REPLACE FUNCTION public.is_admin(uid UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF uid IS NULL THEN RETURN FALSE; END IF;
  RETURN EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = uid AND ur.role = 'Admin');
EXCEPTION
  WHEN OTHERS THEN RETURN FALSE;
END;
$$;

CREATE OR REPLACE FUNCTION public.user_role(uid UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE r TEXT;
BEGIN
  IF uid IS NULL THEN RETURN NULL; END IF;
  SELECT role INTO r FROM public.user_roles WHERE user_id = uid LIMIT 1;
  RETURN r;
EXCEPTION
  WHEN OTHERS THEN RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.is_admin(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.user_role(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_role(UUID) TO authenticated;

-- Tighten user_roles
DROP POLICY IF EXISTS "Users can read own role" ON user_roles;
DROP POLICY IF EXISTS "Only admins can manage roles" ON user_roles;
CREATE POLICY "Users read own role" ON user_roles FOR SELECT USING (auth.uid() = user_id OR public.is_admin(auth.uid()));
CREATE POLICY "Admins manage roles" ON user_roles FOR ALL USING (public.is_admin(auth.uid()));

-- Visitors - restrict
DROP POLICY IF EXISTS "Authenticated read visitors" ON user_roles; -- no-op
DROP POLICY IF EXISTS "Authenticated read visitors" ON visitors;
DROP POLICY IF EXISTS "Receptionist/Admin can manage visitors" ON visitors;
CREATE POLICY "Visitors read by authorized roles or host" ON visitors FOR SELECT USING (
  auth.uid() IS NOT NULL AND (
    public.is_admin(auth.uid()) OR
    public.user_role(auth.uid()) IN ('Receptionist','Security','Commandant','Director','PA_TO_DIRECTOR','PA_TO_CI') OR
    EXISTS (SELECT 1 FROM visits v JOIN employees e ON e.id = v.employee_id WHERE v.visitor_id = visitors.id AND e.user_id = auth.uid())
  )
);
CREATE POLICY "Receptionist/Admin manage visitors" ON visitors FOR ALL USING (
  auth.uid() IS NOT NULL AND (public.is_admin(auth.uid()) OR public.user_role(auth.uid()) = 'Receptionist')
);

-- Employees
DROP POLICY IF EXISTS "Authenticated read employees" ON employees;
DROP POLICY IF EXISTS "Admins manage employees" ON employees;
CREATE POLICY "Employees read by authorized" ON employees FOR SELECT USING (
  auth.uid() IS NOT NULL AND (
    public.is_admin(auth.uid()) OR
    public.user_role(auth.uid()) IN ('Commandant','Director','Receptionist','Security','PA_TO_DIRECTOR','PA_TO_CI') OR
    employees.user_id = auth.uid()
  )
);
CREATE POLICY "Admins manage employees" ON employees FOR ALL USING (public.is_admin(auth.uid()));

-- Visits
DROP POLICY IF EXISTS "Users can read relevant visits" ON visits;
DROP POLICY IF EXISTS "Admins/Receptionist/PA can manage visits" ON visits;
CREATE POLICY "Visits read by authorized" ON visits FOR SELECT USING (
  auth.uid() IS NOT NULL AND (
    public.is_admin(auth.uid()) OR
    public.user_role(auth.uid()) IN ('Commandant','Director','Receptionist','Security','PA_TO_DIRECTOR','PA_TO_CI') OR
    EXISTS (SELECT 1 FROM employees e WHERE e.user_id = auth.uid() AND e.id = visits.employee_id)
  )
);
CREATE POLICY "Admins/Receptionist/PA manage visits" ON visits FOR ALL USING (
  auth.uid() IS NOT NULL AND (public.is_admin(auth.uid()) OR public.user_role(auth.uid()) IN ('Receptionist','PA_TO_DIRECTOR','PA_TO_CI'))
);

-- Badges
DROP POLICY IF EXISTS "Users can read relevant badges" ON visitor_badges;
DROP POLICY IF EXISTS "Admins/Receptionist/PA can manage badges" ON visitor_badges;
CREATE POLICY "Badges read by authorized" ON visitor_badges FOR SELECT USING (
  auth.uid() IS NOT NULL AND (
    public.is_admin(auth.uid()) OR
    public.user_role(auth.uid()) IN ('Receptionist','Security','PA_TO_DIRECTOR','PA_TO_CI','Commandant','Director') OR
    EXISTS (SELECT 1 FROM visits v JOIN employees e ON e.id = v.employee_id WHERE v.id = visitor_badges.visit_id AND e.user_id = auth.uid())
  )
);
CREATE POLICY "Receptionist/PA/Admin manage badges" ON visitor_badges FOR ALL USING (
  auth.uid() IS NOT NULL AND (public.is_admin(auth.uid()) OR public.user_role(auth.uid()) IN ('Receptionist','PA_TO_DIRECTOR','PA_TO_CI'))
);

-- Notifications
DROP POLICY IF EXISTS "Users read own notifications" ON notifications;
DROP POLICY IF EXISTS "Users update own notifications" ON notifications;
DROP POLICY IF EXISTS "Authenticated can insert notifications" ON notifications;
CREATE POLICY "Users read own or role notifications" ON notifications FOR SELECT USING (
  auth.uid() IS NOT NULL AND (user_id = auth.uid() OR recipient_role = public.user_role(auth.uid()))
);
CREATE POLICY "Users update own notifications" ON notifications FOR UPDATE USING (auth.uid() IS NOT NULL AND user_id = auth.uid());
CREATE POLICY "Server inserts notifications" ON notifications FOR INSERT WITH CHECK (false); -- use service role

-- Audit logs
DROP POLICY IF EXISTS "Admins read audit logs" ON audit_logs;
DROP POLICY IF EXISTS "Authenticated can insert audit logs" ON audit_logs;
CREATE POLICY "Admins read audit logs" ON audit_logs FOR SELECT USING (public.is_admin(auth.uid()));
CREATE POLICY "Server inserts audit logs" ON audit_logs FOR INSERT WITH CHECK (false); -- use service role

-- Lookup tables
DROP POLICY IF EXISTS "Authenticated read departments" ON departments;
DROP POLICY IF EXISTS "Admins manage departments" ON departments;
CREATE POLICY "Authenticated read departments" ON departments FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Admins manage departments" ON departments FOR ALL USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Authenticated read positions" ON positions;
DROP POLICY IF EXISTS "Admins manage positions" ON positions;
CREATE POLICY "Authenticated read positions" ON positions FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Admins manage positions" ON positions FOR ALL USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Authenticated read office_locations" ON office_locations;
DROP POLICY IF EXISTS "Admins manage office_locations" ON office_locations;
CREATE POLICY "Authenticated read office_locations" ON office_locations FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Admins manage office_locations" ON office_locations FOR ALL USING (public.is_admin(auth.uid()));

-- Ensure RLS enabled
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE visitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE visitor_badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE office_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
