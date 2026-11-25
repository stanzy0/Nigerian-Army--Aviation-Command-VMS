-- Migration: Create employee-photos storage bucket and policies
-- Storage bucket for employee profile photographs
-- Public read access, Admin write access only

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'employee-photos',
  'employee-photos',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Public can view employee photos (read-only)
CREATE POLICY "Public can view employee photos"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'employee-photos');

-- Admin can upload employee photos
CREATE POLICY "Admin can upload employee photos"
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'employee-photos'
    AND
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'Admin'
    )
  );

-- Admin can update employee photos
CREATE POLICY "Admin can update employee photos"
  ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'employee-photos'
    AND
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'Admin'
    )
  );

-- Admin can delete employee photos
CREATE POLICY "Admin can delete employee photos"
  ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'employee-photos'
    AND
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'Admin'
    )
  );
