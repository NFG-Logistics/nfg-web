"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/hooks/use-user";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Package,
  DollarSign,
  Users2,
  Activity,
  AlertCircle,
  Receipt,
  FileText,
  Loader2,
} from "lucide-react";

export default function DashboardPage() {
  const supabase = useMemo(() => createClient(), []);
  const { user } = useUser();

  const [availableDrivers, setAvailableDrivers] = useState(0);
  const [activeLoadCount, setActiveLoadCount] = useState(0);
  const [receiptsToday, setReceiptsToday] = useState(0);
  const [monthlyRevenue, setMonthlyRevenue] = useState(0);
  const [dbError, setDbError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchKPIs() {
      try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayISO = today.toISOString();
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowISO = tomorrow.toISOString();
        const currentMonth = new Date().getMonth() + 1;
        const currentYear = new Date().getFullYear();

        const [loadsRes, driversRes, receiptsRes, revenueRes] =
          await Promise.all([
            supabase
              .from("loads")
              .select("id", { count: "exact", head: true })
              .not("status", "in", '("delivered","cancelled")'),
            supabase
              .from("users")
              .select("id, availability_status")
              .eq("role", "driver")
              .eq("is_active", true),
            supabase
              .from("receipts")
              .select("id", { count: "exact", head: true })
              .gte("created_at", todayISO)
              .lt("created_at", tomorrowISO)
              .in("receipt_type", ["fuel", "road_service"]),
            supabase
              .from("loads")
              .select("rate, completed_at, payment_status")
              .eq("status", "delivered"),
          ]);

        const firstError =
          loadsRes.error ||
          driversRes.error ||
          receiptsRes.error ||
          revenueRes.error;
        if (firstError) {
          setDbError(firstError.message);
          console.error("Dashboard KPI error:", firstError);
        }

        setActiveLoadCount(loadsRes.count || 0);

        const totalDrivers = driversRes.data?.length || 0;
        const unavailable =
          driversRes.data?.filter(
            (d) => d.availability_status !== "available"
          ).length || 0;
        setAvailableDrivers(totalDrivers - unavailable);

        setReceiptsToday(receiptsRes.count || 0);

        const delivered = revenueRes.data || [];
        setMonthlyRevenue(
          delivered
            .filter((l) => {
              if (!l.completed_at || l.payment_status !== "paid") return false;
              const completed = new Date(l.completed_at);
              return (
                completed.getMonth() + 1 === currentMonth &&
                completed.getFullYear() === currentYear
              );
            })
            .reduce((sum, l) => sum + (l.rate || 0), 0)
        );
      } catch (err) {
        setDbError((err as Error).message);
        console.error("Dashboard exception:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchKPIs();
  }, [supabase]);

  const userName = user?.full_name?.split(" ")[0] ?? "there";

  const kpis = [
    {
      title: "Available Drivers",
      value: availableDrivers,
      icon: Users2,
      color: "text-primary",
    },
    {
      title: "Active Loads",
      value: activeLoadCount,
      icon: Package,
      color: "text-primary",
    },
    {
      title: "Receipts Today",
      value: receiptsToday,
      icon: Receipt,
      color: "text-primary",
    },
    {
      title: "Monthly Revenue",
      value: `$${monthlyRevenue.toLocaleString()}`,
      icon: DollarSign,
      color: "text-primary",
    },
  ];

  const quickActions = [
    {
      title: "Manage Drivers",
      href: "/drivers",
      icon: Users2,
      description: "View, add, or dispatch drivers",
    },
    {
      title: "View Receipts",
      href: "/receipts",
      icon: FileText,
      description: "Review submitted receipts",
    },
    {
      title: "Status Updates",
      href: "/status-updates",
      icon: Activity,
      description: "Monitor driver statuses",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Welcome back, {userName}!
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Here&apos;s what&apos;s happening with your logistics operations
          today.
        </p>
      </div>

      {dbError && (
        <Card className="border-destructive bg-destructive/5">
          <CardContent className="flex items-start gap-3 p-4">
            <AlertCircle className="h-5 w-5 text-destructive mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-destructive">
                Database Error
              </p>
              <p className="text-sm text-muted-foreground mt-1">{dbError}</p>
              <p className="text-xs text-muted-foreground mt-2">
                If this says &quot;querying schema&quot;, run this in the
                Supabase SQL Editor:{" "}
                <code className="bg-muted px-1 py-0.5 rounded">
                  NOTIFY pgrst, &apos;reload schema&apos;;
                </code>
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <Card key={kpi.title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {kpi.title}
              </CardTitle>
              <kpi.icon className={`h-5 w-5 ${kpi.color}`} />
            </CardHeader>
            <CardContent>
              {loading ? (
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              ) : (
                <div className="text-2xl font-bold">{kpi.value}</div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quick Actions */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Quick Actions</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {quickActions.map((action) => (
            <Link key={action.href} href={action.href}>
              <Card className="h-full min-h-0 transition-colors hover:bg-accent/50">
                <CardHeader className="flex flex-row items-center gap-3 space-y-0 py-3 px-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <action.icon className="h-5 w-5 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <CardTitle className="text-base">{action.title}</CardTitle>
                    <p className="text-sm text-muted-foreground mt-1">
                      {action.description}
                    </p>
                  </div>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
