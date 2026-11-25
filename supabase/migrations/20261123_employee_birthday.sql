-- Migration: Add employee birthday fields for Birthday Celebration feature
-- Adds date_of_birth (optional), birthday_public (consent flag, default false),
-- and photo_url (optional profile photo) columns to employees table.

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS date_of_birth DATE,
  ADD COLUMN IF NOT EXISTS birthday_public BOOLEAN DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS photo_url TEXT;

CREATE INDEX IF NOT EXISTS idx_employees_date_of_birth ON employees(date_of_birth);
CREATE INDEX IF NOT EXISTS idx_employees_birthday_public ON employees(birthday_public);
