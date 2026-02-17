"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/hooks/use-user";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { STATUS_CONFIG } from "@/lib/constants";
import { ReviewModal } from "@/components/review-modal";
import type {
  Load,
  LoadStatus,
  LoadWithDetails,
  Stop,
  User,
  Receipt,
  StatusUpdate,
} from "@/types";
import {
  Activity,
  Clock,
  Eye,
  RefreshCw,
  Truck,
  MapPin,
  Package,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";

// ---------------------------------------------------------------------------
// Active (non-terminal) statuses for the main table
// ---------------------------------------------------------------------------
const ACTIVE_STATUSES: LoadStatus[] = [
  "dispatched",
  "on_site_shipper",
  "loaded",
  "on_site_receiver",
  "empty",
];

// ---------------------------------------------------------------------------
// Row type coming back from the query (load + nested relations)
// ---------------------------------------------------------------------------
interface LoadRow extends Load {
  driver: User | null;
  dispatcher: User | null;
  stops: Stop[];
  receipts: Receipt[];
  status_updates: StatusUpdate[];
}

// ---------------------------------------------------------------------------
// Helper: first pickup & first delivery locations
// ---------------------------------------------------------------------------
function firstStop(stops: Stop[] | undefined, type: "pickup" | "delivery") {
  if (!stops) return null;
  return [...stops]
    .filter((s) => s.type === type)
    .sort((a, b) => a.stop_order - b.stop_order)[0];
}

function formatLocation(stop: Stop | null | undefined) {
  if (!stop) return "—";
  return `${stop.city}, ${stop.state}`;
}

function formatDate(dateStr: string | undefined | null) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function relativeTime(dateStr: string | undefined | null) {
  if (!dateStr) return "—";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ============================================================================
// PAGE
// ============================================================================
export default function StatusUpdatesPage() {
  const supabase = useMemo(() => createClient(), []);
  const { user } = useUser();

  const [loads, setLoads] = useState<LoadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const [reviewLoad, setReviewLoad] = useState<LoadRow | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const isAdmin = user?.role === "admin";

  // ── Fetch active loads ──────────────────────────────────────────────
  const fetchLoads = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("loads")
        .select(
          `
          *,
          driver:users!loads_driver_id_fkey(*),
          dispatcher:users!loads_dispatcher_id_fkey(*),
          stops(*),
          receipts(*),
          status_updates(*)
        `
        )
        .in("status", ACTIVE_STATUSES)
        .order("updated_at", { ascending: false });

      if (error) {
        console.error("Failed to fetch loads:", error);
        toast.error("Failed to load status updates: " + error.message);
        // Fallback: simple query
        const { data: simple } = await supabase
          .from("loads")
          .select("*")
          .in("status", ACTIVE_STATUSES)
          .order("updated_at", { ascending: false });
        setLoads(
          ((simple as unknown as LoadRow[]) ?? []).map((l) => ({
            ...l,
            driver: null,
            dispatcher: null,
            stops: [],
            receipts: [],
            status_updates: [],
          }))
        );
      } else {
        setLoads((data as LoadRow[]) ?? []);
      }
    } catch (err) {
      console.error("Status updates fetch exception:", err);
      toast.error("Connection error loading status updates");
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    fetchLoads();
  }, [fetchLoads, refreshKey]);

  // ── Real-time subscription ──────────────────────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel("loads-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "loads" },
        () => {
          // Refetch everything on any load change
          setRefreshKey((k) => k + 1);
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "status_updates" },
        () => {
          setRefreshKey((k) => k + 1);
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "receipts" },
        () => {
          setRefreshKey((k) => k + 1);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  // ── Filtered loads ──────────────────────────────────────────────────
  const filteredLoads = useMemo(() => {
    if (filter === "all") return loads;
    return loads.filter((l) => l.status === filter);
  }, [loads, filter]);

  // ── Counts by status for summary cards ──────────────────────────────
  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    ACTIVE_STATUSES.forEach((s) => (map[s] = 0));
    loads.forEach((l) => {
      map[l.status] = (map[l.status] || 0) + 1;
    });
    return map;
  }, [loads]);

  // ── Empty loads pending review (admin only) ─────────────────────────
  const emptyLoads = useMemo(
    () => loads.filter((l) => l.status === "empty"),
    [loads]
  );

  // ── Callback after review action completes ──────────────────────────
  const handleReviewDone = useCallback(() => {
    setReviewLoad(null);
    setRefreshKey((k) => k + 1);
  }, []);

  // ── Loading skeleton ────────────────────────────────────────────────
  if (loading && loads.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader title="Status Updates" description="Live load progression monitoring" />
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-96 rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <PageHeader title="Status Updates" description="Monitor live load progression and review completed loads">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setRefreshKey((k) => k + 1)}
          className="gap-2"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </PageHeader>

      {/* ── Summary cards ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {ACTIVE_STATUSES.map((status) => {
          const config = STATUS_CONFIG[status];
          return (
            <Card
              key={status}
              className={`cursor-pointer transition-shadow hover:shadow-md ${
                filter === status ? "ring-2 ring-primary" : ""
              }`}
              onClick={() => setFilter(filter === status ? "all" : status)}
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <Badge variant={config.variant} className="text-xs">
                    {config.label}
                  </Badge>
                  <span className="text-2xl font-bold">{counts[status] ?? 0}</span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* ── Admin: Empty loads pending review ───────────────────────────── */}
      {isAdmin && emptyLoads.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/20">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base font-semibold text-amber-800 dark:text-amber-200">
              <AlertCircle className="h-5 w-5" />
              Loads Pending Review ({emptyLoads.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {emptyLoads.map((load) => {
                const pickup = firstStop(load.stops, "pickup");
                const delivery = firstStop(load.stops, "delivery");
                const hasPod = load.receipts && load.receipts.length > 0;
                return (
                  <div
                    key={load.id}
                    className="flex items-center justify-between rounded-lg border bg-white p-3 dark:bg-card"
                  >
                    <div className="flex items-center gap-4">
                      <div>
                        <p className="font-semibold text-sm">{load.reference_number}</p>
                        <p className="text-xs text-muted-foreground">
                          {load.driver?.full_name ?? "Unassigned"}
                        </p>
                      </div>
                      <div className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground">
                        <MapPin className="h-3 w-3" />
                        {formatLocation(pickup)} → {formatLocation(delivery)}
                      </div>
                      <Badge variant={hasPod ? "success" : "warning"} className="text-xs">
                        {hasPod ? "POD Uploaded" : "No POD"}
                      </Badge>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => setReviewLoad(load)}
                      className="gap-1.5"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      Review
                    </Button>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Filter + Active loads table ─────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <Activity className="h-5 w-5 text-primary" />
              Active Loads
              <span className="text-muted-foreground font-normal text-sm">
                ({filteredLoads.length})
              </span>
            </CardTitle>

            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Active</SelectItem>
                {ACTIVE_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {STATUS_CONFIG[s].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {filteredLoads.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Package className="h-12 w-12 mb-3 opacity-40" />
              <p className="text-sm">No active loads{filter !== "all" ? ` with status "${STATUS_CONFIG[filter as LoadStatus]?.label}"` : ""}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead className="font-semibold">Load #</TableHead>
                    <TableHead className="font-semibold">Driver</TableHead>
                    <TableHead className="font-semibold">Status</TableHead>
                    <TableHead className="font-semibold hidden md:table-cell">Pickup</TableHead>
                    <TableHead className="font-semibold hidden md:table-cell">Delivery</TableHead>
                    <TableHead className="font-semibold hidden lg:table-cell">Sched. Delivery</TableHead>
                    <TableHead className="font-semibold">Last Update</TableHead>
                    {isAdmin && <TableHead className="font-semibold text-right">Action</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLoads.map((load) => {
                    const pickup = firstStop(load.stops, "pickup");
                    const delivery = firstStop(load.stops, "delivery");
                    const config = STATUS_CONFIG[load.status];
                    const isEmpty = load.status === "empty";

                    return (
                      <TableRow
                        key={load.id}
                        className={isEmpty && isAdmin ? "bg-amber-50/40 dark:bg-amber-950/10" : ""}
                      >
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <Truck className="h-4 w-4 text-muted-foreground" />
                            {load.reference_number}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium text-sm">
                              {load.driver?.full_name ?? "Unassigned"}
                            </p>
                            {load.driver?.phone && (
                              <p className="text-xs text-muted-foreground">{load.driver.phone}</p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={config.variant}>{config.label}</Badge>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <div className="flex items-center gap-1.5 text-sm">
                            <MapPin className="h-3.5 w-3.5 text-emerald-500" />
                            {formatLocation(pickup)}
                          </div>
                          {pickup?.facility_name && (
                            <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-[180px]">
                              {pickup.facility_name}
                            </p>
                          )}
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <div className="flex items-center gap-1.5 text-sm">
                            <MapPin className="h-3.5 w-3.5 text-red-500" />
                            {formatLocation(delivery)}
                          </div>
                          {delivery?.facility_name && (
                            <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-[180px]">
                              {delivery.facility_name}
                            </p>
                          )}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell text-sm">
                          {delivery?.appointment_date
                            ? formatDate(delivery.appointment_date)
                            : "—"}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5 text-sm">
                            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                            {relativeTime(load.updated_at)}
                          </div>
                        </TableCell>
                        {isAdmin && (
                          <TableCell className="text-right">
                            {isEmpty ? (
                              <Button
                                size="sm"
                                variant="outline"
                                className="gap-1.5 border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-950"
                                onClick={() => setReviewLoad(load)}
                              >
                                <Eye className="h-3.5 w-3.5" />
                                Review
                              </Button>
                            ) : null}
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Review Modal ───────────────────────────────────────────────── */}
      {reviewLoad && (
        <ReviewModal
          load={reviewLoad}
          open={!!reviewLoad}
          onClose={() => setReviewLoad(null)}
          onDone={handleReviewDone}
        />
      )}
    </div>
  );
}
