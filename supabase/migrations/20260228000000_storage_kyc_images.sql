-- Create storage bucket for KYC images
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('kyc-images', 'kyc-images', true, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp']);

-- Set up RLS policies for KYC images bucket
-- Allow users to upload their own KYC images
CREATE POLICY "Users can upload their own KYC images"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'kyc-images' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow users to view their own KYC images
CREATE POLICY "Users can view their own KYC images"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'kyc-images' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow users to update their own KYC images
CREATE POLICY "Users can update their own KYC images"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'kyc-images' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow service role to access all KYC images (for admin dashboard)
CREATE POLICY "Service role can manage all KYC images"
ON storage.objects FOR ALL
USING (auth.role() = 'service_role');
