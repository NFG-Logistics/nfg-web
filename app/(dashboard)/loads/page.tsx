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
import { Card, CardContent } from "@/components/ui/card";
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
  Folder,
  FileText,
  CheckCircle2,
  ChevronRight,
  ExternalLink,
  MapPin,
  Calendar,
  User as UserIcon,
  Package,
  XCircle,
  AlertTriangle,
  Download,
} from "lucide-react";
import { toast } from "sonner";
import type { Load, LoadStatus, Stop, Receipt, StatusUpdate } from "@/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LoadRow extends Load {
  driver?: { id: string; full_name: string } | null;
  dispatcher?: { id: string; full_name: string } | null;
  stops?: Stop[];
  receipts?: Receipt[];
  status_updates?: StatusUpdate[];
}

interface NavState {
  year?: number;
  driverId?: string;
  driverName?: string;
  loadId?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function firstPickupStop(load: LoadRow): Stop | null {
  return (
    (load.stops || [])
      .filter((s) => s.type === "pickup")
      .sort((a, b) => a.stop_order - b.stop_order)[0] || null
  );
}

function lastDeliveryStop(load: LoadRow): Stop | null {
  const d = (load.stops || [])
    .filter((s) => s.type === "delivery")
    .sort((a, b) => a.stop_order - b.stop_order);
  return d[d.length - 1] || null;
}

function pickupDate(load: LoadRow): Date {
  const s = firstPickupStop(load);
  if (s?.appointment_date) return new Date(s.appointment_date);
  if (load.dispatched_at) return new Date(load.dispatched_at);
  return new Date(load.created_at);
}

function loadYear(load: LoadRow): number {
  return pickupDate(load).getFullYear();
}

function dateFolderLabel(date: Date): string {
  const m = date.getMonth() + 1;
  const d = date.getDate();
  const y = date.getFullYear() % 100;
  return `${m}-${d}-${y.toString().padStart(2, "0")}`;
}

function fmtDate(v: string | null | undefined): string {
  if (!v) return "—";
  return new Date(v).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function routeSummary(load: LoadRow) {
  const p = firstPickupStop(load);
  const d = lastDeliveryStop(load);
  return {
    from: p ? `${p.city}, ${p.state}` : "—",
    to: d ? `${d.city}, ${d.state}` : "—",
  };
}

function driverName(load: LoadRow): string {
  return load.driver?.full_name || "Unassigned";
}

function driverId(load: LoadRow): string {
  return load.driver?.id || "unassigned";
}

function pods(load: LoadRow): Receipt[] {
  return (load.receipts || []).filter(
    (r) =>
      r.receipt_type === "pod" ||
      r.file_name?.toLowerCase().includes("pod")
  );
}

const STATUS_DOT: Record<string, string> = {
  dispatched: "bg-blue-500",
  on_site_shipper: "bg-amber-500",
  loaded: "bg-indigo-500",
  on_site_receiver: "bg-amber-500",
  empty: "bg-gray-400",
  retake_requested: "bg-orange-500",
  delivered: "bg-emerald-500",
  cancelled: "bg-red-500",
};

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function LoadsPage() {
  const supabase = useMemo(() => createClient(), []);
  const { user } = useUser();

  const [loads, setLoads] = useState<LoadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [nav, setNav] = useState<NavState>({});

  const [cancelTarget, setCancelTarget] = useState<LoadRow | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // ---- Fetch ---------------------------------------------------------------

  const fetchLoads = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("loads")
      .select(
        `*,
         driver:users!loads_driver_id_fkey(id, full_name),
         dispatcher:users!loads_dispatcher_id_fkey(id, full_name),
         stops(*),
         receipts(*),
         status_updates(*)`
      )
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Failed to fetch loads:", error);
      const { data: fallback } = await supabase
        .from("loads")
        .select("*")
        .order("created_at", { ascending: false });
      setLoads(
        (fallback || []).map((l: Load) => ({
          ...l,
          driver: null,
          dispatcher: null,
          stops: [],
          receipts: [],
          status_updates: [],
        }))
      );
    } else {
      setLoads(data || []);
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    fetchLoads();
  }, [fetchLoads]);

  // ---- Realtime ------------------------------------------------------------

  useEffect(() => {
    const ch = supabase
      .channel("loads-folder-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "loads" }, () => fetchLoads())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "receipts" }, () => fetchLoads())
      .on("postgres_changes", { event: "*", schema: "public", table: "status_updates" }, () => fetchLoads())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [supabase, fetchLoads]);

  // ---- Search filter -------------------------------------------------------

  const filtered = useMemo(() => {
    if (!search.trim()) return loads;
    const q = search.toLowerCase();
    return loads.filter((l) => {
      const r = routeSummary(l);
      return (
        l.reference_number?.toLowerCase().includes(q) ||
        l.client_name?.toLowerCase().includes(q) ||
        driverName(l).toLowerCase().includes(q) ||
        r.from.toLowerCase().includes(q) ||
        r.to.toLowerCase().includes(q) ||
        (l.stops || []).some((s) => s.facility_name?.toLowerCase().includes(q)) ||
        l.status?.toLowerCase().includes(q)
      );
    });
  }, [loads, search]);

  // ---- Hierarchy -----------------------------------------------------------

  const years = useMemo(() => {
    const m = new Map<number, number>();
    filtered.forEach((l) => {
      const y = loadYear(l);
      m.set(y, (m.get(y) || 0) + 1);
    });
    return Array.from(m.entries())
      .sort(([a], [b]) => b - a)
      .map(([year, count]) => ({ year, count }));
  }, [filtered]);

  const drivers = useMemo(() => {
    if (nav.year === undefined) return [];
    const m = new Map<string, { name: string; count: number }>();
    filtered
      .filter((l) => loadYear(l) === nav.year)
      .forEach((l) => {
        const id = driverId(l);
        const name = driverName(l);
        const prev = m.get(id);
        m.set(id, { name: prev?.name || name, count: (prev?.count || 0) + 1 });
      });
    return Array.from(m.entries())
      .sort(([, a], [, b]) => a.name.localeCompare(b.name))
      .map(([id, { name, count }]) => ({ id, name, count }));
  }, [filtered, nav.year]);

  const driverLoads = useMemo(() => {
    if (nav.year === undefined || !nav.driverId) return [];
    return filtered
      .filter((l) => loadYear(l) === nav.year && driverId(l) === nav.driverId)
      .sort((a, b) => pickupDate(b).getTime() - pickupDate(a).getTime());
  }, [filtered, nav.year, nav.driverId]);

  const selectedLoad = useMemo(() => {
    if (!nav.loadId) return null;
    return loads.find((l) => l.id === nav.loadId) || null;
  }, [loads, nav.loadId]);

  const level: "root" | "year" | "driver" | "load" = nav.loadId
    ? "load"
    : nav.driverId
      ? "driver"
      : nav.year !== undefined
        ? "year"
        : "root";

  // ---- Navigation ----------------------------------------------------------

  const goRoot = () => setNav({});
  const goYear = (y: number) => setNav({ year: y });
  const goDriver = (id: string, name: string) =>
    setNav({ year: nav.year, driverId: id, driverName: name });
  const goLoad = (id: string) =>
    setNav({ ...nav, loadId: id });

  // ---- Actions -------------------------------------------------------------

  const openRateConf = async (path: string) => {
    const { data, error } = await supabase.storage
      .from("rate-confirmations")
      .createSignedUrl(path, 3600);
    if (error || !data?.signedUrl) {
      toast.error("Failed to open rate confirmation");
      return;
    }
    window.open(data.signedUrl, "_blank");
  };

  const handleCancel = async () => {
    if (!cancelTarget) return;
    setSubmitting(true);
    const { error } = await supabase
      .from("loads")
      .update({
        status: "cancelled" as LoadStatus,
        cancel_reason: cancelReason || null,
      })
      .eq("id", cancelTarget.id);
    setSubmitting(false);
    if (error) {
      toast.error("Failed to cancel load");
    } else {
      toast.success("Load cancelled");
      setCancelTarget(null);
      setCancelReason("");
      fetchLoads();
    }
  };

  const updatePayment = async (loadId: string, status: string) => {
    const { error } = await supabase
      .from("loads")
      .update({ payment_status: status })
      .eq("id", loadId);
    if (error) toast.error("Failed to update payment status");
    else {
      toast.success(`Payment marked as ${status}`);
      fetchLoads();
    }
  };

  const exportCSV = useCallback(() => {
    if (filtered.length === 0) {
      toast.error("Nothing to export");
      return;
    }
    const rows = filtered.map((l) => {
      const r = routeSummary(l);
      return [
        l.reference_number,
        driverName(l),
        l.client_name || "",
        r.from,
        r.to,
        fmtDate(pickupDate(l).toISOString()),
        l.rate,
        STATUS_CONFIG[l.status]?.label || l.status,
        PAYMENT_CONFIG[l.payment_status]?.label || l.payment_status,
      ];
    });
    const header = [
      "Load #",
      "Driver",
      "Client",
      "Pickup",
      "Delivery",
      "Pickup Date",
      "Rate",
      "Status",
      "Payment",
    ];
    const csv = [header, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `loads-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [filtered]);

  // ---- Render --------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader title="Loads" description="Browse and manage load files">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={exportCSV}>
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
          <Link href="/loads/dispatch">
            <Button size="sm">
              <Plus className="mr-2 h-4 w-4" />
              Dispatch Load
            </Button>
          </Link>
        </div>
      </PageHeader>

      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm flex-wrap">
        <button
          onClick={goRoot}
          className={`flex items-center gap-1 hover:text-foreground transition-colors ${
            level === "root"
              ? "font-semibold text-foreground"
              : "text-muted-foreground"
          }`}
        >
          <Folder className="h-4 w-4" />
          Loads
        </button>

        {nav.year !== undefined && (
          <>
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60" />
            <button
              onClick={() => goYear(nav.year!)}
              className={`hover:text-foreground transition-colors ${
                level === "year"
                  ? "font-semibold text-foreground"
                  : "text-muted-foreground"
              }`}
            >
              {nav.year}
            </button>
          </>
        )}

        {nav.driverName && (
          <>
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60" />
            <button
              onClick={() => goDriver(nav.driverId!, nav.driverName!)}
              className={`hover:text-foreground transition-colors ${
                level === "driver"
                  ? "font-semibold text-foreground"
                  : "text-muted-foreground"
              }`}
            >
              {nav.driverName}
            </button>
          </>
        )}

        {selectedLoad && (
          <>
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60" />
            <span className="font-semibold text-foreground">
              {dateFolderLabel(pickupDate(selectedLoad))}
            </span>
          </>
        )}
      </nav>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search loads, drivers, locations…"
          className="pl-10"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Folder views */}
      {level === "root" && <YearGrid years={years} onSelect={goYear} />}
      {level === "year" && <DriverGrid drivers={drivers} onSelect={goDriver} />}
      {level === "driver" && (
        <DateGrid loads={driverLoads} onSelect={goLoad} />
      )}
      {level === "load" && selectedLoad && (
        <LoadDetail
          load={selectedLoad}
          onOpenRateConf={openRateConf}
          onCancel={() => setCancelTarget(selectedLoad)}
          onPaymentChange={updatePayment}
        />
      )}

      {/* Cancel dialog */}
      <Dialog
        open={!!cancelTarget}
        onOpenChange={(open) => {
          if (!open) {
            setCancelTarget(null);
            setCancelReason("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel Load</DialogTitle>
            <DialogDescription>
              This will cancel load {cancelTarget?.reference_number}. This
              action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Reason (optional)</Label>
            <Textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Why is this load being cancelled?"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelTarget(null)}>
              Keep Load
            </Button>
            <Button
              variant="destructive"
              onClick={handleCancel}
              disabled={submitting}
            >
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <XCircle className="mr-2 h-4 w-4" />
              Cancel Load
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ==========================================================================
// Sub-components
// ==========================================================================

// ---- Year folders ----------------------------------------------------------

function YearGrid({
  years,
  onSelect,
}: {
  years: { year: number; count: number }[];
  onSelect: (y: number) => void;
}) {
  if (years.length === 0) {
    return (
      <EmptyState
        icon={<Package className="h-12 w-12" />}
        title="No loads yet"
        subtitle="Dispatch your first load to get started."
      />
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
      {years.map(({ year, count }) => (
        <button
          key={year}
          onClick={() => onSelect(year)}
          className="group flex flex-col items-center gap-2 p-6 rounded-xl border bg-card hover:bg-accent hover:border-primary/30 transition-all"
        >
          <Folder className="h-14 w-14 text-blue-500 group-hover:text-blue-600 transition-colors" />
          <span className="font-semibold text-lg">{year}</span>
          <span className="text-xs text-muted-foreground">
            {count} load{count !== 1 && "s"}
          </span>
        </button>
      ))}
    </div>
  );
}

// ---- Driver folders --------------------------------------------------------

function DriverGrid({
  drivers,
  onSelect,
}: {
  drivers: { id: string; name: string; count: number }[];
  onSelect: (id: string, name: string) => void;
}) {
  if (drivers.length === 0) {
    return (
      <EmptyState
        icon={<UserIcon className="h-12 w-12" />}
        title="No drivers found"
        subtitle="No loads match your search for this year."
      />
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
      {drivers.map(({ id, name, count }) => (
        <button
          key={id}
          onClick={() => onSelect(id, name)}
          className="group flex flex-col items-center gap-2 p-6 rounded-xl border bg-card hover:bg-accent hover:border-primary/30 transition-all"
        >
          <Folder className="h-14 w-14 text-emerald-500 group-hover:text-emerald-600 transition-colors" />
          <span className="font-medium text-sm text-center leading-tight">
            {name}
          </span>
          <span className="text-xs text-muted-foreground">
            {count} load{count !== 1 && "s"}
          </span>
        </button>
      ))}
    </div>
  );
}

// ---- Date folders (loads for a specific driver) ----------------------------

function DateGrid({
  loads,
  onSelect,
}: {
  loads: LoadRow[];
  onSelect: (id: string) => void;
}) {
  if (loads.length === 0) {
    return (
      <EmptyState
        icon={<Calendar className="h-12 w-12" />}
        title="No loads found"
        subtitle="No loads match your search for this driver."
      />
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      {loads.map((load) => {
        const pd = pickupDate(load);
        const r = routeSummary(load);
        const cfg = STATUS_CONFIG[load.status];
        const hasRC = !!load.rate_confirmation_path;
        const podCount = pods(load).length;

        return (
          <button
            key={load.id}
            onClick={() => onSelect(load.id)}
            className="group text-left p-4 rounded-xl border bg-card hover:bg-accent hover:border-primary/30 transition-all"
          >
            <div className="flex items-start gap-3">
              <Folder className="h-10 w-10 text-amber-500 group-hover:text-amber-600 transition-colors shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1 space-y-1">
                <p className="font-semibold">{dateFolderLabel(pd)}</p>
                <p className="text-xs text-muted-foreground truncate">
                  #{load.reference_number}
                  {load.client_name && ` · ${load.client_name}`}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {r.from} → {r.to}
                </p>

                <div className="flex items-center gap-2 pt-1">
                  <span
                    className={`inline-block w-2 h-2 rounded-full ${
                      STATUS_DOT[load.status] || "bg-gray-400"
                    }`}
                  />
                  <span className="text-xs">{cfg?.label || load.status}</span>
                </div>

                {(hasRC || podCount > 0) && (
                  <div className="flex items-center gap-3 text-[11px] text-muted-foreground pt-0.5">
                    {hasRC && (
                      <span className="flex items-center gap-0.5">
                        <FileText className="h-3 w-3" /> Rate Conf
                      </span>
                    )}
                    {podCount > 0 && (
                      <span className="flex items-center gap-0.5">
                        <CheckCircle2 className="h-3 w-3" /> POD
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ---- Load detail (inside a date folder) ------------------------------------

function LoadDetail({
  load,
  onOpenRateConf,
  onCancel,
  onPaymentChange,
}: {
  load: LoadRow;
  onOpenRateConf: (path: string) => void;
  onCancel: () => void;
  onPaymentChange: (loadId: string, status: string) => void;
}) {
  const r = routeSummary(load);
  const sCfg = STATUS_CONFIG[load.status];
  const pCfg = PAYMENT_CONFIG[load.payment_status];
  const loadPods = pods(load);

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Summary card */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold">
                Load #{load.reference_number}
              </h2>
              {load.client_name && (
                <p className="text-sm text-muted-foreground">
                  {load.client_name}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant={sCfg?.variant || "default"}>
                {sCfg?.label || load.status}
              </Badge>
              <Badge variant={pCfg?.variant || "default"}>
                {pCfg?.label || load.payment_status}
              </Badge>
            </div>
          </div>

          <Separator />

          <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <DetailItem label="Rate">
              $
              {Number(load.rate).toLocaleString("en-US", {
                minimumFractionDigits: 2,
              })}
            </DetailItem>
            <DetailItem label="Driver">{driverName(load)}</DetailItem>
            <DetailItem label="Dispatched">
              {fmtDate(load.dispatched_at)}
            </DetailItem>
            {load.completed_at && (
              <DetailItem label="Completed">
                {fmtDate(load.completed_at)}
              </DetailItem>
            )}
          </div>

          {load.special_instructions && (
            <>
              <Separator />
              <div>
                <p className="text-xs text-muted-foreground mb-1">
                  Special Instructions
                </p>
                <p className="text-sm">{load.special_instructions}</p>
              </div>
            </>
          )}

          {load.status !== "cancelled" && (
            <>
              <Separator />
              <div className="flex items-center gap-3">
                <p className="text-sm text-muted-foreground">Payment:</p>
                <Select
                  value={load.payment_status}
                  onValueChange={(v) => onPaymentChange(load.id, v)}
                >
                  <SelectTrigger className="w-[140px] h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unpaid">Unpaid</SelectItem>
                    <SelectItem value="invoiced">Invoiced</SelectItem>
                    <SelectItem value="paid">Paid</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Route */}
      <Card>
        <CardContent className="pt-6">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <MapPin className="h-4 w-4" /> Route
          </h3>
          <div className="space-y-4">
            {(load.stops || [])
              .sort((a, b) => a.stop_order - b.stop_order)
              .map((stop, i) => (
                <div key={stop.id} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div
                      className={`w-3 h-3 rounded-full shrink-0 ${
                        stop.type === "pickup"
                          ? "bg-blue-500"
                          : "bg-emerald-500"
                      }`}
                    />
                    {i < (load.stops?.length || 0) - 1 && (
                      <div className="w-px flex-1 bg-border mt-1" />
                    )}
                  </div>
                  <div className="pb-4">
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={
                          stop.type === "pickup" ? "info" : "success"
                        }
                        className="text-[10px] px-1.5 py-0"
                      >
                        {stop.type === "pickup" ? "Pickup" : "Delivery"}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {fmtDate(stop.appointment_date)}
                      </span>
                    </div>
                    <p className="font-medium text-sm mt-1">
                      {stop.facility_name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {stop.address}, {stop.city}, {stop.state} {stop.zip}
                    </p>
                    {stop.contact_name && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Contact: {stop.contact_name}
                        {stop.contact_phone && ` (${stop.contact_phone})`}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            {(!load.stops || load.stops.length === 0) && (
              <p className="text-sm text-muted-foreground">
                No route information available.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Documents */}
      <Card>
        <CardContent className="pt-6">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <FileText className="h-4 w-4" /> Documents
          </h3>
          <div className="space-y-3">
            {/* Rate Confirmation */}
            <FileRow
              icon={
                <FileText className="h-8 w-8 text-blue-500 shrink-0" />
              }
              name="Rate Confirmation"
              detail={
                load.rate_confirmation_path ? "Uploaded" : "Not uploaded"
              }
              actionLabel="View"
              onAction={
                load.rate_confirmation_path
                  ? () => onOpenRateConf(load.rate_confirmation_path!)
                  : undefined
              }
            />

            {/* PODs */}
            {loadPods.length > 0 ? (
              loadPods.map((pod) => (
                <FileRow
                  key={pod.id}
                  icon={
                    <CheckCircle2 className="h-8 w-8 text-emerald-500 shrink-0" />
                  }
                  name="Proof of Delivery"
                  detail={`${pod.file_name || "POD"} · ${fmtDate(pod.created_at)}`}
                  actionLabel="View"
                  onAction={
                    pod.file_url
                      ? () => window.open(pod.file_url!, "_blank")
                      : undefined
                  }
                />
              ))
            ) : (
              <FileRow
                icon={
                  <CheckCircle2 className="h-8 w-8 text-muted-foreground/30 shrink-0" />
                }
                name="Proof of Delivery"
                detail="Not uploaded yet"
              />
            )}

            {/* Other receipts */}
            {(load.receipts || [])
              .filter(
                (r) =>
                  r.receipt_type !== "pod" &&
                  !r.file_name?.toLowerCase().includes("pod")
              )
              .map((r) => (
                <FileRow
                  key={r.id}
                  icon={
                    <FileText className="h-8 w-8 text-gray-400 shrink-0" />
                  }
                  name={r.receipt_type ? r.receipt_type.replace("_", " ") : "Receipt"}
                  detail={`${r.file_name || "File"}${r.amount ? ` · $${r.amount}` : ""} · ${fmtDate(r.created_at)}`}
                  actionLabel="View"
                  onAction={
                    r.file_url
                      ? () => window.open(r.file_url!, "_blank")
                      : undefined
                  }
                />
              ))}
          </div>
        </CardContent>
      </Card>

      {/* Cancel action */}
      {load.status !== "cancelled" && load.status !== "delivered" && (
        <div className="flex justify-end">
          <Button variant="destructive" size="sm" onClick={onCancel}>
            <XCircle className="mr-2 h-4 w-4" />
            Cancel Load
          </Button>
        </div>
      )}

      {load.cancel_reason && (
        <Card className="border-destructive/30">
          <CardContent className="pt-6">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
              <div>
                <p className="font-medium text-sm text-destructive">
                  Cancellation Reason
                </p>
                <p className="text-sm mt-1">{load.cancel_reason}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ---- Shared small components -----------------------------------------------

function FileRow({
  icon,
  name,
  detail,
  actionLabel,
  onAction,
}: {
  icon: React.ReactNode;
  name: string;
  detail: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
      <div className="flex items-center gap-3 min-w-0">
        {icon}
        <div className="min-w-0">
          <p className="font-medium text-sm">{name}</p>
          <p className="text-xs text-muted-foreground truncate">{detail}</p>
        </div>
      </div>
      {onAction && actionLabel && (
        <Button size="sm" variant="outline" onClick={onAction} className="shrink-0 ml-3">
          <ExternalLink className="mr-1.5 h-3 w-3" />
          {actionLabel}
        </Button>
      )}
    </div>
  );
}

function DetailItem({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="font-medium">{children}</p>
    </div>
  );
}

function EmptyState({
  icon,
  title,
  subtitle,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="text-center py-20 text-muted-foreground">
      <div className="mx-auto mb-4 opacity-40">{icon}</div>
      <p className="text-lg font-medium">{title}</p>
      <p className="text-sm mt-1">{subtitle}</p>
    </div>
  );
}
