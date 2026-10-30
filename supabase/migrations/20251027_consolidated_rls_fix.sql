-- NA Avn Comd - Consolidated RLS/grants fix v2 (apply AFTER 20251024_init_naavc.sql only)
-- NOT EXECUTED. Read-only review required.

-- Functions
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN (SELECT role FROM public.user_roles WHERE user_id = auth.uid() LIMIT 1);
END; $$;

CREATE OR REPLACE FUNCTION public.is_current_user_admin()
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'Admin');
END; $$;

CREATE OR REPLACE FUNCTION public.mark_notification_read(p_notification_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user_id UUID;
BEGIN
  SELECT user_id INTO v_user_id FROM public.notifications WHERE id = p_notification_id;
  IF v_user_id IS NULL OR v_user_id <> auth.uid() THEN RETURN FALSE; END IF;
  UPDATE public.notifications SET is_read = true WHERE id = p_notification_id AND user_id = auth.uid();
  RETURN FOUND;
END; $$;

REVOKE ALL ON FUNCTION public.current_user_role() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_current_user_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_notification_read(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_current_user_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_notification_read(UUID) TO authenticated;

-- Drop all policies on app tables
DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN SELECT policyname, tablename FROM pg_policies WHERE schemaname='public' AND tablename IN ('user_roles','employees','visitors','visits','visitor_badges','departments','positions','office_locations','notifications','audit_logs')
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON %I', pol.policyname, pol.tablename);
  END LOOP;
END $$;

-- user_roles
CREATE POLICY user_roles_self_select ON user_roles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY user_roles_admin_all ON user_roles FOR ALL USING (public.is_current_user_admin()) WITH CHECK (public.is_current_user_admin());

-- lookups
CREATE POLICY departments_auth_select ON departments FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY departments_admin_all ON departments FOR ALL USING (public.is_current_user_admin()) WITH CHECK (public.is_current_user_admin());
CREATE POLICY positions_auth_select ON positions FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY positions_admin_all ON positions FOR ALL USING (public.is_current_user_admin()) WITH CHECK (public.is_current_user_admin());
CREATE POLICY office_locations_auth_select ON office_locations FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY office_locations_admin_all ON office_locations FOR ALL USING (public.is_current_user_admin()) WITH CHECK (public.is_current_user_admin());

-- employees/visitors/visits/badges (role-limited)
CREATE POLICY employees_select_limited ON employees FOR SELECT USING (auth.uid() IS NOT NULL AND (public.is_current_user_admin() OR public.current_user_role() IN ('Commandant','Director','Receptionist','Security','PA_TO_DIRECTOR','PA_TO_CI') OR employees.user_id = auth.uid()));
CREATE POLICY employees_admin_all ON employees FOR ALL USING (public.is_current_user_admin()) WITH CHECK (public.is_current_user_admin());

CREATE POLICY visitors_select_limited ON visitors FOR SELECT USING (auth.uid() IS NOT NULL AND (public.is_current_user_admin() OR public.current_user_role() IN ('Commandant','Director','Receptionist','Security','PA_TO_DIRECTOR','PA_TO_CI') OR EXISTS (SELECT 1 FROM visits v JOIN employees e ON e.id = v.employee_id WHERE v.visitor_id = visitors.id AND e.user_id = auth.uid())));
CREATE POLICY visitors_write_limited ON visitors FOR ALL USING (auth.uid() IS NOT NULL AND (public.is_current_user_admin() OR public.current_user_role() = 'Receptionist')) WITH CHECK (auth.uid() IS NOT NULL AND (public.is_current_user_admin() OR public.current_user_role() = 'Receptionist'));

CREATE POLICY visits_select_limited ON visits FOR SELECT USING (auth.uid() IS NOT NULL AND (public.is_current_user_admin() OR public.current_user_role() IN ('Commandant','Director','Receptionist','Security','PA_TO_DIRECTOR','PA_TO_CI') OR EXISTS (SELECT 1 FROM employees e WHERE e.user_id = auth.uid() AND e.id = visits.employee_id)));
CREATE POLICY visits_write_limited ON visits FOR ALL USING (auth.uid() IS NOT NULL AND (public.is_current_user_admin() OR public.current_user_role() IN ('Receptionist','PA_TO_DIRECTOR','PA_TO_CI'))) WITH CHECK (auth.uid() IS NOT NULL AND (public.is_current_user_admin() OR public.current_user_role() IN ('Receptionist','PA_TO_DIRECTOR','PA_TO_CI')));

CREATE POLICY badges_select_limited ON visitor_badges FOR SELECT USING (auth.uid() IS NOT NULL AND (public.is_current_user_admin() OR public.current_user_role() IN ('Receptionist','Security','PA_TO_DIRECTOR','PA_TO_CI','Commandant','Director') OR EXISTS (SELECT 1 FROM visits v JOIN employees e ON e.id = v.employee_id WHERE v.id = visitor_badges.visit_id AND e.user_id = auth.uid())));
CREATE POLICY badges_write_limited ON visitor_badges FOR ALL USING (auth.uid() IS NOT NULL AND (public.is_current_user_admin() OR public.current_user_role() IN ('Receptionist','PA_TO_DIRECTOR','PA_TO_CI'))) WITH CHECK (auth.uid() IS NOT NULL AND (public.is_current_user_admin() OR public.current_user_role() IN ('Receptionist','PA_TO_DIRECTOR','PA_TO_CI')));

-- notifications
CREATE POLICY notifications_select_own_or_role ON notifications FOR SELECT USING (auth.uid() IS NOT NULL AND (user_id = auth.uid() OR recipient_role = public.current_user_role()));
CREATE POLICY notifications_update_deny ON notifications FOR UPDATE USING (false) WITH CHECK (false);
CREATE POLICY notifications_insert_deny ON notifications FOR INSERT WITH CHECK (false);
CREATE POLICY notifications_delete_deny ON notifications FOR DELETE USING (false);

-- audit logs
CREATE POLICY audit_logs_select_admin ON audit_logs FOR SELECT USING (public.is_current_user_admin());
CREATE POLICY audit_logs_insert_deny ON audit_logs FOR INSERT WITH CHECK (false);
CREATE POLICY audit_logs_update_deny ON audit_logs FOR UPDATE USING (false) WITH CHECK (false);
CREATE POLICY audit_logs_delete_deny ON audit_logs FOR DELETE USING (false);

-- grants (table-scoped)
GRANT USAGE ON SCHEMA public TO authenticated;
REVOKE ALL ON departments, positions, office_locations, user_roles, employees, visitors, visits, visitor_badges, notifications, audit_logs FROM anon;
GRANT SELECT ON departments, positions, office_locations TO authenticated;
GRANT SELECT ON user_roles TO authenticated;
GRANT SELECT, INSERT, UPDATE ON employees, visitors, visits, visitor_badges TO authenticated;
GRANT SELECT ON notifications TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_notification_read(UUID) TO authenticated;
REVOKE TRUNCATE ON ALL TABLES IN SCHEMA public FROM anon, authenticated;

-- Rollback notes: capture pg_policies/grants before apply; do not rely on this script alone
