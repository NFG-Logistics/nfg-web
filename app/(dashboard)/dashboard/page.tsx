import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { STATUS_CONFIG } from "@/lib/constants";
import { Package, Truck, CheckCircle2, DollarSign } from "lucide-react";
import type { LoadStatus } from "@/types";

export default async function DashboardPage() {
  const supabase = createClient();

  // Fetch all KPIs in parallel
  const [loadsRes, driversRes, deliveredRes, revenueRes, recentRes, activeRes] = await Promise.all([
    supabase.from("loads").select("id", { count: "exact", head: true }).not("status", "in", '("delivered","cancelled")'),
    supabase.from("users").select("id", { count: "exact", head: true }).eq("role", "driver").eq("is_active", true),
    supabase.from("loads").select("id", { count: "exact", head: true }).eq("status", "delivered"),
    supabase.from("loads").select("rate").eq("status", "delivered"),
    supabase.from("loads").select("*, driver:driver_id(full_name), dispatcher:dispatcher_id(full_name)").order("created_at", { ascending: false }).limit(8),
    supabase.from("loads").select("status").not("status", "in", '("delivered","cancelled")'),
  ]);

  const activeLoadCount = loadsRes.count || 0;
  const driverCount = driversRes.count || 0;
  const deliveredCount = deliveredRes.count || 0;
  const totalRevenue = (revenueRes.data || []).reduce((sum, l) => sum + (l.rate || 0), 0);
  const recentLoads = recentRes.data || [];

  // Status breakdown for active loads
  const statusBreakdown: Record<string, number> = {};
  (activeRes.data || []).forEach((l) => {
    statusBreakdown[l.status] = (statusBreakdown[l.status] || 0) + 1;
  });

  const kpis = [
    { title: "Active Loads", value: activeLoadCount, icon: Package, color: "text-blue-600 dark:text-blue-400" },
    { title: "Active Drivers", value: driverCount, icon: Truck, color: "text-emerald-600 dark:text-emerald-400" },
    { title: "Delivered", value: deliveredCount, icon: CheckCircle2, color: "text-green-600 dark:text-green-400" },
    { title: "Total Revenue", value: `$${totalRevenue.toLocaleString()}`, icon: DollarSign, color: "text-amber-600 dark:text-amber-400" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" description="Overview of your trucking operations" />

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <Card key={kpi.title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{kpi.title}</CardTitle>
              <kpi.icon className={`h-5 w-5 ${kpi.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{kpi.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Recent Loads */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg">Recent Loads</CardTitle>
          </CardHeader>
          <CardContent>
            {recentLoads.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No loads yet</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Reference</TableHead>
                    <TableHead>Driver</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Rate</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentLoads.map((load) => {
                    const cfg = STATUS_CONFIG[load.status as LoadStatus];
                    return (
                      <TableRow key={load.id}>
                        <TableCell className="font-medium">{load.reference_number}</TableCell>
                        <TableCell>{(load.driver as any)?.full_name || "—"}</TableCell>
                        <TableCell>
                          <Badge variant={cfg?.variant || "secondary"}>{cfg?.label || load.status}</Badge>
                        </TableCell>
                        <TableCell className="text-right">${Number(load.rate).toLocaleString()}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Active Load Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Active Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            {Object.keys(statusBreakdown).length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No active loads</p>
            ) : (
              <div className="space-y-3">
                {Object.entries(statusBreakdown).map(([status, count]) => {
                  const cfg = STATUS_CONFIG[status as LoadStatus];
                  return (
                    <div key={status} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant={cfg?.variant || "secondary"} className="text-xs">
                          {cfg?.label || status}
                        </Badge>
                      </div>
                      <span className="text-sm font-semibold">{count}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
