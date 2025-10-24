-- Add admin role for longth91@gmail.com
-- This migration assigns admin role to the specified user

-- First, we need to find the user_id for longth91@gmail.com
-- and then insert the admin role

-- Insert admin role for longth91@gmail.com
-- Note: This will work even if the user doesn't exist yet
INSERT INTO public.user_roles (user_id, role)
SELECT 
  au.id as user_id,
  'admin'::app_role as role
FROM auth.users au
WHERE au.email = 'longth91@gmail.com'
ON CONFLICT (user_id, role) DO NOTHING;

-- Also ensure the user has both user and admin roles
-- (in case they only have admin role)
INSERT INTO public.user_roles (user_id, role)
SELECT 
  au.id as user_id,
  'user'::app_role as role
FROM auth.users au
WHERE au.email = 'longth91@gmail.com'
ON CONFLICT (user_id, role) DO NOTHING;
