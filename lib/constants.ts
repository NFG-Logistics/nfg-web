import type { LoadStatus } from "@/types";

export const STATUS_CONFIG: Record<LoadStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline" | "success" | "warning" | "info" }> = {
  pending_acceptance: { label: "Pending Acceptance", variant: "outline" },
  dispatched:       { label: "Dispatched",        variant: "info" },
  on_site_shipper:  { label: "On Site (Shipper)",  variant: "warning" },
  loaded:           { label: "Loaded",             variant: "default" },
  on_site_receiver: { label: "On Site (Receiver)", variant: "warning" },
  empty:            { label: "Empty",              variant: "secondary" },
  retake_requested: { label: "Retake Requested",   variant: "warning" },
  delivered:        { label: "Delivered",           variant: "success" },
  declined:         { label: "Declined",            variant: "destructive" },
  cancelled:        { label: "Cancelled",           variant: "destructive" },
};

export const PAYMENT_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" | "success" | "warning" | "info" }> = {
  unpaid:   { label: "Unpaid",   variant: "destructive" },
  invoiced: { label: "Invoiced", variant: "warning" },
  paid:     { label: "Paid",     variant: "success" },
};
