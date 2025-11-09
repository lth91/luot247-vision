import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { toast } from "sonner";

interface MonthlyData {
  day: number;
  view_date: string;
  view_count: number;
}

export const ViewChartsMonthly = () => {
  const [monthlyData, setMonthlyData] = useState<MonthlyData[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchMonthlyData();
  }, []);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchMonthlyData();
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  const fetchMonthlyData = async () => {
    try {
      // @ts-ignore
      const { data, error } = await supabase.rpc("get_monthly_stats_from_daily");

      if (error) {
        console.error("Error fetching monthly data:", error);
        toast.error("Không thể tải dữ liệu tháng");
        return;
      }

      setMonthlyData(data || []);
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <Card className="p-6">
        <p className="text-center text-muted-foreground">Đang tải biểu đồ tháng...</p>
      </Card>
    );
  }

  if (monthlyData.length === 0) {
    return (
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">📈 Xu hướng view theo tháng</h3>
        <p className="text-center text-muted-foreground">Chưa có dữ liệu tháng này</p>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <h3 className="text-lg font-semibold mb-4">📈 Xu hướng view theo tháng</h3>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={monthlyData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis 
            dataKey="day" 
            tick={{ fontSize: 12 }}
            label={{ value: 'Ngày trong tháng', position: 'insideBottom', offset: -5 }}
          />
          <YAxis 
            tick={{ fontSize: 12 }}
            tickFormatter={(value) => value.toLocaleString("vi-VN")}
          />
          <Tooltip 
            formatter={(value: any) => value.toLocaleString("vi-VN")}
            labelFormatter={(label) => `Ngày ${label}`}
          />
          <Legend />
          <Line 
            type="monotone" 
            dataKey="view_count" 
            stroke="#f97316" 
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
