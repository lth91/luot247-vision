-- Add INSERT policy for view_stats2 table
-- This allows authenticated users to insert new stat records if they don't exist

DROP POLICY IF EXISTS "view_stats2_insertable_by_authenticated" ON public.view_stats2;

CREATE POLICY "view_stats2_insertable_by_authenticated"
  ON public.view_stats2
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

