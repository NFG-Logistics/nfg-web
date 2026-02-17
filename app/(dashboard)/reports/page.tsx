"use client";

import { useEffect, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/hooks/use-user";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { STATUS_CONFIG, PAYMENT_CONFIG } from "@/lib/constants";
import {
  Loader2,
  DollarSign,
  TrendingUp,
  Package,
  Percent,
  Users2,
  Trophy,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import type { Load, LoadStatus, User as UserType } from "@/types";

const CHART_COLORS = [
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#06b6d4",
  "#ec4899",
];

export default function ReportsPage() {
  const supabase = useMemo(() => createClient(), []);
  const { user, loading: userLoading } = useUser();
  const router = useRouter();
  const [loads, setLoads] = useState<Load[]>([]);
  const [drivers, setDrivers] = useState<UserType[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userLoading && user?.role !== "admin") {
      router.push("/dashboard");
      return;
    }
    async function fetchReportData() {
      try {
        const [loadsRes, driversRes] = await Promise.all([
          supabase
            .from("loads")
            .select("*")
            .order("created_at", { ascending: false }),
          supabase
            .from("users")
            .select("*")
            .eq("role", "driver")
            .eq("is_active", true)
            .order("full_name"),
        ]);
        if (loadsRes.error) console.error("Reports: loads error", loadsRes.error);
        if (driversRes.error) console.error("Reports: drivers error", driversRes.error);
        setLoads(loadsRes.data || []);
        setDrivers(driversRes.data || []);
      } catch (err) {
        console.error("Reports fetch exception:", err);
      } finally {
        setLoading(false);
      }
    }
    if (user?.role === "admin") fetchReportData();
  }, [user, userLoading, supabase, router]);

  // ── Derived data ────────────────────────────────────────────────────
  // Revenue = ONLY loads where status = delivered
  const deliveredLoads = useMemo(
    () => loads.filter((l) => l.status === "delivered"),
    [loads]
  );
  const cancelledLoads = useMemo(
    () => loads.filter((l) => l.status === "cancelled"),
    [loads]
  );
  const activeLoads = useMemo(
    () =>
      loads.filter(
        (l) => !["delivered", "cancelled"].includes(l.status)
      ),
    [loads]
  );

  // Revenue from delivered loads only
  const totalRevenue = useMemo(
    () => deliveredLoads.reduce((sum, l) => sum + (l.rate || 0), 0),
    [deliveredLoads]
  );
  const paidRevenue = useMemo(
    () =>
      deliveredLoads
        .filter((l) => l.payment_status === "paid")
        .reduce((sum, l) => sum + (l.rate || 0), 0),
    [deliveredLoads]
  );
  const avgRate = useMemo(
    () =>
      deliveredLoads.length > 0 ? totalRevenue / deliveredLoads.length : 0,
    [deliveredLoads, totalRevenue]
  );
  const cancellationRate = useMemo(
    () =>
      loads.length > 0
        ? (cancelledLoads.length / loads.length) * 100
        : 0,
    [loads, cancelledLoads]
  );

  // Status breakdown for pie chart (all loads)
  const statusBreakdown = useMemo(() => {
    return Object.entries(
      loads.reduce(
        (acc, l) => {
          acc[l.status] = (acc[l.status] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      )
    ).map(([status, count]) => ({
      name: STATUS_CONFIG[status as LoadStatus]?.label || status,
      value: count,
    }));
  }, [loads]);

  // Payment breakdown — delivered loads only (revenue-relevant)
  const paymentBreakdown = useMemo(() => {
    return Object.entries(
      deliveredLoads.reduce(
        (acc, l) => {
          acc[l.payment_status] = (acc[l.payment_status] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      )
    ).map(([status, count]) => ({
      name: PAYMENT_CONFIG[status]?.label || status,
      value: count,
    }));
  }, [deliveredLoads]);

  // Monthly revenue — strictly using completed_at on delivered loads
  const monthlyData = useMemo(() => {
    const monthly = deliveredLoads.reduce(
      (acc, l) => {
        // Only count loads that have completed_at (admin-approved delivered)
        if (!l.completed_at) return acc;
        const month = new Date(l.completed_at).toLocaleDateString("en-US", {
          month: "short",
          year: "2-digit",
        });
        acc[month] = (acc[month] || 0) + (l.rate || 0);
        return acc;
      },
      {} as Record<string, number>
    );
    return Object.entries(monthly)
      .map(([month, revenue]) => ({ month, revenue }))
      .slice(-12);
  }, [deliveredLoads]);

  // Top drivers — delivered loads only
  const topDrivers = useMemo(() => {
    const map: Record<
      string,
      { driverId: string; revenue: number; loadCount: number }
    > = {};
    deliveredLoads.forEach((l) => {
      if (!l.driver_id) return;
      if (!map[l.driver_id]) {
        map[l.driver_id] = {
          driverId: l.driver_id,
          revenue: 0,
          loadCount: 0,
        };
      }
      map[l.driver_id].revenue += l.rate || 0;
      map[l.driver_id].loadCount += 1;
    });

    return Object.values(map)
      .sort((a, b) => b.revenue - a.revenue)
      .map((entry, idx) => {
        const driver = drivers.find((d) => d.id === entry.driverId);
        return {
          rank: idx + 1,
          name: driver?.full_name ?? "Unknown Driver",
          email: driver?.email,
          phone: driver?.phone,
          deliveredCount: entry.loadCount,
          revenue: entry.revenue,
          avgPerLoad:
            entry.loadCount > 0
              ? entry.revenue / entry.loadCount
              : 0,
        };
      });
  }, [deliveredLoads, drivers]);

  // ── Loading ─────────────────────────────────────────────────────────
  if (userLoading || loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        description="Financial and operational analytics (Admin only)"
      />

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Total Revenue
            </CardTitle>
            <DollarSign className="h-5 w-5 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${totalRevenue.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              ${paidRevenue.toLocaleString()} collected ·{" "}
              {deliveredLoads.length} delivered loads
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Average Rate
            </CardTitle>
            <TrendingUp className="h-5 w-5 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              $
              {avgRate.toLocaleString(undefined, {
                maximumFractionDigits: 0,
              })}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              per delivered load
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Total Loads
            </CardTitle>
            <Package className="h-5 w-5 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{loads.length}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {activeLoads.length} active · {deliveredLoads.length} delivered
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Cancellation Rate
            </CardTitle>
            <Percent className="h-5 w-5 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {cancellationRate.toFixed(1)}%
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {cancelledLoads.length} cancelled
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="revenue" className="space-y-4">
        <TabsList>
          <TabsTrigger value="revenue">Revenue</TabsTrigger>
          <TabsTrigger value="drivers">Top Drivers</TabsTrigger>
          <TabsTrigger value="status">Status Breakdown</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
        </TabsList>

        {/* ── Revenue chart ──────────────────────────────────────────── */}
        <TabsContent value="revenue">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-emerald-500" />
                Monthly Revenue
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Based on <code>completed_at</code> of delivered loads only
              </p>
            </CardHeader>
            <CardContent>
              {monthlyData.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-8">
                  No revenue data yet
                </p>
              ) : (
                <div className="h-[350px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={monthlyData}>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        className="stroke-muted"
                      />
                      <XAxis dataKey="month" className="text-xs" />
                      <YAxis
                        tickFormatter={(v) =>
                          `$${(v / 1000).toFixed(0)}k`
                        }
                        className="text-xs"
                      />
                      <Tooltip
                        formatter={(value: number) => [
                          `$${value.toLocaleString()}`,
                          "Revenue",
                        ]}
                      />
                      <Bar
                        dataKey="revenue"
                        fill="hsl(221.2, 83.2%, 53.3%)"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Top Drivers ────────────────────────────────────────────── */}
        <TabsContent value="drivers">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Trophy className="h-5 w-5 text-amber-500" />
                Top Drivers by Revenue
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Ranked by total revenue from delivered loads only
              </p>
            </CardHeader>
            <CardContent className="p-0">
              {topDrivers.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <Users2 className="h-10 w-10 mb-2 opacity-40" />
                  <p className="text-sm">
                    No delivered loads with assigned drivers yet
                  </p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30">
                      <TableHead className="w-[60px] font-semibold">
                        Rank
                      </TableHead>
                      <TableHead className="font-semibold">Driver</TableHead>
                      <TableHead className="font-semibold text-center">
                        Delivered
                      </TableHead>
                      <TableHead className="font-semibold text-right">
                        Revenue
                      </TableHead>
                      <TableHead className="font-semibold text-right hidden sm:table-cell">
                        Avg / Load
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {topDrivers.map((d) => {
                      const initials = d.name
                        .split(" ")
                        .map((n) => n[0])
                        .join("")
                        .toUpperCase()
                        .slice(0, 2);
                      return (
                        <TableRow key={d.rank}>
                          <TableCell>
                            {d.rank <= 3 ? (
                              <span
                                className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-white ${
                                  d.rank === 1
                                    ? "bg-amber-500"
                                    : d.rank === 2
                                    ? "bg-slate-400"
                                    : "bg-amber-700"
                                }`}
                              >
                                {d.rank}
                              </span>
                            ) : (
                              <span className="inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium bg-muted">
                                {d.rank}
                              </span>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <Avatar className="h-8 w-8">
                                <AvatarFallback className="text-xs bg-primary/10 text-primary">
                                  {initials}
                                </AvatarFallback>
                              </Avatar>
                              <div>
                                <p className="font-medium text-sm">
                                  {d.name}
                                </p>
                                {d.phone && (
                                  <p className="text-xs text-muted-foreground">
                                    {d.phone}
                                  </p>
                                )}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant="success" className="text-xs">
                              {d.deliveredCount} loads
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-semibold">
                            ${d.revenue.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right text-sm text-muted-foreground hidden sm:table-cell">
                            $
                            {d.avgPerLoad.toLocaleString(undefined, {
                              maximumFractionDigits: 0,
                            })}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Status breakdown ───────────────────────────────────────── */}
        <TabsContent value="status">
          <Card>
            <CardHeader>
              <CardTitle>Load Status Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              {statusBreakdown.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-8">
                  No data
                </p>
              ) : (
                <div className="h-[350px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={statusBreakdown}
                        cx="50%"
                        cy="50%"
                        outerRadius={120}
                        dataKey="value"
                        label={({ name, percent }) =>
                          `${name} ${(percent * 100).toFixed(0)}%`
                        }
                      >
                        {statusBreakdown.map((_, idx) => (
                          <Cell
                            key={idx}
                            fill={
                              CHART_COLORS[idx % CHART_COLORS.length]
                            }
                          />
                        ))}
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

        {/* ── Payment breakdown (delivered loads only) ────────────────── */}
        <TabsContent value="payments">
          <Card>
            <CardHeader>
              <CardTitle>Payment Status</CardTitle>
              <p className="text-sm text-muted-foreground">
                Delivered loads only ({deliveredLoads.length} total)
              </p>
            </CardHeader>
            <CardContent>
              {paymentBreakdown.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-8">
                  No delivered loads yet
                </p>
              ) : (
                <div className="h-[350px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={paymentBreakdown}
                        cx="50%"
                        cy="50%"
                        outerRadius={120}
                        dataKey="value"
                        label={({ name, percent }) =>
                          `${name} ${(percent * 100).toFixed(0)}%`
                        }
                      >
                        {paymentBreakdown.map((_, idx) => (
                          <Cell
                            key={idx}
                            fill={
                              CHART_COLORS[idx % CHART_COLORS.length]
                            }
                          />
                        ))}
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
