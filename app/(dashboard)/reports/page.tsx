"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/hooks/use-user";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { STATUS_CONFIG, PAYMENT_CONFIG } from "@/lib/constants";
import { Loader2, DollarSign, TrendingUp, Package, Percent } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import type { Load, LoadStatus } from "@/types";

const CHART_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899"];

export default function ReportsPage() {
  const supabase = createClient();
  const { user, loading: userLoading } = useUser();
  const router = useRouter();
  const [loads, setLoads] = useState<Load[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userLoading && user?.role !== "admin") {
      router.push("/dashboard");
      return;
    }
    async function fetch() {
      const { data } = await supabase.from("loads").select("*").order("created_at", { ascending: false });
      setLoads(data || []);
      setLoading(false);
    }
    if (user?.role === "admin") fetch();
  }, [user, userLoading]);

  if (userLoading || loading) {
    return <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  // Calculate metrics
  const deliveredLoads = loads.filter((l) => l.status === "delivered");
  const cancelledLoads = loads.filter((l) => l.status === "cancelled");
  const activeLoads = loads.filter((l) => !["delivered", "cancelled"].includes(l.status));

  const totalRevenue = deliveredLoads.reduce((sum, l) => sum + (l.rate || 0), 0);
  const paidRevenue = deliveredLoads.filter((l) => l.payment_status === "paid").reduce((sum, l) => sum + (l.rate || 0), 0);
  const avgRate = deliveredLoads.length > 0 ? totalRevenue / deliveredLoads.length : 0;
  const cancellationRate = loads.length > 0 ? (cancelledLoads.length / loads.length) * 100 : 0;

  // Status breakdown for pie chart
  const statusBreakdown = Object.entries(
    loads.reduce((acc, l) => { acc[l.status] = (acc[l.status] || 0) + 1; return acc; }, {} as Record<string, number>)
  ).map(([status, count]) => ({
    name: STATUS_CONFIG[status as LoadStatus]?.label || status,
    value: count,
  }));

  // Payment breakdown
  const paymentBreakdown = Object.entries(
    loads.reduce((acc, l) => { acc[l.payment_status] = (acc[l.payment_status] || 0) + 1; return acc; }, {} as Record<string, number>)
  ).map(([status, count]) => ({
    name: PAYMENT_CONFIG[status]?.label || status,
    value: count,
  }));

  // Monthly revenue
  const monthlyRevenue = deliveredLoads.reduce((acc, l) => {
    const month = new Date(l.completed_at || l.created_at).toLocaleDateString("en-US", { month: "short", year: "2-digit" });
    acc[month] = (acc[month] || 0) + (l.rate || 0);
    return acc;
  }, {} as Record<string, number>);

  const monthlyData = Object.entries(monthlyRevenue).map(([month, revenue]) => ({ month, revenue })).slice(-12);

  // Top drivers by revenue
  const driverRevenue: Record<string, number> = {};
  deliveredLoads.forEach((l) => {
    if (l.driver_id) driverRevenue[l.driver_id] = (driverRevenue[l.driver_id] || 0) + (l.rate || 0);
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Reports" description="Financial and operational analytics (Admin only)" />

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <DollarSign className="h-5 w-5 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${totalRevenue.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">${paidRevenue.toLocaleString()} collected</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Average Rate</CardTitle>
            <TrendingUp className="h-5 w-5 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${avgRate.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
            <p className="text-xs text-muted-foreground mt-1">per delivered load</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Loads</CardTitle>
            <Package className="h-5 w-5 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{loads.length}</div>
            <p className="text-xs text-muted-foreground mt-1">{activeLoads.length} active · {deliveredLoads.length} delivered</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Cancellation Rate</CardTitle>
            <Percent className="h-5 w-5 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{cancellationRate.toFixed(1)}%</div>
            <p className="text-xs text-muted-foreground mt-1">{cancelledLoads.length} cancelled</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="revenue" className="space-y-4">
        <TabsList>
          <TabsTrigger value="revenue">Revenue</TabsTrigger>
          <TabsTrigger value="status">Status Breakdown</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
        </TabsList>

        <TabsContent value="revenue">
          <Card>
            <CardHeader><CardTitle>Monthly Revenue</CardTitle></CardHeader>
            <CardContent>
              {monthlyData.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-8">No revenue data yet</p>
              ) : (
                <div className="h-[350px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={monthlyData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="month" className="text-xs" />
                      <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} className="text-xs" />
                      <Tooltip formatter={(value: number) => [`$${value.toLocaleString()}`, "Revenue"]} />
                      <Bar dataKey="revenue" fill="hsl(221.2, 83.2%, 53.3%)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="status">
          <Card>
            <CardHeader><CardTitle>Load Status Distribution</CardTitle></CardHeader>
            <CardContent>
              {statusBreakdown.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-8">No data</p>
              ) : (
                <div className="h-[350px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={statusBreakdown} cx="50%" cy="50%" outerRadius={120} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                        {statusBreakdown.map((_, idx) => <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />)}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payments">
          <Card>
            <CardHeader><CardTitle>Payment Status</CardTitle></CardHeader>
            <CardContent>
              {paymentBreakdown.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-8">No data</p>
              ) : (
                <div className="h-[350px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={paymentBreakdown} cx="50%" cy="50%" outerRadius={120} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                        {paymentBreakdown.map((_, idx) => <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />)}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
