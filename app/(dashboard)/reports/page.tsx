"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/hooks/use-user";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  Download,
} from "lucide-react";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
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
import type { Load, LoadStatus, Stop, Truck, Trailer, User as UserType } from "@/types";

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
  const [stops, setStops] = useState<Stop[]>([]);
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [trailers, setTrailers] = useState<Trailer[]>([]);
  const [revenuePeriod, setRevenuePeriod] = useState<"day" | "week" | "month" | "year">("month");
  const [loading, setLoading] = useState(true);
  const exportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!userLoading && !user) {
      router.replace("/login");
      return;
    }
    if (!userLoading && user?.role !== "admin") {
      router.push("/dashboard");
      return;
    }
    async function fetchReportData() {
      try {
        const [loadsRes, driversRes, stopsRes, trucksRes, trailersRes] = await Promise.all([
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
          supabase.from("stops").select("*"),
          supabase.from("trucks").select("*").eq("is_active", true),
          supabase.from("trailers").select("*").eq("is_active", true),
        ]);
        if (loadsRes.error) console.error("Reports: loads error", loadsRes.error);
        if (driversRes.error) console.error("Reports: drivers error", driversRes.error);
        if (stopsRes.error) console.error("Reports: stops error", stopsRes.error);
        if (trucksRes.error) console.error("Reports: trucks error", trucksRes.error);
        if (trailersRes.error) console.error("Reports: trailers error", trailersRes.error);
        setLoads(loadsRes.data || []);
        setDrivers(driversRes.data || []);
        setStops(stopsRes.data || []);
        setTrucks(trucksRes.data || []);
        setTrailers(trailersRes.data || []);
      } catch (err) {
        console.error("Reports fetch exception:", err);
      } finally {
        setLoading(false);
      }
    }
    if (user?.role === "admin") fetchReportData();
  }, [user, userLoading, supabase, router]);

  // ── Derived data ────────────────────────────────────────────────────
  const inUseStatuses = useMemo(
    () => new Set<LoadStatus>(["dispatched", "on_site_shipper", "loaded", "on_site_receiver", "empty", "retake_requested"] as LoadStatus[]),
    []
  );
  const deliveredLoads = useMemo(
    () => loads.filter((l) => l.status === "delivered"),
    [loads]
  );
  const paidLoads = useMemo(
    () => deliveredLoads.filter((l) => l.payment_status === "paid"),
    [deliveredLoads]
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

  const fleetStatus = useMemo(() => {
    const activeByTruck = new Set(
      loads.filter((l) => l.truck_id && !["delivered", "cancelled"].includes(l.status)).map((l) => l.truck_id as string)
    );
    const activeByTrailer = new Set(
      loads.filter((l) => l.trailer_id && !["delivered", "cancelled"].includes(l.status)).map((l) => l.trailer_id as string)
    );

    const totalTrucks = trucks.length;
    const trucksInService = trucks.filter((t) => t.maintenance_status === "in_service").length;
    const trucksInUse = trucks.filter((t) => activeByTruck.has(t.id)).length;
    const availableTrucks = trucks.filter(
      (t) => t.maintenance_status !== "in_service" && !activeByTruck.has(t.id)
    ).length;

    const totalTrailers = trailers.length;
    const trailersInService = trailers.filter((t) => t.maintenance_status === "in_service").length;
    const trailersInUse = trailers.filter((t) => activeByTrailer.has(t.id)).length;
    const availableTrailers = trailers.filter(
      (t) => t.maintenance_status !== "in_service" && !activeByTrailer.has(t.id)
    ).length;

    return {
      total_trucks: totalTrucks,
      available_trucks: availableTrucks,
      in_use_trucks: trucksInUse,
      in_service_trucks: trucksInService,
      total_trailers: totalTrailers,
      available_trailers: availableTrailers,
      in_use_trailers: trailersInUse,
      in_service_trailers: trailersInService,
    };
  }, [loads, trucks, trailers]);

  const topRoutes = useMemo(() => {
    const paidById = new Map(paidLoads.map((l) => [l.id, l]));
    const grouped: Record<string, { route: string; load_count: number; total_revenue: number }> = {};

    const stopsByLoad = stops.reduce<Record<string, Stop[]>>((acc, stop) => {
      if (!acc[stop.load_id]) acc[stop.load_id] = [];
      acc[stop.load_id].push(stop);
      return acc;
    }, {});

    for (const [loadId, load] of paidById.entries()) {
      const routeStops = (stopsByLoad[loadId] || []).slice().sort((a, b) => a.stop_order - b.stop_order);
      const firstPickup = routeStops.find((s) => s.type === "pickup");
      const lastDelivery = [...routeStops].reverse().find((s) => s.type === "delivery");
      const route = firstPickup?.state && lastDelivery?.state ? `${firstPickup.state} - ${lastDelivery.state}` : null;
      if (!route) continue;

      if (!grouped[route]) {
        grouped[route] = { route, load_count: 0, total_revenue: 0 };
      }
      grouped[route].load_count += 1;
      grouped[route].total_revenue += load.rate || 0;
    }

    return Object.values(grouped)
      .sort((a, b) => b.load_count - a.load_count)
      .slice(0, 3);
  }, [paidLoads, stops]);

  const totalRevenue = useMemo(
    () => paidLoads.reduce((sum, l) => sum + (l.rate || 0), 0),
    [paidLoads]
  );
  const avgRate = useMemo(
    () => (paidLoads.length > 0 ? totalRevenue / paidLoads.length : 0),
    [paidLoads, totalRevenue]
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

  const inUseLoadCount = useMemo(
    () => loads.filter((l) => inUseStatuses.has(l.status)).length,
    [loads, inUseStatuses]
  );

  const handleExportPdf = async () => {
    if (!exportRef.current) return;
    const el = exportRef.current;
    el.classList.add("bg-white", "text-black");
    el.classList.remove("bg-background");
    const canvas = await html2canvas(el, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
    });
    el.classList.remove("bg-white", "text-black");
    el.classList.add("bg-background");
    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF("p", "mm", "a4");
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const imgWidth = pageWidth;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    let heightLeft = imgHeight;
    let position = 0;

    pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;

    while (heightLeft > 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
    }

    const date = new Date().toISOString().slice(0, 10);
    pdf.save(`nfg-reports-${date}.pdf`);
  };

  const revenueData = useMemo(() => {
    const periodMap: Record<string, { revenue: number; sortKey: number }> = {};

    paidLoads.forEach((l) => {
      if (!l.completed_at) return;
      const completed = new Date(l.completed_at);
      let key: string;
      let sortKey: number;

      switch (revenuePeriod) {
        case "day":
          key = completed.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
          sortKey = completed.getTime();
          break;
        case "week": {
          const year = completed.getFullYear();
          const weekNum = Math.ceil((completed.getTime() - new Date(year, 0, 1).getTime()) / (7 * 24 * 60 * 60 * 1000));
          key = `${year}-W${weekNum.toString().padStart(2, "0")}`;
          sortKey = year * 100 + weekNum;
          break;
        }
        case "month":
          key = completed.toLocaleDateString("en-US", { month: "short", year: "numeric" });
          sortKey = completed.getFullYear() * 100 + (completed.getMonth() + 1);
          break;
        case "year":
          key = completed.getFullYear().toString();
          sortKey = completed.getFullYear();
          break;
        default:
          key = completed.toLocaleDateString("en-US", { month: "short", year: "numeric" });
          sortKey = completed.getFullYear() * 100 + (completed.getMonth() + 1);
      }

      if (!periodMap[key]) {
        periodMap[key] = { revenue: 0, sortKey };
      }
      periodMap[key].revenue += l.rate || 0;
    });

    return Object.entries(periodMap)
      .map(([period, data]) => ({ period, revenue: data.revenue, sortKey: data.sortKey }))
      .sort((a, b) => a.sortKey - b.sortKey)
      .slice(-12);
  }, [paidLoads, revenuePeriod]);

  const topDrivers = useMemo(() => {
    const map: Record<
      string,
      { driverId: string; revenue: number; loadCount: number }
    > = {};
    paidLoads.forEach((l) => {
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
          paidCount: entry.loadCount,
          revenue: entry.revenue,
          avgPerLoad:
            entry.loadCount > 0
              ? entry.revenue / entry.loadCount
              : 0,
        };
      });
  }, [paidLoads, drivers]);

  // ── Loading ─────────────────────────────────────────────────────────
  if (userLoading || (!user && !userLoading) || loading) {
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
      <div className="flex justify-end">
        <button
          onClick={handleExportPdf}
          className="inline-flex items-center rounded-md border border-border bg-card text-card-foreground px-3 py-2 text-sm font-medium hover:bg-accent"
          type="button"
        >
          <Download className="mr-2 h-4 w-4" />
          Export Reports
        </button>
      </div>

      <div ref={exportRef} className="space-y-6 bg-background p-2">
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
              {paidLoads.length} paid · {deliveredLoads.length} delivered
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
              per paid load
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
          <TabsTrigger value="routes">Top Routes</TabsTrigger>
          <TabsTrigger value="fleet">Fleet Status</TabsTrigger>
          <TabsTrigger value="status">Status Breakdown</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
        </TabsList>

        {/* ── Revenue chart ──────────────────────────────────────────── */}
        <TabsContent value="revenue">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <DollarSign className="h-5 w-5 text-emerald-500" />
                    Revenue
                  </CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">
                    Only loads marked as Paid are included
                  </p>
                </div>
                <Select value={revenuePeriod} onValueChange={(v) => setRevenuePeriod(v as any)}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="day">Day</SelectItem>
                    <SelectItem value="week">Week</SelectItem>
                    <SelectItem value="month">Month</SelectItem>
                    <SelectItem value="year">Year</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              {revenueData.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-8">
                  No revenue data yet
                </p>
              ) : (
                <div className="h-[350px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={revenueData}>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="hsl(var(--border))"
                      />
                      <XAxis
                        dataKey="period"
                        className="text-xs"
                        tick={{ fill: "hsl(var(--muted-foreground))" }}
                      />
                      <YAxis
                        tickFormatter={(v) =>
                          `$${(v / 1000).toFixed(0)}k`
                        }
                        className="text-xs"
                        tick={{ fill: "hsl(var(--muted-foreground))" }}
                      />
                      <Tooltip
                        formatter={(value: number) => [
                          `$${value.toLocaleString()}`,
                          "Revenue",
                        ]}
                        contentStyle={{
                          backgroundColor: "hsl(var(--card))",
                          borderColor: "hsl(var(--border))",
                          color: "hsl(var(--card-foreground))",
                          borderRadius: "0.5rem",
                        }}
                        labelStyle={{ color: "hsl(var(--card-foreground))" }}
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
                Ranked by total revenue from paid loads only
              </p>
            </CardHeader>
            <CardContent className="p-0">
              {topDrivers.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <Users2 className="h-10 w-10 mb-2 opacity-40" />
                  <p className="text-sm">
                    No paid loads with assigned drivers yet
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
                              {d.paidCount} loads
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
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "hsl(var(--card))",
                          borderColor: "hsl(var(--border))",
                          color: "hsl(var(--card-foreground))",
                          borderRadius: "0.5rem",
                        }}
                      />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Top Routes ────────────────────────────────────────────── */}
        <TabsContent value="routes">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-blue-500" />
                Top Interstate Routes
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Top 3 routes by load count (TN - PA format)
              </p>
            </CardHeader>
            <CardContent>
              {topRoutes.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-8">
                  No route data available yet
                </p>
              ) : (
                <div className="space-y-4">
                  {topRoutes.map((route, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-4 border rounded-lg"
                    >
                      <div className="flex items-center gap-4">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary font-bold">
                          {idx + 1}
                        </div>
                        <div>
                          <p className="font-semibold">{route.route || "—"}</p>
                          <p className="text-sm text-muted-foreground">
                            {route.load_count || 0} loads
                          </p>
                        </div>
                      </div>
                      {route.total_revenue && (
                        <div className="text-right">
                          <p className="text-sm text-muted-foreground">Revenue</p>
                          <p className="font-semibold">
                            ${(route.total_revenue || 0).toLocaleString()}
                          </p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Fleet Status ────────────────────────────────────────────── */}
        <TabsContent value="fleet">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5 text-purple-500" />
                Fleet Status
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Current fleet utilization and availability
              </p>
            </CardHeader>
            <CardContent>
              {!fleetStatus ? (
                <p className="text-center text-sm text-muted-foreground py-8">
                  No fleet data available yet
                </p>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="p-4 border rounded-lg">
                    <p className="text-sm text-muted-foreground">Total Trucks</p>
                    <p className="text-2xl font-bold">{fleetStatus.total_trucks || 0}</p>
                  </div>
                  <div className="p-4 border rounded-lg">
                    <p className="text-sm text-muted-foreground">Available Trucks</p>
                    <p className="text-2xl font-bold text-green-600">
                      {fleetStatus.available_trucks || 0}
                    </p>
                  </div>
                  <div className="p-4 border rounded-lg">
                    <p className="text-sm text-muted-foreground">In-Use Trucks</p>
                    <p className="text-2xl font-bold text-blue-600">{fleetStatus.in_use_trucks || 0}</p>
                  </div>
                  <div className="p-4 border rounded-lg">
                    <p className="text-sm text-muted-foreground">In-Service Trucks</p>
                    <p className="text-2xl font-bold text-amber-600">{fleetStatus.in_service_trucks || 0}</p>
                  </div>
                  <div className="p-4 border rounded-lg">
                    <p className="text-sm text-muted-foreground">Total Trailers</p>
                    <p className="text-2xl font-bold">{fleetStatus.total_trailers || 0}</p>
                  </div>
                  <div className="p-4 border rounded-lg">
                    <p className="text-sm text-muted-foreground">Available Trailers</p>
                    <p className="text-2xl font-bold text-green-600">
                      {fleetStatus.available_trailers || 0}
                    </p>
                  </div>
                  <div className="p-4 border rounded-lg">
                    <p className="text-sm text-muted-foreground">In-Use Trailers</p>
                    <p className="text-2xl font-bold text-blue-600">{fleetStatus.in_use_trailers || 0}</p>
                  </div>
                  <div className="p-4 border rounded-lg">
                    <p className="text-sm text-muted-foreground">In-Service Trailers</p>
                    <p className="text-2xl font-bold text-amber-600">{fleetStatus.in_service_trailers || 0}</p>
                  </div>
                  <div className="p-4 border rounded-lg sm:col-span-2 lg:col-span-4">
                    <p className="text-sm text-muted-foreground">Active Loads Using Fleet</p>
                    <p className="text-2xl font-bold">{inUseLoadCount}</p>
                  </div>
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
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "hsl(var(--card))",
                          borderColor: "hsl(var(--border))",
                          color: "hsl(var(--card-foreground))",
                          borderRadius: "0.5rem",
                        }}
                      />
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
    </div>
  );
}
