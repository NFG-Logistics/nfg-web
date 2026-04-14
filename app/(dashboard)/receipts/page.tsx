"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/hooks/use-user";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Search, Loader2, FileImage, Download, FileText } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import type { Receipt, Truck, User } from "@/types";

interface ReceiptWithLoad extends Receipt {
  load?: { reference_number: string; status: string; driver_id?: string };
  uploader?: { full_name: string };
  driver?: { full_name: string };
  truck?: { truck_number: string };
  uploaded_by_user?: { full_name: string };
}

const RECEIPT_TYPE_LABELS: Record<string, string> = {
  fuel: "Fuel",
  road_service: "Road Service",
  toll: "Toll",
  lumper: "Lumper",
  other: "Other",
};

function receiptIsPdf(r: ReceiptWithLoad): boolean {
  const t = (r.file_type || "").toLowerCase();
  if (t.includes("pdf")) return true;
  const n = (r.file_name || r.file_url || "").toLowerCase();
  return n.endsWith(".pdf");
}

export default function ReceiptsPage() {
  const supabase = createClient();
  const { user: currentUser } = useUser();
  const canAddReceipt =
    currentUser?.role === "admin" || currentUser?.role === "dispatcher";

  const [receipts, setReceipts] = useState<ReceiptWithLoad[]>([]);
  const [drivers, setDrivers] = useState<Pick<User, "id" | "full_name">[]>([]);
  const [trucks, setTrucks] = useState<Pick<Truck, "id" | "truck_number">[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [driverFilter, setDriverFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [viewReceipt, setViewReceipt] = useState<ReceiptWithLoad | null>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [addSubmitting, setAddSubmitting] = useState(false);
  const [addDriverId, setAddDriverId] = useState<string>("");
  const [addReceiptType, setAddReceiptType] = useState<string>("fuel");
  const [addTruckId, setAddTruckId] = useState<string>("");
  const [addAmount, setAddAmount] = useState<string>("");
  const [addNotes, setAddNotes] = useState<string>("");
  const [addFile, setAddFile] = useState<File | null>(null);

  const fetchReceipts = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("receipts")
        .select(
          `*,
            load:load_id(reference_number, status, driver_id),
            uploaded_by_user:uploaded_by(full_name),
            truck:truck_id(truck_number)`
        )
        .in("receipt_type", ["fuel", "road_service"])
        .order("created_at", { ascending: false });

      if (error) {
        toast.error(error.message);
        setReceipts([]);
        return;
      }

      const { data: driversData } = await supabase
        .from("users")
        .select("id, full_name")
        .eq("role", "driver")
        .order("full_name");

      setDrivers(driversData || []);

      const enriched = (data || []).map((r) => {
        const receipt = r as unknown as ReceiptWithLoad;
        if (receipt.load?.driver_id && driversData) {
          const driver = driversData.find((d) => d.id === receipt.load?.driver_id);
          if (driver) receipt.driver = { full_name: driver.full_name };
        }
        return receipt;
      });

      setReceipts(enriched);
    } catch {
      toast.error("Failed to load receipts");
      setReceipts([]);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    fetchReceipts();
  }, [fetchReceipts]);

  useEffect(() => {
    if (!canAddReceipt) return;
    (async () => {
      const { data } = await supabase
        .from("trucks")
        .select("id, truck_number")
        .order("truck_number");
      setTrucks(data || []);
    })();
  }, [canAddReceipt, supabase]);

  const resetAddForm = () => {
    setAddDriverId("");
    setAddReceiptType("fuel");
    setAddTruckId("");
    setAddAmount("");
    setAddNotes("");
    setAddFile(null);
  };

  const handleAddReceipt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addDriverId) {
      toast.error("Select a driver");
      return;
    }
    if (!addFile) {
      toast.error("Attach an image or PDF");
      return;
    }
    const amountNum = parseFloat(addAmount);
    if (Number.isNaN(amountNum) || amountNum <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    if (addReceiptType === "road_service" && !addTruckId) {
      toast.error("Road service receipts require a truck");
      return;
    }

    const ext = addFile.name.split(".").pop()?.toLowerCase() || "bin";
    const allowed = ["jpg", "jpeg", "png", "webp", "heic", "pdf"];
    if (!allowed.includes(ext)) {
      toast.error("Use an image (JPG, PNG, …) or PDF");
      return;
    }

    setAddSubmitting(true);
    try {
      const folder = addReceiptType === "road_service" ? "road_service" : "fuel";
      const path = `${folder}/${addDriverId}/${Date.now()}.${ext}`;

      const { error: upErr } = await supabase.storage
        .from("receipts")
        .upload(path, addFile, { cacheControl: "3600", upsert: false });

      if (upErr) throw upErr;

      const {
        data: { publicUrl },
      } = supabase.storage.from("receipts").getPublicUrl(path);

      const mime =
        addFile.type ||
        (ext === "pdf" ? "application/pdf" : `image/${ext === "jpg" ? "jpeg" : ext}`);

      const { error: insErr } = await supabase.from("receipts").insert({
        uploaded_by: addDriverId,
        receipt_type: addReceiptType,
        amount: amountNum,
        notes: addNotes.trim() || null,
        truck_id: addReceiptType === "road_service" ? addTruckId : null,
        load_id: null,
        file_url: publicUrl,
        file_name: addFile.name,
        file_type: mime,
      });

      if (insErr) throw insErr;

      toast.success("Receipt added");
      setAddOpen(false);
      resetAddForm();
      fetchReceipts();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to add receipt";
      toast.error(msg);
    } finally {
      setAddSubmitting(false);
    }
  };

  const filtered = useMemo(() => {
    return receipts.filter((r) => {
      const matchesSearch =
        (r.uploaded_by_user as { full_name?: string } | undefined)?.full_name
          ?.toLowerCase()
          .includes(search.toLowerCase()) ||
        r.receipt_type?.toLowerCase().includes(search.toLowerCase()) ||
        r.file_name?.toLowerCase().includes(search.toLowerCase());

      const matchesDriver =
        driverFilter === "all" ||
        r.uploaded_by === driverFilter ||
        (r.uploaded_by_user as { full_name?: string } | undefined)?.full_name
          ?.toLowerCase()
          .includes(driverFilter.toLowerCase());

      const matchesType = typeFilter === "all" || r.receipt_type === typeFilter;

      const matchesDateRange =
        (!dateFrom || new Date(r.created_at) >= new Date(dateFrom)) &&
        (!dateTo || new Date(r.created_at) <= new Date(dateTo + "T23:59:59"));

      return matchesSearch && matchesDriver && matchesType && matchesDateRange;
    });
  }, [receipts, search, driverFilter, typeFilter, dateFrom, dateTo]);

  return (
    <div className="space-y-6">
      <PageHeader title="Receipts" description={`${filtered.length} of ${receipts.length} receipts`}>
        {canAddReceipt && (
          <Button
            onClick={() => {
              resetAddForm();
              setAddOpen(true);
            }}
          >
            Add receipt
          </Button>
        )}
      </PageHeader>

      <div className="flex flex-wrap gap-3">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search receipts..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={driverFilter} onValueChange={setDriverFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All Drivers" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Drivers</SelectItem>
            {drivers.map((d) => (
              <SelectItem key={d.id} value={d.id}>
                {d.full_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {Object.entries(RECEIPT_TYPE_LABELS).map(([key, label]) => (
              <SelectItem key={key} value={key}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2">
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="w-[140px]"
          />
          <span className="text-muted-foreground">to</span>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="w-[140px]"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">No receipts found</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((receipt) => (
            <Card
              key={receipt.id}
              className="cursor-pointer overflow-hidden transition-shadow hover:shadow-md"
              onClick={() => setViewReceipt(receipt)}
            >
              <div className="flex aspect-[4/3] items-center justify-center bg-muted">
                {receipt.file_url && !receiptIsPdf(receipt) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={receipt.file_url}
                    alt="Receipt"
                    className="h-full w-full object-cover"
                  />
                ) : receipt.file_url && receiptIsPdf(receipt) ? (
                  <div className="flex flex-col items-center gap-2 p-4 text-muted-foreground">
                    <FileText className="h-12 w-12" />
                    <span className="text-xs font-medium">PDF</span>
                  </div>
                ) : (
                  <FileImage className="h-10 w-10 text-muted-foreground" />
                )}
              </div>
              {receipt.receipt_type === "pod" ? null : (
                <CardContent className="p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm font-semibold">
                      {receipt.uploaded_by_user?.full_name || "Unknown Driver"}
                    </span>
                    {receipt.receipt_type && (
                      <Badge variant="outline" className="px-1.5 py-0.5 text-[10px]">
                        {RECEIPT_TYPE_LABELS[receipt.receipt_type] || receipt.receipt_type}
                      </Badge>
                    )}
                  </div>
                  {receipt.amount != null && (
                    <p className="mb-1 text-sm font-semibold text-primary">
                      $
                      {Number(receipt.amount).toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </p>
                  )}
                  {receipt.receipt_type === "road_service" && receipt.truck?.truck_number && (
                    <p className="text-xs text-muted-foreground">
                      Truck #{receipt.truck.truck_number}
                    </p>
                  )}
                  <p className="mt-1 text-xs text-muted-foreground">
                    {format(new Date(receipt.created_at), "MMM d, yyyy")}
                  </p>
                  {receipt.notes && (
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{receipt.notes}</p>
                  )}
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}

      <Dialog open={addOpen} onOpenChange={(o) => !addSubmitting && setAddOpen(o)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add receipt</DialogTitle>
            <DialogDescription>
              Upload on behalf of a driver. Image or PDF. Road service requires a truck.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAddReceipt} className="space-y-4">
            <div className="space-y-2">
              <Label>Driver *</Label>
              <Select value={addDriverId} onValueChange={setAddDriverId} required>
                <SelectTrigger>
                  <SelectValue placeholder="Select driver" />
                </SelectTrigger>
                <SelectContent>
                  {drivers.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Type *</Label>
              <Select value={addReceiptType} onValueChange={setAddReceiptType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(RECEIPT_TYPE_LABELS).map(([key, label]) => (
                    <SelectItem key={key} value={key}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {addReceiptType === "road_service" && (
              <div className="space-y-2">
                <Label>Truck *</Label>
                <Select value={addTruckId} onValueChange={setAddTruckId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select truck" />
                  </SelectTrigger>
                  <SelectContent>
                    {trucks.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.truck_number}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label>Amount ($) *</Label>
              <Input
                type="number"
                step="0.01"
                min="0.01"
                value={addAmount}
                onChange={(e) => setAddAmount(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Input value={addNotes} onChange={(e) => setAddNotes(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>File (image or PDF) *</Label>
              <Input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic,.pdf,application/pdf"
                onChange={(e) => setAddFile(e.target.files?.[0] ?? null)}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAddOpen(false)} disabled={addSubmitting}>
                Cancel
              </Button>
              <Button type="submit" disabled={addSubmitting}>
                {addSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!viewReceipt} onOpenChange={() => setViewReceipt(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Receipt — {viewReceipt?.uploaded_by_user?.full_name || "Unknown"}
            </DialogTitle>
          </DialogHeader>
          {viewReceipt && (
            <div className="space-y-4">
              {viewReceipt.file_url && !receiptIsPdf(viewReceipt) && (
                <div className="overflow-hidden rounded-md border">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={viewReceipt.file_url} alt="Receipt" className="w-full" />
                </div>
              )}
              {viewReceipt.file_url && receiptIsPdf(viewReceipt) && (
                <div className="h-[70vh] min-h-[320px] overflow-hidden rounded-md border">
                  <iframe
                    title="Receipt PDF"
                    src={viewReceipt.file_url}
                    className="h-full w-full"
                  />
                </div>
              )}

              {viewReceipt.receipt_type === "pod" ? null : (
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Driver</span>
                    <span className="font-medium">{viewReceipt.uploaded_by_user?.full_name || "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Receipt Type</span>
                    <span className="font-medium">
                      {viewReceipt.receipt_type
                        ? RECEIPT_TYPE_LABELS[viewReceipt.receipt_type] || viewReceipt.receipt_type
                        : "—"}
                    </span>
                  </div>
                  {viewReceipt.amount != null && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Amount</span>
                      <span className="font-medium text-primary">
                        $
                        {Number(viewReceipt.amount).toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </span>
                    </div>
                  )}
                  {viewReceipt.receipt_type === "road_service" && viewReceipt.truck?.truck_number && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Truck #</span>
                      <span className="font-medium">{viewReceipt.truck.truck_number}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Date</span>
                    <span>{format(new Date(viewReceipt.created_at), "MMM d, yyyy h:mm a")}</span>
                  </div>
                  {viewReceipt.notes && (
                    <div>
                      <span className="text-muted-foreground">Notes:</span>
                      <p className="mt-1 text-sm">{viewReceipt.notes}</p>
                    </div>
                  )}
                </div>
              )}

              {viewReceipt.file_url && (
                <Button asChild variant="outline" className="w-full">
                  <a href={viewReceipt.file_url} target="_blank" rel="noopener noreferrer">
                    <Download className="mr-2 h-4 w-4" />
                    {receiptIsPdf(viewReceipt) ? "Download PDF" : "Download"}
                  </a>
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
