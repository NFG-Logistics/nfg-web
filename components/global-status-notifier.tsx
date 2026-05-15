"use client";

import { useEffect, useMemo, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/hooks/use-user";
import { STATUS_CONFIG } from "@/lib/constants";
import { toast } from "sonner";
import type { LoadStatus } from "@/types";

/**
 * Dashboard-wide notifier for driver status changes.
 *
 * Mounted once at the dashboard shell so it runs on every admin/dispatcher
 * page (Status Updates, Driver's Schedule, Reports, Settings, etc.). On every
 * INSERT into `status_updates` (the table populated by the `fn_log_status_update`
 * trigger whenever `loads.status` changes), it fires:
 *   • a Sonner toast — visible wherever the user is in the app
 *   • a browser desktop notification — visible even if the browser tab is
 *     in the background, provided the user has granted permission
 *
 * Notifications triggered by the *current* user (e.g. an admin manually
 * cancelling a load) are suppressed so dispatchers don't get pinged about
 * their own clicks.
 *
 * Requires `status_updates` (and `loads`) to be members of the
 * `supabase_realtime` publication — see `nfg-backend/supabase/fix-triggers.sql`.
 */
export function GlobalStatusNotifier() {
  const supabase = useMemo(() => createClient(), []);
  const { user, loading } = useUser();

  // Kept in a ref so the realtime callback always sees the latest id without
  // tearing down + recreating the channel on every render.
  const myUserIdRef = useRef<string | null>(null);
  myUserIdRef.current = user?.id ?? null;

  useEffect(() => {
    if (loading) return;
    if (!user) return;
    if (user.role !== "admin" && user.role !== "dispatcher") return;

    let cancelled = false;

    function sendBrowserNotification(title: string, body: string, tag: string) {
      if (typeof window === "undefined" || !("Notification" in window)) return;
      if (Notification.permission !== "granted") return;
      try {
        new Notification(title, { body, icon: "/logo.png", tag });
      } catch {
        // Silently ignore — some browsers throw if the page is not focused.
      }
    }

    function fire(title: string, body: string, tag: string) {
      toast.info(title, { description: body, duration: 8000 });
      sendBrowserNotification(title, body, tag);
    }

    // ── Driver status updates ─────────────────────────────────────────────
    // status_updates rows are emitted by the `fn_log_status_update` trigger
    // every time `loads.status` transitions, regardless of who did it.
    const channel = supabase
      .channel("global-status-notifier")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "status_updates" },
        async (payload) => {
          if (cancelled) return;
          const row = payload.new as {
            id: string;
            load_id: string;
            previous_status: LoadStatus | null;
            new_status: LoadStatus;
            changed_by: string | null;
          };
          // Skip echoes of the current user's own actions.
          if (row.changed_by && row.changed_by === myUserIdRef.current) return;

          // Pull the load reference + driver name to make the toast useful.
          const { data: load } = await supabase
            .from("loads")
            .select(
              "reference_number, driver:users!loads_driver_id_fkey(full_name)"
            )
            .eq("id", row.load_id)
            .maybeSingle();

          const loadRow = load as
            | {
                reference_number?: string | null;
                driver?: { full_name?: string | null } | null;
              }
            | null;
          const refNum = loadRow?.reference_number || "Load";
          const driverName = loadRow?.driver?.full_name || "Driver";

          const oldLabel = row.previous_status
            ? STATUS_CONFIG[row.previous_status]?.label ?? row.previous_status
            : null;
          const newLabel =
            STATUS_CONFIG[row.new_status]?.label ?? row.new_status;

          const title = `${driverName} · ${refNum}`;
          const body = oldLabel
            ? `${oldLabel} → ${newLabel}`
            : `Status: ${newLabel}`;

          fire(title, body, `status:${row.id}`);
        }
      )
      // ── New loads (dispatched by another dispatcher / admin) ────────────
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "loads" },
        async (payload) => {
          if (cancelled) return;
          const row = payload.new as {
            id: string;
            reference_number: string;
            driver_id: string | null;
            dispatcher_id: string | null;
            status: LoadStatus;
          };
          if (row.dispatcher_id && row.dispatcher_id === myUserIdRef.current)
            return;

          let driverName = "Unassigned driver";
          if (row.driver_id) {
            const { data: u } = await supabase
              .from("users")
              .select("full_name")
              .eq("id", row.driver_id)
              .maybeSingle();
            const uRow = u as { full_name?: string | null } | null;
            driverName = uRow?.full_name || driverName;
          }

          const cfg = STATUS_CONFIG[row.status];
          fire(
            `New Load · ${row.reference_number}`,
            `${driverName} · ${cfg?.label ?? row.status}`,
            `load:${row.id}`
          );
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [supabase, user, loading]);

  return null;
}
