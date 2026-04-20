import type { Database } from "@/integrations/supabase/types";

export type News = Database["public"]["Tables"]["news"]["Row"];
