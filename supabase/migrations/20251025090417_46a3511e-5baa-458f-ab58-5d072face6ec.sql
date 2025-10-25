-- Drop existing restrictive UPDATE policy
DROP POLICY IF EXISTS "Users can update own roles" ON public.user_roles;

-- Create new policy allowing admins to update any user's roles
CREATE POLICY "Admins can update any user roles"
ON public.user_roles
FOR UPDATE
USING (
  public.has_role(auth.uid(), 'admin')
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
);

-- Allow users to view any roles (needed for admin panel to display all users)
DROP POLICY IF EXISTS "Users can view own roles" ON public.user_roles;

CREATE POLICY "Authenticated users can view all roles"
ON public.user_roles
FOR SELECT
USING (auth.uid() IS NOT NULL);

-- Allow admins to insert roles for any user
DROP POLICY IF EXISTS "Users can insert own roles" ON public.user_roles;

CREATE POLICY "Admins can insert any user roles"
ON public.user_roles
FOR INSERT
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
);