-- Add DELETE policy for view_logs table
-- This is needed for the admin to delete logs when updating view counts

CREATE POLICY "Admin can delete view logs" 
ON public.view_logs
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() AND role = 'admin'
  )
);

