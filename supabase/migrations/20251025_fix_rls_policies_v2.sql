-- NA Avn Comd - Corrective RLS migration v2 (apply AFTER 20251024_init_naavc.sql)
-- Do not execute. Review only.

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog, pg_temp
AS $$
BEGIN
  RETURN (SELECT role FROM public.user_roles WHERE user_id = auth.uid() LIMIT 1);
EXCEPTION
  WHEN OTHERS THEN RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_current_user_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog, pg_temp
AS $$
BEGIN
  RETURN EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'Admin');
EXCEPTION
  WHEN OTHERS THEN RETURN FALSE;
END;
$$;

REVOKE ALL ON FUNCTION public.current_user_role() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_current_user_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_current_user_admin() TO authenticated;

-- user_roles
DROP POLICY IF EXISTS "Users can read own role" ON user_roles;
DROP POLICY IF EXISTS "Only admins can manage roles" ON user_roles;
DROP POLICY IF EXISTS "Users read own role" ON user_roles;
DROP POLICY IF EXISTS "Admins manage roles" ON user_roles;
CREATE POLICY "user_roles_self_read" ON user_roles FOR SELECT USING (auth.uid() = user_id);
-- Admins can manage roles; users cannot promote themselves
CREATE POLICY "user_roles_admin_all" ON user_roles FOR ALL USING (public.is_current_user_admin())
  WITH CHECK (public.is_current_user_admin());

-- visitors
DROP POLICY IF EXISTS "Authenticated read visitors" ON visitors;
DROP POLICY IF EXISTS "Receptionist/Admin can manage visitors" ON visitors;
DROP POLICY IF EXISTS "Visitors read by authorized roles or host" ON visitors;
DROP POLICY IF EXISTS "Receptionist/Admin manage visitors" ON visitors;
CREATE POLICY "visitors_select_authorized" ON visitors FOR SELECT USING (
  auth.uid() IS NOT NULL AND (
    public.is_current_user_admin() OR
    public.current_user_role() IN ('Commandant','Director','Receptionist','Security','PA_TO_DIRECTOR','PA_TO_CI') OR
    EXISTS (SELECT 1 FROM visits v JOIN employees e ON e.id = v.employee_id WHERE v.visitor_id = visitors.id AND e.user_id = auth.uid())
  )
);
CREATE POLICY "visitors_write_admin_receptionist" ON visitors FOR ALL USING (
  auth.uid() IS NOT NULL AND (public.is_current_user_admin() OR public.current_user_role() = 'Receptionist')
)
WITH CHECK (
  auth.uid() IS NOT NULL AND (public.is_current_user_admin() OR public.current_user_role() = 'Receptionist')
);

-- employees
DROP POLICY IF EXISTS "Authenticated read employees" ON employees;
DROP POLICY IF EXISTS "Admins manage employees" ON employees;
DROP POLICY IF EXISTS "Employees read by authorized" ON employees;
CREATE POLICY "employees_select_limited" ON employees FOR SELECT USING (
  auth.uid() IS NOT NULL AND (
    public.is_current_user_admin() OR
    public.current_user_role() IN ('Commandant','Director','Receptionist','Security','PA_TO_DIRECTOR','PA_TO_CI') OR
    employees.user_id = auth.uid()
  )
);
CREATE POLICY "employees_admin_all" ON employees FOR ALL USING (public.is_current_user_admin())
WITH CHECK (public.is_current_user_admin());

-- visits
DROP POLICY IF EXISTS "Users can read relevant visits" ON visits;
DROP POLICY IF EXISTS "Admins/Receptionist/PA can manage visits" ON visits;
DROP POLICY IF EXISTS "Visits read by authorized" ON visits;
DROP POLICY IF EXISTS "Admins/Receptionist/PA manage visits" ON visits;
CREATE POLICY "visits_select_authorized" ON visits FOR SELECT USING (
  auth.uid() IS NOT NULL AND (
    public.is_current_user_admin() OR
    public.current_user_role() IN ('Commandant','Director','Receptionist','Security','PA_TO_DIRECTOR','PA_TO_CI') OR
    EXISTS (SELECT 1 FROM employees e WHERE e.user_id = auth.uid() AND e.id = visits.employee_id)
  )
);
CREATE POLICY "visits_write_limited" ON visits FOR ALL USING (
  auth.uid() IS NOT NULL AND (public.is_current_user_admin() OR public.current_user_role() IN ('Receptionist','PA_TO_DIRECTOR','PA_TO_CI'))
)
WITH CHECK (
  auth.uid() IS NOT NULL AND (public.is_current_user_admin() OR public.current_user_role() IN ('Receptionist','PA_TO_DIRECTOR','PA_TO_CI'))
);

-- badges
DROP POLICY IF EXISTS "Users can read relevant badges" ON visitor_badges;
DROP POLICY IF EXISTS "Admins/Receptionist/PA can manage badges" ON visitor_badges;
DROP POLICY IF EXISTS "Badges read by authorized" ON visitor_badges;
DROP POLICY IF EXISTS "Receptionist/PA/Admin manage badges" ON visitor_badges;
CREATE POLICY "badges_select_authorized" ON visitor_badges FOR SELECT USING (
  auth.uid() IS NOT NULL AND (
    public.is_current_user_admin() OR
    public.current_user_role() IN ('Receptionist','Security','PA_TO_DIRECTOR','PA_TO_CI','Commandant','Director') OR
    EXISTS (SELECT 1 FROM visits v JOIN employees e ON e.id = v.employee_id WHERE v.id = visitor_badges.visit_id AND e.user_id = auth.uid())
  )
);
CREATE POLICY "badges_write_limited" ON visitor_badges FOR ALL USING (
  auth.uid() IS NOT NULL AND (public.is_current_user_admin() OR public.current_user_role() IN ('Receptionist','PA_TO_DIRECTOR','PA_TO_CI'))
)
WITH CHECK (
  auth.uid() IS NOT NULL AND (public.is_current_user_admin() OR public.current_user_role() IN ('Receptionist','PA_TO_DIRECTOR','PA_TO_CI'))
);

-- notifications
DROP POLICY IF EXISTS "Users read own or role notifications" ON notifications;
DROP POLICY IF EXISTS "Users update own notifications" ON notifications;
DROP POLICY IF EXISTS "Authenticated can insert notifications" ON notifications;
CREATE POLICY "notifications_select_own_or_role" ON notifications FOR SELECT USING (
  auth.uid() IS NOT NULL AND (user_id = auth.uid() OR recipient_role = public.current_user_role())
);
CREATE POLICY "notifications_update_own" ON notifications FOR UPDATE USING (auth.uid() IS NOT NULL AND user_id = auth.uid()) WITH CHECK (auth.uid() IS NOT NULL AND user_id = auth.uid());
CREATE POLICY "notifications_insert_service_only" ON notifications FOR INSERT WITH CHECK (false);

-- audit logs
DROP POLICY IF EXISTS "Admins read audit logs" ON audit_logs;
DROP POLICY IF EXISTS "Authenticated can insert audit logs" ON audit_logs;
CREATE POLICY "audit_logs_admin_select" ON audit_logs FOR SELECT USING (public.is_current_user_admin());
CREATE POLICY "audit_logs_insert_service_only" ON audit_logs FOR INSERT WITH CHECK (false);
CREATE POLICY "audit_logs_no_modify" ON audit_logs FOR UPDATE USING (false) WITH CHECK (false);
CREATE POLICY "audit_logs_no_delete" ON audit_logs FOR DELETE USING (false);

-- lookups
DROP POLICY IF EXISTS "Authenticated read departments" ON departments;
DROP POLICY IF EXISTS "Admins manage departments" ON departments;
DROP POLICY IF EXISTS "Authenticated read positions" ON positions;
DROP POLICY IF EXISTS "Admins manage positions" ON positions;
DROP POLICY IF EXISTS "Authenticated read office_locations" ON office_locations;
DROP POLICY IF EXISTS "Admins manage office_locations" ON office_locations;
CREATE POLICY "departments_select_authenticated" ON departments FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "departments_admin_all" ON departments FOR ALL USING (public.is_current_user_admin()) WITH CHECK (public.is_current_user_admin());
CREATE POLICY "positions_select_authenticated" ON positions FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "positions_admin_all" ON positions FOR ALL USING (public.is_current_user_admin()) WITH CHECK (public.is_current_user_admin());
CREATE POLICY "office_locations_select_authenticated" ON office_locations FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "office_locations_admin_all" ON office_locations FOR ALL USING (public.is_current_user_admin()) WITH CHECK (public.is_current_user_admin());

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
