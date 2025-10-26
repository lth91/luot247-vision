-- Run this SQL on Supabase Dashboard to allow admins to delete view_logs

-- First, check if you're logged in as admin
SELECT auth.uid(), email FROM auth.users WHERE email = 'longth91@gmail.com';

-- Then create the delete policy (drop first if exists)
DROP POLICY IF EXISTS "Admin can delete view logs" ON public.view_logs;

CREATE POLICY "Admin can delete view logs" 
ON public.view_logs
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() AND role = 'admin'
  )
);

-- Verify the policy was created
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual 
FROM pg_policies 
WHERE tablename = 'view_logs';

