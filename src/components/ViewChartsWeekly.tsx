import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { toast } from "sonner";

interface WeeklyData {
  day_name: string;
  view_date: string;
  view_count: number;
}

export const ViewChartsWeekly = () => {
  const [weeklyData, setWeeklyData] = useState<WeeklyData[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchWeeklyData();
  }, []);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchWeeklyData();
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  const fetchWeeklyData = async () => {
    try {
      // @ts-ignore
      const { data, error } = await supabase.rpc("get_weekly_stats_from_daily");

      if (error) {
        console.error("Error fetching weekly data:", error);
        toast.error("Không thể tải dữ liệu tuần");
        return;
      }

      setWeeklyData(data || []);
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <Card className="p-6">
        <p className="text-center text-muted-foreground">Đang tải biểu đồ tuần...</p>
      </Card>
    );
  }

  if (weeklyData.length === 0) {
    return (
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">📊 Xu hướng view theo tuần</h3>
        <p className="text-center text-muted-foreground">Chưa có dữ liệu tuần này</p>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <h3 className="text-lg font-semibold mb-4">📊 Xu hướng view theo tuần</h3>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={weeklyData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis 
            dataKey="day_name" 
            tick={{ fontSize: 12 }}
          />
          <YAxis 
            tick={{ fontSize: 12 }}
            tickFormatter={(value) => value.toLocaleString("vi-VN")}
          />
          <Tooltip 
            formatter={(value: any) => value.toLocaleString("vi-VN")}
            labelFormatter={(label) => `Ngày: ${label}`}
          />
          <Legend />
          <Line 
            type="monotone" 
            dataKey="view_count" 
            stroke="#10b981" 
            strokeWidth={2}
            name="Lượt xem"
            dot={{ r: 4 }}
            activeDot={{ r: 6 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </Card>
  );
};
