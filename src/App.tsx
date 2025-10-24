import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ReadingProvider } from "@/contexts/ReadingContext";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import NewsDetail from "./pages/NewsDetail";
import Classification from "./pages/Classification";
import DataManagement from "./pages/DataManagement";
import ViewCount from "./pages/ViewCount";
import Home2 from "./pages/Home2";
import About from "./pages/About";
import Favorites from "./pages/Favorites";
import Admin from "./pages/Admin";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <ReadingProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/tin/:id" element={<NewsDetail />} />
            <Route path="/duyet-tin" element={<Classification />} />
            <Route path="/tai-du-lieu" element={<DataManagement />} />
            <Route path="/viewcount" element={<ViewCount />} />
            <Route path="/home2" element={<Home2 />} />
            <Route path="/about" element={<About />} />
            <Route path="/favorites" element={<Favorites />} />
            <Route path="/admin" element={<Admin />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </ReadingProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
