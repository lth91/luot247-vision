
-- Add DELETE policy for news table
-- Allow authenticated users (admins/moderators) to delete news
CREATE POLICY "Authenticated users can delete news"
ON public.news
FOR DELETE
USING (auth.uid() IS NOT NULL);

-- Add DELETE policy for import_history table  
-- Allow authenticated users to delete their import history
CREATE POLICY "Authenticated users can delete import history"
ON public.import_history
FOR DELETE
USING (auth.uid() IS NOT NULL);
