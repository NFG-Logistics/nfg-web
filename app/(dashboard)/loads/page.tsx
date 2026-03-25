"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/hooks/use-user";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { STATUS_CONFIG, PAYMENT_CONFIG } from "@/lib/constants";
import {
  Plus,
  Search,
  Loader2,
  Eye,
  XCircle,
  Package,
  Truck,
  MapPin,
  Clock,
  CheckCircle2,
  FileText,
  User as UserIcon,
  ArrowRight,
  ShieldCheck,
  MessageSquare,
  AlertTriangle,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import type {
  Load,
  LoadStatus,
  Stop,
  Receipt,
  StatusUpdate,
} from "@/types";

// ---------------------------------------------------------------------------
// Active statuses (everything except delivered/cancelled)
// ---------------------------------------------------------------------------
const ACTIVE_STATUSES: LoadStatus[] = [
  "dispatched",
  "on_site_shipper",
  "loaded",
  "on_site_receiver",
  "empty",
];

// ---------------------------------------------------------------------------
// Row type from the query
// ---------------------------------------------------------------------------
interface LoadRow extends Load {
  driver: { full_name: string; phone?: string } | null;
  dispatcher: { full_name: string } | null;
  stops: Stop[];
  receipts: Receipt[];
  status_updates: StatusUpdate[];
  reviewer: { full_name: string } | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function shortDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function getPickupStop(stops: Stop[]) {
  const sorted = [...stops].sort((a, b) => (a.stop_order ?? 0) - (b.stop_order ?? 0));
  return sorted.find((s) => s.type === "pickup") ?? null;
}

function getDeliveryStop(stops: Stop[]) {
  const sorted = [...stops].sort((a, b) => (b.stop_order ?? 0) - (a.stop_order ?? 0));
  return sorted.find((s) => s.type === "delivery") ?? null;
}

function fmtCityState(stop: Stop | null) {
  if (!stop) return "—";
  return [stop.city, stop.state].filter(Boolean).join(", ");
}

function fmtStopDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

const STATUS_DOT_COLORS: Record<string, string> = {
  dispatched: "bg-blue-500",
  on_site_shipper: "bg-amber-500",
  loaded: "bg-indigo-500",
  on_site_receiver: "bg-amber-500",
  empty: "bg-slate-500",
  delivered: "bg-emerald-500",
  cancelled: "bg-red-500",
};

// ============================================================================
// PAGE
// ============================================================================
export default function LoadsPage() {
  const supabase = useMemo(() => createClient(), []);
  const { user } = useUser();

  const [loads, setLoads] = useState<LoadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<string>("all");
  const [tab, setTab] = useState("active");
  const [detailLoad, setDetailLoad] = useState<LoadRow | null>(null);
  const [cancelLoad, setCancelLoad] = useState<LoadRow | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // ── Fetch all loads ─────────────────────────────────────────────────
  const fetchLoads = useCallback(async () => {
    try {
      // Try with reviewer FK join first
      const { data, error } = await supabase
        .from("loads")
        .select(
          `
          *,
          driver:users!loads_driver_id_fkey(full_name, phone),
          dispatcher:users!loads_dispatcher_id_fkey(full_name),
          reviewer:users!loads_reviewed_by_fkey(full_name),
          stops(*),
          receipts(*),
          status_updates(*)
        `
        )
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Loads fetch (with reviewer) error:", error);
        // Fallback: try without reviewer join
        const { data: fallback, error: fallbackErr } = await supabase
          .from("loads")
          .select(
            `
            *,
            driver:users!loads_driver_id_fkey(full_name, phone),
            dispatcher:users!loads_dispatcher_id_fkey(full_name),
            stops(*),
            receipts(*),
            status_updates(*)
          `
          )
          .order("created_at", { ascending: false });

        if (fallbackErr) {
          console.error("Loads fetch (fallback) error:", fallbackErr);
          // Final fallback: simplest query
          const { data: simple } = await supabase
            .from("loads")
            .select("*")
            .order("created_at", { ascending: false });
          setLoads(
            ((simple as unknown as LoadRow[]) ?? []).map((l) => ({
              ...l,
              driver: null,
              dispatcher: null,
              reviewer: null,
              stops: [],
              receipts: [],
              status_updates: [],
            }))
          );
        } else {
          setLoads(
            ((fallback as unknown as LoadRow[]) ?? []).map((l) => ({
              ...l,
              reviewer: null,
            }))
          );
        }
      } else {
        setLoads((data as unknown as LoadRow[]) ?? []);
      }
    } catch (err) {
      console.error("Loads fetch exception:", err);
      toast.error("Failed to load data");
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    fetchLoads();
  }, [fetchLoads]);

  // ── Real-time subscription ──────────────────────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel("loads-tab-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "loads" },
        () => fetchLoads()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "status_updates" },
        () => fetchLoads()
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "receipts" },
        () => fetchLoads()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, fetchLoads]);

  // ── Tab-filtered loads ──────────────────────────────────────────────
  const activeLoads = useMemo(
    () => loads.filter((l) => ACTIVE_STATUSES.includes(l.status as LoadStatus)),
    [loads]
  );
  const completedLoads = useMemo(
    () => loads.filter((l) => l.status === "delivered"),
    [loads]
  );
  const cancelledLoads = useMemo(
    () => loads.filter((l) => l.status === "cancelled"),
    [loads]
  );

  // Current tab's loads
  const tabLoads = useMemo(() => {
    if (tab === "active") {
      if (activeFilter === "all") return activeLoads;
      return activeLoads.filter((l) => l.status === activeFilter);
    }
    if (tab === "completed") return completedLoads;
    return cancelledLoads;
  }, [tab, activeFilter, activeLoads, completedLoads, cancelledLoads]);

  // Search filter
  const filtered = useMemo(
    () =>
      tabLoads.filter(
        (l) =>
          l.reference_number.toLowerCase().includes(search.toLowerCase()) ||
          l.driver?.full_name?.toLowerCase().includes(search.toLowerCase())
      ),
    [tabLoads, search]
  );

  // ── CSV Export handler (Driver Schedule format) ─────────────────────
  const handleExportCSV = async () => {
    try {
      // Fetch all loads with stops and driver info
      const { data: allLoads, error } = await supabase
        .from("loads")
        .select(
          `
          *,
          driver:users!loads_driver_id_fkey(full_name),
          stops(type, city, state, appointment_date, stop_order)
        `
        )
        .order("created_at", { ascending: false });

      if (error) {
        toast.error(`Failed to fetch loads: ${error.message}`);
        return;
      }

      // Helper to format date for CSV
      const fmtDate = (d: string | null | undefined) => {
        if (!d) return "";
        return new Date(d).toLocaleDateString("en-US", {
          month: "2-digit",
          day: "2-digit",
          year: "numeric",
        });
      };

      // Process data for CSV — exact column order:
      // Status | Pickup Date | Delivery Date | Company Name | Load Number |
      // Pickup City, State | Delivery City, State | Driver | Note
      const csvRows = allLoads.map((load: any) => {
        const stops = [...(load.stops || [])].sort(
          (a: any, b: any) => (a.stop_order ?? 0) - (b.stop_order ?? 0)
        );
        const pickupStop = stops.find((s: any) => s.type === "pickup");
        const deliveryStop = [...stops].reverse().find((s: any) => s.type === "delivery");

        const pickupCityState = pickupStop
          ? [pickupStop.city, pickupStop.state].filter(Boolean).join(", ")
          : "";
        const deliveryCityState = deliveryStop
          ? [deliveryStop.city, deliveryStop.state].filter(Boolean).join(", ")
          : "";

        return {
          Status: load.status || "",
          "Pickup Date": fmtDate(pickupStop?.appointment_date),
          "Delivery Date": fmtDate(deliveryStop?.appointment_date),
          "Company Name": load.client_name || "",
          "Load Number": load.reference_number || "",
          "Pickup City, State": pickupCityState,
          "Delivery City, State": deliveryCityState,
          Driver: load.driver?.full_name || "",
          Note: load.special_instructions || "",
        };
      });

      // Fixed column order
      const headers = [
        "Status",
        "Pickup Date",
        "Delivery Date",
        "Company Name",
        "Load Number",
        "Pickup City, State",
        "Delivery City, State",
        "Driver",
        "Note",
      ];

      // Escape CSV values
      const escapeCSV = (value: any) => {
        const str = String(value ?? "");
        if (str.includes(",") || str.includes('"') || str.includes("\n")) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };

      const csvContent = [
        headers.join(","),
        ...csvRows.map((row: any) =>
          headers.map((header) => escapeCSV(row[header])).join(",")
        ),
      ].join("\n");

      // Download
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);
      link.setAttribute("href", url);
      link.setAttribute(
        "download",
        `driver-schedule-${new Date().toISOString().split("T")[0]}.csv`
      );
      link.style.visibility = "hidden";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast.success("Driver schedule exported successfully");
    } catch (err) {
      toast.error(`Export failed: ${(err as Error).message}`);
    }
  };

  // ── Cancel load handler ─────────────────────────────────────────────
  const handleCancel = async () => {
    if (!cancelLoad || !cancelReason.trim()) return;
    setSubmitting(true);
    const { error } = await supabase
      .from("loads")
      .update({ status: "cancelled", cancel_reason: cancelReason.trim() })
      .eq("id", cancelLoad.id);

    if (error) toast.error(error.message);
    else toast.success("Load cancelled");
    setCancelLoad(null);
    setCancelReason("");
    setSubmitting(false);
    fetchLoads();
  };

  // ── Open detail and re-fetch latest data for that load ──────────────
  const openDetail = useCallback(
    async (load: LoadRow) => {
      setDetailLoad(load);
      // Re-fetch to ensure we have latest review info
      const { data } = await supabase
        .from("loads")
        .select(
          `
          *,
          driver:users!loads_driver_id_fkey(full_name, phone),
          dispatcher:users!loads_dispatcher_id_fkey(full_name),
          stops(*),
          receipts(*),
          status_updates(*)
        `
        )
        .eq("id", load.id)
        .single();
      if (data) {
        // Try to get reviewer name
        let reviewer: { full_name: string } | null = null;
        if ((data as any).reviewed_by) {
          const { data: rev } = await supabase
            .from("users")
            .select("full_name")
            .eq("id", (data as any).reviewed_by)
            .single();
          reviewer = rev;
        }
        setDetailLoad({ ...(data as unknown as LoadRow), reviewer });
      }
    },
    [supabase]
  );

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <PageHeader title="Loads" description="Manage all loads and shipments">
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleExportCSV}>
            <FileText className="mr-2 h-4 w-4" /> Export Schedule
          </Button>
          <Button asChild>
            <Link href="/loads/dispatch">
              <Plus className="mr-2 h-4 w-4" /> Dispatch Driver
            </Link>
          </Button>
        </div>
      </PageHeader>

      {/* ── Tabs: Active / Completed / Cancelled ───────────────────────── */}
      <Tabs value={tab} onValueChange={setTab}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <TabsList>
            <TabsTrigger value="active" className="gap-1.5">
              <Package className="h-4 w-4" />
              Active
              <Badge variant="secondary" className="ml-1 text-xs px-1.5 py-0">
                {activeLoads.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="completed" className="gap-1.5">
              <CheckCircle2 className="h-4 w-4" />
              Completed
              <Badge variant="secondary" className="ml-1 text-xs px-1.5 py-0">
                {completedLoads.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="cancelled" className="gap-1.5">
              <XCircle className="h-4 w-4" />
              Cancelled
              <Badge variant="secondary" className="ml-1 text-xs px-1.5 py-0">
                {cancelledLoads.length}
              </Badge>
            </TabsTrigger>
          </TabsList>

          {/* Search + filter (active-specific filter only shown on active tab) */}
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search loads..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 w-[220px]"
              />
            </div>
            {tab === "active" && (
              <Select value={activeFilter} onValueChange={setActiveFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="All Active" />
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
            )}
          </div>
        </div>

        {/* ── Active Tab ─────────────────────────────────────────────── */}
        <TabsContent value="active">
          <LoadsTable
            loads={filtered}
            loading={loading}
            tab="active"
            onView={openDetail}
            onCancel={setCancelLoad}
            onUpdate={fetchLoads}
          />
        </TabsContent>

        {/* ── Completed Tab ──────────────────────────────────────────── */}
        <TabsContent value="completed">
          <LoadsTable
            loads={filtered}
            loading={loading}
            tab="completed"
            onView={openDetail}
            onUpdate={fetchLoads}
          />
        </TabsContent>

        {/* ── Cancelled Tab ──────────────────────────────────────────── */}
        <TabsContent value="cancelled">
          <LoadsTable
            loads={filtered}
            loading={loading}
            tab="cancelled"
            onView={openDetail}
            onUpdate={fetchLoads}
          />
        </TabsContent>
      </Tabs>

      {/* ── Detail Dialog ──────────────────────────────────────────────── */}
      <LoadDetailDialog
        load={detailLoad}
        open={!!detailLoad}
        onClose={() => setDetailLoad(null)}
      />

      {/* ── Cancel Dialog ──────────────────────────────────────────────── */}
      <Dialog
        open={!!cancelLoad}
        onOpenChange={() => {
          setCancelLoad(null);
          setCancelReason("");
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel Load {cancelLoad?.reference_number}</DialogTitle>
            <DialogDescription>
              This action cannot be undone. A reason is required.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Cancellation Reason</Label>
            <Textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Explain why this load is being cancelled..."
              required
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelLoad(null)}>
              Keep Load
            </Button>
            <Button
              variant="destructive"
              onClick={handleCancel}
              disabled={!cancelReason.trim() || submitting}
            >
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Cancel Load
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================================
// LOADS TABLE (reusable across all three tabs)
// ============================================================================
function LoadsTable({
  loads,
  loading,
  tab,
  onView,
  onCancel,
  onUpdate,
}: {
  loads: LoadRow[];
  loading: boolean;
  tab: "active" | "completed" | "cancelled";
  onView: (l: LoadRow) => void;
  onCancel?: (l: LoadRow) => void;
  onUpdate: () => void;
}) {
  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (loads.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <Package className="h-12 w-12 mb-3 opacity-40" />
          <p className="text-sm">
            {tab === "active" && "No active loads"}
            {tab === "completed" && "No completed loads yet"}
            {tab === "cancelled" && "No cancelled loads"}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30">
              <TableHead className="font-semibold">
                {tab === "completed" ? "Payment" : "Status"}
              </TableHead>
              <TableHead className="font-semibold">Pickup Date</TableHead>
              <TableHead className="font-semibold">Delivery Date</TableHead>
              <TableHead className="font-semibold">Company Name</TableHead>
              <TableHead className="font-semibold">Load Number</TableHead>
              <TableHead className="font-semibold">Pickup City, State</TableHead>
              <TableHead className="font-semibold">Delivery City, State</TableHead>
              <TableHead className="font-semibold">Driver</TableHead>
              <TableHead className="font-semibold text-right">Rate</TableHead>
              <TableHead className="font-semibold text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loads.map((load) => {
              const sCfg = STATUS_CONFIG[load.status as LoadStatus];
              const pickup = getPickupStop(load.stops ?? []);
              const delivery = getDeliveryStop(load.stops ?? []);

              return (
                <TableRow key={load.id}>
                  <TableCell>
                    {tab === "completed" ? (
                      <PaymentStatusDropdown load={load} onUpdate={onUpdate} />
                    ) : (
                      <Badge variant={sCfg?.variant}>{sCfg?.label}</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-sm whitespace-nowrap">
                    {fmtStopDate(pickup?.appointment_date)}
                  </TableCell>
                  <TableCell className="text-sm whitespace-nowrap">
                    {fmtStopDate(delivery?.appointment_date)}
                  </TableCell>
                  <TableCell className="font-medium">
                    {load.client_name || "—"}
                  </TableCell>
                  <TableCell className="font-medium">
                    {load.reference_number}
                  </TableCell>
                  <TableCell className="text-sm whitespace-nowrap">
                    {fmtCityState(pickup)}
                  </TableCell>
                  <TableCell className="text-sm whitespace-nowrap">
                    {fmtCityState(delivery)}
                  </TableCell>
                  <TableCell>{load.driver?.full_name || "—"}</TableCell>
                  <TableCell className="text-right font-medium">
                    ${Number(load.rate).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onView(load)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      {tab === "active" &&
                        onCancel &&
                        !["delivered", "cancelled"].includes(load.status) && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => onCancel(load)}
                          >
                            <XCircle className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// LOAD DETAIL DIALOG (updated with review section)
// ============================================================================
function LoadDetailDialog({
  load,
  open,
  onClose,
}: {
  load: LoadRow | null;
  open: boolean;
  onClose: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [rcLoading, setRcLoading] = useState(false);

  const handleViewRateConfirmation = async () => {
    if (!load?.rate_confirmation_path) return;
    setRcLoading(true);
    const { data, error } = await supabase.storage
      .from("rate-confirmations")
      .createSignedUrl(load.rate_confirmation_path, 3600);
    setRcLoading(false);
    if (data?.signedUrl) {
      window.open(data.signedUrl, "_blank");
    } else {
      toast.error("Failed to load rate confirmation");
    }
  };

  if (!load) return null;

  const stops = [...(load.stops ?? [])].sort(
    (a, b) => a.stop_order - b.stop_order
  );
  const updates = [...(load.status_updates ?? [])].sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  const receipts = load.receipts ?? [];
  const hasReview =
    load.reviewed_by || load.reviewed_at || load.review_feedback;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-4">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Package className="h-5 w-5 text-primary" />
            Load {load.reference_number}
          </DialogTitle>
          <DialogDescription>Full load details and history.</DialogDescription>
        </DialogHeader>

        <Separator />

        <ScrollArea className="max-h-[calc(90vh-120px)]">
          <div className="px-6 py-4 space-y-5">
            {/* ── Overview ───────────────────────────────────────────── */}
            <div className="grid grid-cols-2 gap-4">
              <DetailItem
                icon={<Truck className="h-4 w-4" />}
                label="Status"
                value={
                  <Badge variant={STATUS_CONFIG[load.status]?.variant}>
                    {STATUS_CONFIG[load.status]?.label}
                  </Badge>
                }
              />
              <DetailItem
                icon={<FileText className="h-4 w-4" />}
                label="Payment"
                value={
                  <Badge variant={PAYMENT_CONFIG[load.payment_status]?.variant}>
                    {PAYMENT_CONFIG[load.payment_status]?.label}
                  </Badge>
                }
              />
              <DetailItem
                icon={<UserIcon className="h-4 w-4" />}
                label="Driver"
                value={load.driver?.full_name ?? "Unassigned"}
              />
              <DetailItem
                icon={<UserIcon className="h-4 w-4" />}
                label="Dispatcher"
                value={load.dispatcher?.full_name ?? "—"}
              />
              <DetailItem
                icon={<Package className="h-4 w-4" />}
                label="Rate"
                value={`$${Number(load.rate).toLocaleString()}`}
              />
              {load.equipment_type && (
                <DetailItem
                  icon={<Truck className="h-4 w-4" />}
                  label="Equipment"
                  value={load.equipment_type}
                />
              )}
              {load.weight_lbs != null && (
                <DetailItem
                  icon={<Package className="h-4 w-4" />}
                  label="Weight"
                  value={`${load.weight_lbs.toLocaleString()} lbs`}
                />
              )}
              <DetailItem
                icon={<Clock className="h-4 w-4" />}
                label="Dispatched"
                value={fmtDate(load.dispatched_at)}
              />
              {load.completed_at && (
                <DetailItem
                  icon={<CheckCircle2 className="h-4 w-4 text-emerald-500" />}
                  label="Completed"
                  value={fmtDate(load.completed_at)}
                />
              )}
              {load.cancelled_at && (
                <DetailItem
                  icon={<XCircle className="h-4 w-4 text-red-500" />}
                  label="Cancelled"
                  value={fmtDate(load.cancelled_at)}
                />
              )}
            </div>

            {load.rate_confirmation_path && (
              <Button
                variant="outline"
                className="w-full"
                onClick={handleViewRateConfirmation}
                disabled={rcLoading}
              >
                {rcLoading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <ExternalLink className="mr-2 h-4 w-4" />
                )}
                View Rate Confirmation
              </Button>
            )}

            {load.special_instructions && (
              <div className="rounded-lg border bg-blue-50/50 p-3 dark:bg-blue-950/20">
                <p className="text-xs font-medium text-muted-foreground mb-1">
                  Special Instructions
                </p>
                <p className="text-sm">{load.special_instructions}</p>
              </div>
            )}

            {/* ── Review Section ──────────────────────────────────────── */}
            {hasReview && (
              <>
                <Separator />
                <div>
                  <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-primary" />
                    Admin Review
                  </h4>
                  <div className="rounded-lg border bg-slate-50/50 p-4 dark:bg-slate-950/20 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      {load.reviewer?.full_name && (
                        <div>
                          <p className="text-xs text-muted-foreground">
                            Reviewed By
                          </p>
                          <p className="text-sm font-medium flex items-center gap-1.5">
                            <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
                            {load.reviewer.full_name}
                          </p>
                        </div>
                      )}
                      {!load.reviewer?.full_name && load.reviewed_by && (
                        <div>
                          <p className="text-xs text-muted-foreground">
                            Reviewed By
                          </p>
                          <p className="text-sm font-medium">Admin</p>
                        </div>
                      )}
                      {load.reviewed_at && (
                        <div>
                          <p className="text-xs text-muted-foreground">
                            Reviewed At
                          </p>
                          <p className="text-sm font-medium">
                            {fmtDate(load.reviewed_at)}
                          </p>
                        </div>
                      )}
                    </div>
                    {load.review_feedback && (
                      <div className="rounded-md border border-amber-200 bg-amber-50/50 p-3 dark:border-amber-900 dark:bg-amber-950/20">
                        <p className="text-xs font-medium text-amber-700 dark:text-amber-300 mb-1 flex items-center gap-1.5">
                          <MessageSquare className="h-3.5 w-3.5" />
                          Review Feedback
                        </p>
                        <p className="text-sm">{load.review_feedback}</p>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}

            {/* ── Cancel reason ───────────────────────────────────────── */}
            {load.cancel_reason && (
              <div className="rounded-lg border border-red-200 bg-red-50/50 p-3 dark:border-red-900 dark:bg-red-950/20">
                <p className="text-xs font-medium text-red-700 dark:text-red-300 mb-1 flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Cancel Reason
                </p>
                <p className="text-sm">{load.cancel_reason}</p>
              </div>
            )}

            {/* ── Stops ──────────────────────────────────────────────── */}
            {stops.length > 0 && (
              <>
                <Separator />
                <div>
                  <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-primary" />
                    Stops
                  </h4>
                  <div className="space-y-0">
                    {stops.map((stop, idx) => {
                      const isPickup = stop.type === "pickup";
                      const dotColor = isPickup
                        ? "bg-emerald-500"
                        : "bg-red-500";
                      const isLast = idx === stops.length - 1;

                      return (
                        <div key={stop.id} className="flex gap-3">
                          <div className="flex flex-col items-center">
                            <div
                              className={`h-3 w-3 rounded-full ${dotColor} mt-1.5 ring-2 ring-white dark:ring-card`}
                            />
                            {!isLast && (
                              <div className="w-0.5 flex-1 bg-border" />
                            )}
                          </div>
                          <div className="pb-4 flex-1">
                            <div className="flex items-center gap-2">
                              <Badge
                                variant={isPickup ? "success" : "destructive"}
                                className="text-[10px] px-1.5 py-0"
                              >
                                {isPickup ? "Pickup" : "Delivery"}
                              </Badge>
                              <Badge
                                variant="outline"
                                className="text-[10px] px-1.5 py-0"
                              >
                                Stop {stop.stop_order}
                              </Badge>
                              <Badge
                                variant={
                                  stop.status === "completed"
                                    ? "success"
                                    : stop.status === "arrived"
                                    ? "warning"
                                    : "secondary"
                                }
                                className="text-[10px] px-1.5 py-0"
                              >
                                {stop.status}
                              </Badge>
                            </div>
                            <p className="text-sm font-medium mt-1">
                              {stop.facility_name}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {stop.address}, {stop.city}, {stop.state}{" "}
                              {stop.zip}
                            </p>
                            {(stop.arrival_at || stop.departure_at) && (
                              <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
                                {stop.arrival_at && (
                                  <span>Arrived: {fmtDate(stop.arrival_at)}</span>
                                )}
                                {stop.departure_at && (
                                  <span>
                                    Departed: {fmtDate(stop.departure_at)}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}

            {/* ── Receipts / PODs ─────────────────────────────────────── */}
            {receipts.length > 0 && (
              <>
                <Separator />
                <div>
                  <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                    <FileText className="h-4 w-4 text-primary" />
                    Receipts / PODs
                  </h4>
                  <div className="space-y-2">
                    {receipts.map((r) => (
                      <div
                        key={r.id}
                        className="flex items-center justify-between rounded-lg border p-3"
                      >
                        <div>
                          <p className="text-sm font-medium">
                            {r.no_pod_available
                              ? "No POD Available"
                              : r.file_name ?? "POD Document"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {r.signed_by && `Signed by: ${r.signed_by} · `}
                            {fmtDate(r.created_at)}
                          </p>
                        </div>
                        {r.file_url && (
                          <Button variant="ghost" size="sm" asChild>
                            <a
                              href={r.file_url}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              View
                            </a>
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* ── Status History ──────────────────────────────────────── */}
            {updates.length > 0 && (
              <>
                <Separator />
                <div>
                  <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                    <Clock className="h-4 w-4 text-primary" />
                    Status History
                  </h4>
                  <div className="space-y-2">
                    {updates.map((u) => {
                      const prevCfg = u.previous_status
                        ? STATUS_CONFIG[u.previous_status]
                        : null;
                      const newCfg = STATUS_CONFIG[u.new_status];
                      return (
                        <div
                          key={u.id}
                          className="flex items-start gap-3 rounded-lg border p-2.5"
                        >
                          <div
                            className={`mt-1 h-2.5 w-2.5 rounded-full flex-shrink-0 ${
                              STATUS_DOT_COLORS[u.new_status] ?? "bg-gray-400"
                            }`}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {prevCfg && (
                                <>
                                  <Badge
                                    variant={prevCfg.variant}
                                    className="text-[10px] px-1.5 py-0"
                                  >
                                    {prevCfg.label}
                                  </Badge>
                                  <ArrowRight className="h-3 w-3 text-muted-foreground" />
                                </>
                              )}
                              <Badge
                                variant={newCfg.variant}
                                className="text-[10px] px-1.5 py-0"
                              >
                                {newCfg.label}
                              </Badge>
                            </div>
                            {u.notes && (
                              <p className="text-xs text-muted-foreground mt-1 italic">
                                {u.notes}
                              </p>
                            )}
                          </div>
                          <p className="text-[11px] text-muted-foreground whitespace-nowrap">
                            {fmtDate(u.created_at)}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Payment Status Dropdown (editable)
// ---------------------------------------------------------------------------
function PaymentStatusDropdown({
  load,
  onUpdate,
}: {
  load: LoadRow;
  onUpdate: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [updating, setUpdating] = useState(false);
  const pCfg = PAYMENT_CONFIG[load.payment_status];

  const handleChange = async (newStatus: "unpaid" | "invoiced" | "paid") => {
    setUpdating(true);
    const { error } = await supabase
      .from("loads")
      .update({ payment_status: newStatus })
      .eq("id", load.id);

    if (error) {
      toast.error(`Failed to update payment status: ${error.message}`);
    } else {
      toast.success("Payment status updated");
      onUpdate();
    }
    setUpdating(false);
  };

  return (
    <Select
      value={load.payment_status}
      onValueChange={handleChange}
      disabled={updating}
    >
      <SelectTrigger className="w-[120px] h-7">
        <Badge variant={pCfg?.variant} className="w-full justify-center">
          {pCfg?.label}
        </Badge>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="unpaid">Unpaid</SelectItem>
        <SelectItem value="invoiced">Invoiced</SelectItem>
        <SelectItem value="paid">Paid</SelectItem>
      </SelectContent>
    </Select>
  );
}

// ---------------------------------------------------------------------------
// Small detail item helper
// ---------------------------------------------------------------------------
function DetailItem({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2">
      <div className="mt-0.5 text-muted-foreground">{icon}</div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <div className="text-sm font-medium">{value}</div>
      </div>
    </div>
  );
}
