-- NA Avn Comd - Initial migration (first release)
-- Do not execute against production. Apply to a new Supabase project only when ready.
-- RLS enabled; use auth.uid() and user_roles for authorization. Do not use service role in browser.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enums
DO $$ BEGIN
  CREATE TYPE visit_status AS ENUM ('pending','approved','rejected','checked_in','checked_out');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE badge_status AS ENUM ('Pending','Active','Returned','Expired','Cancelled');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE doc_verification_status AS ENUM ('Pending','Verified','Rejected');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Roles
CREATE TABLE IF NOT EXISTS user_roles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  role TEXT NOT NULL CHECK (role IN ('Admin','Commandant','Director','Receptionist','Security','Host Employee','PA_TO_DIRECTOR','PA_TO_CI')),
  must_change_password BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Departments, positions, office locations
CREATE TABLE IF NOT EXISTS departments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS positions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS office_locations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  building TEXT,
  department TEXT,
  office_name TEXT,
  display_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Employees
CREATE TABLE IF NOT EXISTS employees (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  department_id UUID REFERENCES departments(id),
  position_id UUID REFERENCES positions(id),
  office_location_id UUID REFERENCES office_locations(id),
  department TEXT,
  position TEXT,
  office_location TEXT,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(email)
);

-- Visitors
CREATE TABLE IF NOT EXISTS visitors (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  full_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  visitor_organization TEXT,
  visitor_address TEXT,
  nationality TEXT,
  gender TEXT,
  vehicle_plate TEXT,
  vehicle_type TEXT,
  emergency_contact TEXT,
  photo_url TEXT,
  doc_type TEXT,
  doc_number TEXT,
  issuing_country TEXT,
  expiry_date DATE,
  doc_front_url TEXT,
  doc_back_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Visits
CREATE TABLE IF NOT EXISTS visits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  visitor_id UUID NOT NULL REFERENCES visitors(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  purpose TEXT NOT NULL,
  status visit_status DEFAULT 'pending',
  qr_code TEXT,
  check_in_time TIMESTAMPTZ,
  check_out_time TIMESTAMPTZ,
  scheduled_date TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Badges (optional for first release but present)
CREATE TABLE IF NOT EXISTS visitor_badges (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  visit_id UUID NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
  badge_number TEXT UNIQUE,
  badge_status badge_status DEFAULT 'Pending',
  issued_at TIMESTAMPTZ,
  printed_at TIMESTAMPTZ,
  returned_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Notifications
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_role TEXT,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT DEFAULT 'info',
  is_read BOOLEAN DEFAULT FALSE,
  related_type TEXT,
  related_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Audit logs (immutable in policy)
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  performed_by TEXT,
  details JSONB,
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_visits_visitor_id ON visits(visitor_id);
CREATE INDEX IF NOT EXISTS idx_visits_employee_id ON visits(employee_id);
CREATE INDEX IF NOT EXISTS idx_visits_status ON visits(status);
CREATE INDEX IF NOT EXISTS idx_visits_created_at ON visits(created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_role ON notifications(recipient_role);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);

-- RLS
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

-- RLS policies (restrictive by default)
CREATE POLICY "Users can read own role" ON user_roles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Only admins can manage roles" ON user_roles FOR ALL USING (
  auth.uid() IS NOT NULL AND EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'Admin')
);

CREATE POLICY "Authenticated read employees" ON employees FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Admins manage employees" ON employees FOR ALL USING (
  EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'Admin')
);

CREATE POLICY "Authenticated read visitors" ON visitors FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Receptionist/Admin can manage visitors" ON visitors FOR ALL USING (
  EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = auth.uid() AND ur.role IN ('Admin','Receptionist'))
);

CREATE POLICY "Users can read relevant visits" ON visits FOR SELECT USING (
  auth.uid() IS NOT NULL AND (
    EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = auth.uid() AND ur.role IN ('Admin','Commandant','Director','Receptionist','Security','PA_TO_DIRECTOR','PA_TO_CI')) OR
    EXISTS (SELECT 1 FROM employees e WHERE e.user_id = auth.uid() AND e.id = visits.employee_id)
  )
);
CREATE POLICY "Admins/Receptionist/PA can manage visits" ON visits FOR ALL USING (
  EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = auth.uid() AND ur.role IN ('Admin','Receptionist','PA_TO_DIRECTOR','PA_TO_CI'))
);

CREATE POLICY "Users read own notifications" ON notifications FOR SELECT USING (auth.uid() = user_id OR recipient_role IN (SELECT role FROM user_roles WHERE user_id = auth.uid()));
CREATE POLICY "Users update own notifications" ON notifications FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Authenticated can insert notifications" ON notifications FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Admins read audit logs" ON audit_logs FOR SELECT USING (
  EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'Admin')
);
CREATE POLICY "Authenticated can insert audit logs" ON audit_logs FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Departments/Positions/Locations (read by authenticated, managed by admins)
CREATE POLICY "Authenticated read departments" ON departments FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Admins manage departments" ON departments FOR ALL USING (
  auth.uid() IS NOT NULL AND EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'Admin')
);

CREATE POLICY "Authenticated read positions" ON positions FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Admins manage positions" ON positions FOR ALL USING (
  auth.uid() IS NOT NULL AND EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'Admin')
);

CREATE POLICY "Authenticated read office_locations" ON office_locations FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Admins manage office_locations" ON office_locations FOR ALL USING (
  auth.uid() IS NOT NULL AND EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'Admin')
);

-- Badges
CREATE POLICY "Users can read relevant badges" ON visitor_badges FOR SELECT USING (
  auth.uid() IS NOT NULL AND (
    EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = auth.uid() AND ur.role IN ('Admin','Commandant','Director','Receptionist','Security','PA_TO_DIRECTOR','PA_TO_CI')) OR
    EXISTS (SELECT 1 FROM visits v JOIN employees e ON e.id = v.employee_id WHERE v.id = visitor_badges.visit_id AND e.user_id = auth.uid())
  )
);
CREATE POLICY "Admins/Receptionist/PA can manage badges" ON visitor_badges FOR ALL USING (
  auth.uid() IS NOT NULL AND EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = auth.uid() AND ur.role IN ('Admin','Receptionist','PA_TO_DIRECTOR','PA_TO_CI'))
);

-- Notes: policies are restrictive; no USING(true). Admin provisioning must be manual via trusted server process.
