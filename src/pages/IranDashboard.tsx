import { Suspense, lazy, useEffect, useState } from "react";
import { Header } from "@/components/Header";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { IranStatsRow } from "@/components/iran/IranStatsRow";
import { IranLiveFeed } from "@/components/iran/IranLiveFeed";
import { IranTimeline } from "@/components/iran/IranTimeline";

const IranMap = lazy(() => import("@/components/iran/IranMap"));

const IranDashboard = () => {
  const [user, setUser] = useState<any>(null);
  const [userRole, setUserRole] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .single()
      .then(({ data }) => data && setUserRole(data.role));
  }, [user]);

  return (
    <div className="min-h-screen bg-background">
      <Header user={user} userRole={userRole} />

      <main className="container mx-auto px-4 py-6 space-y-4">
        <div className="flex items-baseline justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
              Iran Conflict — Live Dashboard
            </h1>
            <p className="text-sm text-muted-foreground">
              Realtime coverage from Reuters, AP, BBC, CNN, Al Jazeera & GDELT.
              Original English sources, no translation.
            </p>
          </div>
        </div>

        <IranStatsRow />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 h-[640px]">
            <IranLiveFeed />
          </div>
          <div className="lg:col-span-1 h-[640px]">
            <IranTimeline />
          </div>
        </div>

        <Suspense fallback={<Skeleton className="h-[440px] w-full" />}>
          <IranMap />
        </Suspense>
      </main>
    </div>
  );
};

export default IranDashboard;
