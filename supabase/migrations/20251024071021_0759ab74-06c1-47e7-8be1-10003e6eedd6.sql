-- Allow admins to view all user roles
CREATE POLICY "Admins can view all roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin') OR auth.uid() = user_id
);

-- Allow admins to insert roles for any user
CREATE POLICY "Admins can insert any roles"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin') OR auth.uid() = user_id
);

-- Allow admins to update any roles
CREATE POLICY "Admins can update any roles"
ON public.user_roles
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin') OR auth.uid() = user_id
);

-- Allow admins to delete any roles
CREATE POLICY "Admins can delete any roles"
ON public.user_roles
FOR DELETE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
);

-- Drop old restrictive policies
DROP POLICY IF EXISTS "Users can view own roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can insert own roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can update own roles" ON public.user_roles;