-- Add DELETE policy for view_logs2 table
-- This is needed for the admin to delete logs when resetting view counts

DROP POLICY IF EXISTS "Admin can delete view_logs2" ON public.view_logs2;

CREATE POLICY "Admin can delete view_logs2" 
ON public.view_logs2
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() AND role = 'admin'
  )
);

