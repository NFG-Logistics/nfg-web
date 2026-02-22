"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { STATUS_CONFIG } from "@/lib/constants";
import type {
  Load,
  LoadStatus,
  Stop,
  User,
  Receipt,
  StatusUpdate,
} from "@/types";
import {
  CheckCircle2,
  XCircle,
  RotateCcw,
  MapPin,
  FileImage,
  Clock,
  Truck,
  User as UserIcon,
  Package,
  ArrowRight,
  AlertTriangle,
  FileText,
  Loader2,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
interface LoadRow extends Load {
  driver: User | null;
  dispatcher: User | null;
  stops: Stop[];
  receipts: Receipt[];
  status_updates: StatusUpdate[];
}

interface ReviewModalProps {
  load: LoadRow;
  open: boolean;
  onClose: () => void;
  onDone: () => void;
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

const STATUS_TIMELINE_COLORS: Record<string, string> = {
  dispatched: "bg-blue-500",
  on_site_shipper: "bg-amber-500",
  loaded: "bg-indigo-500",
  on_site_receiver: "bg-amber-500",
  empty: "bg-slate-500",
  delivered: "bg-emerald-500",
  cancelled: "bg-red-500",
};

// ============================================================================
// COMPONENT
// ============================================================================
export function ReviewModal({ load, open, onClose, onDone }: ReviewModalProps) {
  const [action, setAction] = useState<"delivered" | "cancelled" | "retake" | null>(null);
  const [reason, setReason] = useState("");
  const [feedback, setFeedback] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const supabase = createClient();

  const stops = [...(load.stops ?? [])].sort((a, b) => a.stop_order - b.stop_order);
  const receipts = load.receipts ?? [];
  const updates = [...(load.status_updates ?? [])].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  const hasPod = receipts.length > 0;

  // ── Submit review action (direct Supabase calls) ────────────────────
  async function handleSubmit() {
    if (!action) return;

    if (action === "cancelled" && reason.trim() === "") {
      toast.error("A cancel reason is required.");
      return;
    }
    if (action === "retake" && feedback.trim() === "") {
      toast.error("Feedback message is required for retake.");
      return;
    }

    setSubmitting(true);

    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) throw new Error("Not authenticated");

      if (action === "delivered") {
        // Mark load as delivered
        const { error } = await supabase
          .from("loads")
          .update({
            status: "delivered",
            reviewed_by: authUser.id,
            reviewed_at: new Date().toISOString(),
          })
          .eq("id", load.id);

        if (error) throw new Error(error.message);

        // Notify driver (best-effort — ignore errors)
        if (load.driver_id) {
          await supabase.from("notifications").insert({
            user_id: load.driver_id,
            title: "Load Delivered",
            body: `Load ${load.reference_number} has been marked as delivered.`,
            type: "load_delivered",
            data: { load_id: load.id },
          }).then(() => {});
        }
      } else if (action === "cancelled") {
        // Cancel the load
        const { error } = await supabase
          .from("loads")
          .update({
            status: "cancelled",
            cancel_reason: reason.trim(),
            reviewed_by: authUser.id,
            reviewed_at: new Date().toISOString(),
          })
          .eq("id", load.id);

        if (error) throw new Error(error.message);

        // Notify driver (best-effort)
        if (load.driver_id) {
          await supabase.from("notifications").insert({
            user_id: load.driver_id,
            title: "Load Cancelled",
            body: `Load ${load.reference_number} has been cancelled. Reason: ${reason.trim()}`,
            type: "load_cancelled",
            data: { load_id: load.id },
          }).then(() => {});
        }
      } else if (action === "retake") {
        // Request POD retake — load stays in 'empty'
        const { error } = await supabase
          .from("loads")
          .update({
            review_feedback: feedback.trim(),
            reviewed_by: authUser.id,
            reviewed_at: new Date().toISOString(),
          })
          .eq("id", load.id);

        if (error) throw new Error(error.message);

        // Notify driver (best-effort)
        if (load.driver_id) {
          await supabase.from("notifications").insert({
            user_id: load.driver_id,
            title: "POD Retake Requested",
            body: `Load ${load.reference_number}: ${feedback.trim()}`,
            type: "pod_retake",
            data: { load_id: load.id },
          }).then(() => {});
        }
      }

      const labels = {
        delivered: "marked as delivered",
        cancelled: "cancelled",
        retake: "sent back for POD retake",
      };

      toast.success(`Load ${load.reference_number} ${labels[action]}.`);
      onDone();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Something went wrong";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  function resetAction() {
    setAction(null);
    setReason("");
    setFeedback("");
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] p-0 gap-0">
        {/* ── Header ─────────────────────────────────────────────────── */}
        <DialogHeader className="px-6 pt-6 pb-4">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Package className="h-5 w-5 text-primary" />
            Review Load — {load.reference_number}
          </DialogTitle>
          <DialogDescription>
            Review this load&apos;s details and take action.
          </DialogDescription>
        </DialogHeader>

        <Separator />

        <ScrollArea className="max-h-[calc(90vh-200px)]">
          <div className="px-6 py-4 space-y-5">
            {/* ── Load details ─────────────────────────────────────────── */}
            <div className="grid grid-cols-2 gap-4">
              <DetailRow icon={<Truck className="h-4 w-4" />} label="Reference" value={load.reference_number} />
              <DetailRow
                icon={<UserIcon className="h-4 w-4" />}
                label="Driver"
                value={load.driver?.full_name ?? "Unassigned"}
              />
              <DetailRow
                icon={<UserIcon className="h-4 w-4" />}
                label="Dispatcher"
                value={load.dispatcher?.full_name ?? "—"}
              />
              <DetailRow
                icon={<Clock className="h-4 w-4" />}
                label="Dispatched"
                value={fmtDate(load.dispatched_at)}
              />
              {load.weight_lbs != null && (
                <DetailRow icon={<Package className="h-4 w-4" />} label="Weight" value={`${load.weight_lbs.toLocaleString()} lbs`} />
              )}
            </div>

            {load.special_instructions && (
              <div className="rounded-lg border bg-blue-50/50 p-3 dark:bg-blue-950/20">
                <p className="text-xs font-medium text-muted-foreground mb-1">Special Instructions</p>
                <p className="text-sm">{load.special_instructions}</p>
              </div>
            )}

            {/* ── Stops timeline ───────────────────────────────────────── */}
            <div>
              <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <MapPin className="h-4 w-4 text-primary" />
                Stops
              </h4>
              <div className="space-y-0">
                {stops.map((stop, idx) => {
                  const isPickup = stop.type === "pickup";
                  const dotColor = isPickup ? "bg-emerald-500" : "bg-red-500";
                  const isLast = idx === stops.length - 1;

                  return (
                    <div key={stop.id} className="flex gap-3">
                      {/* Timeline line */}
                      <div className="flex flex-col items-center">
                        <div className={`h-3 w-3 rounded-full ${dotColor} mt-1.5 ring-2 ring-white dark:ring-card`} />
                        {!isLast && <div className="w-0.5 flex-1 bg-border" />}
                      </div>

                      {/* Stop content */}
                      <div className={`pb-4 flex-1 ${isLast ? "" : ""}`}>
                        <div className="flex items-center gap-2">
                          <Badge variant={isPickup ? "success" : "destructive"} className="text-[10px] px-1.5 py-0">
                            {isPickup ? "Pickup" : "Delivery"}
                          </Badge>
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
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
                        <p className="text-sm font-medium mt-1">{stop.facility_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {stop.address}, {stop.city}, {stop.state} {stop.zip}
                        </p>
                        {(stop.arrival_at || stop.departure_at) && (
                          <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
                            {stop.arrival_at && <span>Arrived: {fmtDate(stop.arrival_at)}</span>}
                            {stop.departure_at && <span>Departed: {fmtDate(stop.departure_at)}</span>}
                          </div>
                        )}
                        {stop.notes && (
                          <p className="text-xs text-muted-foreground mt-1 italic">{stop.notes}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ── POD preview ──────────────────────────────────────────── */}
            <div>
              <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <FileImage className="h-4 w-4 text-primary" />
                Proof of Delivery
              </h4>
              {receipts.length === 0 ? (
                <div className="rounded-lg border border-dashed p-6 text-center text-muted-foreground">
                  <FileImage className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">No POD uploaded yet</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {receipts.map((r) => (
                    <div
                      key={r.id}
                      className="flex items-center justify-between rounded-lg border bg-white p-3 dark:bg-card"
                    >
                      <div className="flex items-center gap-3">
                        {r.no_pod_available ? (
                          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-amber-100 dark:bg-amber-900/30">
                            <AlertTriangle className="h-5 w-5 text-amber-600" />
                          </div>
                        ) : (
                          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-blue-100 dark:bg-blue-900/30">
                            <FileText className="h-5 w-5 text-blue-600" />
                          </div>
                        )}
                        <div>
                          <p className="text-sm font-medium">
                            {r.no_pod_available
                              ? "No POD Available (flagged by driver)"
                              : r.file_name ?? "POD Document"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {r.signed_by && `Signed by: ${r.signed_by} · `}
                            {fmtDate(r.created_at)}
                          </p>
                          {r.notes && (
                            <p className="text-xs text-muted-foreground italic mt-0.5">{r.notes}</p>
                          )}
                        </div>
                      </div>
                      {r.file_url && (
                        <Button variant="ghost" size="sm" asChild>
                          <a href={r.file_url} target="_blank" rel="noopener noreferrer" className="gap-1.5">
                            <ExternalLink className="h-3.5 w-3.5" />
                            View
                          </a>
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── Status history ────────────────────────────────────────── */}
            <div>
              <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <Clock className="h-4 w-4 text-primary" />
                Status History
              </h4>
              {updates.length === 0 ? (
                <p className="text-sm text-muted-foreground">No status changes recorded.</p>
              ) : (
                <div className="space-y-2">
                  {updates.map((u) => {
                    const prevConfig = u.previous_status ? STATUS_CONFIG[u.previous_status] : null;
                    const newConfig = STATUS_CONFIG[u.new_status];
                    return (
                      <div
                        key={u.id}
                        className="flex items-start gap-3 rounded-lg border p-2.5"
                      >
                        <div
                          className={`mt-1 h-2.5 w-2.5 rounded-full flex-shrink-0 ${
                            STATUS_TIMELINE_COLORS[u.new_status] ?? "bg-gray-400"
                          }`}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {prevConfig && (
                              <>
                                <Badge variant={prevConfig.variant} className="text-[10px] px-1.5 py-0">
                                  {prevConfig.label}
                                </Badge>
                                <ArrowRight className="h-3 w-3 text-muted-foreground" />
                              </>
                            )}
                            <Badge variant={newConfig.variant} className="text-[10px] px-1.5 py-0">
                              {newConfig.label}
                            </Badge>
                          </div>
                          {u.notes && (
                            <p className="text-xs text-muted-foreground mt-1 italic">{u.notes}</p>
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground whitespace-nowrap">
                          {fmtDate(u.created_at)}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ── Cancel reason (if exists) ─────────────────────────────── */}
            {load.cancel_reason && (
              <div className="rounded-lg border border-red-200 bg-red-50/50 p-3 dark:border-red-900 dark:bg-red-950/20">
                <p className="text-xs font-medium text-red-700 dark:text-red-300 mb-1">Cancel Reason</p>
                <p className="text-sm">{load.cancel_reason}</p>
              </div>
            )}

            {/* ── Review feedback (if exists) ──────────────────────────── */}
            {load.review_feedback && (
              <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3 dark:border-amber-900 dark:bg-amber-950/20">
                <p className="text-xs font-medium text-amber-700 dark:text-amber-300 mb-1">Previous Review Feedback</p>
                <p className="text-sm">{load.review_feedback}</p>
                {load.reviewed_at && (
                  <p className="text-xs text-muted-foreground mt-1">Sent: {fmtDate(load.reviewed_at)}</p>
                )}
              </div>
            )}

            <Separator />

            {/* ── Action buttons / forms ────────────────────────────────── */}
            {!action ? (
              <div>
                <h4 className="text-sm font-semibold mb-3">Admin Actions</h4>
                <div className="flex flex-wrap gap-3">
                  <Button
                    onClick={() => setAction("delivered")}
                    className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Mark Delivered
                  </Button>
                  <Button
                    onClick={() => setAction("cancelled")}
                    variant="destructive"
                    className="gap-2"
                  >
                    <XCircle className="h-4 w-4" />
                    Cancel Load
                  </Button>
                  <Button
                    onClick={() => setAction("retake")}
                    className="gap-2 bg-amber-500 hover:bg-amber-600 text-white"
                  >
                    <RotateCcw className="h-4 w-4" />
                    Request Retake
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Confirmation panel */}
                <Card
                  className={
                    action === "delivered"
                      ? "border-emerald-200 bg-emerald-50/50 dark:border-emerald-900 dark:bg-emerald-950/20"
                      : action === "cancelled"
                      ? "border-red-200 bg-red-50/50 dark:border-red-900 dark:bg-red-950/20"
                      : "border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/20"
                  }
                >
                  <CardContent className="p-4 space-y-3">
                    <h4 className="text-sm font-semibold flex items-center gap-2">
                      {action === "delivered" && (
                        <>
                          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                          <span className="text-emerald-700 dark:text-emerald-300">
                            Confirm Mark Delivered
                          </span>
                        </>
                      )}
                      {action === "cancelled" && (
                        <>
                          <XCircle className="h-4 w-4 text-red-600" />
                          <span className="text-red-700 dark:text-red-300">
                            Confirm Cancellation
                          </span>
                        </>
                      )}
                      {action === "retake" && (
                        <>
                          <RotateCcw className="h-4 w-4 text-amber-600" />
                          <span className="text-amber-700 dark:text-amber-300">
                            Request POD Retake
                          </span>
                        </>
                      )}
                    </h4>

                    {action === "delivered" && (
                      <p className="text-sm text-muted-foreground">
                        This will mark the load as <strong>delivered</strong>, set <code>completed_at</code>, and move it to history.
                        The driver will be notified.
                      </p>
                    )}

                    {action === "cancelled" && (
                      <>
                        <p className="text-sm text-muted-foreground mb-2">
                          Provide a reason for cancellation. The driver will be notified.
                        </p>
                        <Textarea
                          placeholder="Cancel reason (required)..."
                          value={reason}
                          onChange={(e) => setReason(e.target.value)}
                          rows={3}
                          className="bg-white dark:bg-card"
                        />
                      </>
                    )}

                    {action === "retake" && (
                      <>
                        <p className="text-sm text-muted-foreground mb-2">
                          Send feedback to the driver. The load stays in <strong>empty</strong> status for a new POD upload.
                        </p>
                        <Textarea
                          placeholder="Feedback message for the driver (required)..."
                          value={feedback}
                          onChange={(e) => setFeedback(e.target.value)}
                          rows={3}
                          className="bg-white dark:bg-card"
                        />
                      </>
                    )}

                    <div className="flex gap-2 pt-1">
                      <Button
                        onClick={handleSubmit}
                        disabled={submitting}
                        className={
                          action === "delivered"
                            ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                            : action === "cancelled"
                            ? "bg-red-600 hover:bg-red-700 text-white"
                            : "bg-amber-500 hover:bg-amber-600 text-white"
                        }
                      >
                        {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                        {action === "delivered" && "Confirm Delivery"}
                        {action === "cancelled" && "Confirm Cancel"}
                        {action === "retake" && "Send Retake Request"}
                      </Button>
                      <Button variant="outline" onClick={resetAction} disabled={submitting}>
                        Back
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Small detail row helper
// ---------------------------------------------------------------------------
function DetailRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2">
      <div className="mt-0.5 text-muted-foreground">{icon}</div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium">{value}</p>
      </div>
    </div>
  );
}
