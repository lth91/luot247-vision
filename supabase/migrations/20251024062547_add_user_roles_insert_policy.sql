-- Add INSERT policy for user_roles to allow users to insert their own roles
-- This is needed for the auto-assign admin role functionality

CREATE POLICY "Users can insert own roles" ON public.user_roles
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Also add UPDATE policy for completeness
CREATE POLICY "Users can update own roles" ON public.user_roles
  FOR UPDATE USING (auth.uid() = user_id);
