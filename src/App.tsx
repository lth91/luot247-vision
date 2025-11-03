import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ReadingProvider } from "@/contexts/ReadingContext";
import { FavoritesProvider } from "@/contexts/FavoritesContext";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import NewsDetail from "./pages/NewsDetail";
import Classification from "./pages/Classification";
import DataManagement from "./pages/DataManagement";
import ViewCount2 from "./pages/ViewCount2";
import ViewManagement2 from "./pages/ViewManagement2";
import Home2 from "./pages/Home2";
import About from "./pages/About";
import Favorites from "./pages/Favorites";
import Admin from "./pages/Admin";
import NotFound from "./pages/NotFound";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Session } from "@supabase/supabase-js";

const queryClient = new QueryClient();

const App = () => {
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ReadingProvider>
          <FavoritesProvider userId={session?.user?.id}>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="/auth" element={<Auth />} />
                <Route path="/tin/:id" element={<Index />} />
                <Route path="/duyet-tin" element={<Classification />} />
                <Route path="/tai-du-lieu" element={<DataManagement />} />
                <Route path="/data-management" element={<DataManagement />} />
                <Route path="/viewcount" element={<ViewCount2 />} />
                <Route path="/viewcount2" element={<ViewCount2 />} />
                <Route path="/quan-ly-view" element={<ViewManagement2 />} />
                <Route path="/quan-ly-view2" element={<ViewManagement2 />} />
                <Route path="/home2" element={<Home2 />} />
                <Route path="/about" element={<About />} />
                <Route path="/favorites" element={<Favorites />} />
                <Route path="/admin" element={<Admin />} />
                {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </BrowserRouter>
          </FavoritesProvider>
        </ReadingProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
