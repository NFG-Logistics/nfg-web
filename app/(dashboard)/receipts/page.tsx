"use client";

import { useEffect, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Search, Loader2, FileImage, AlertCircle, Download, Eye, Calendar } from "lucide-react";
import { format } from "date-fns";
import type { Receipt, User } from "@/types";

interface ReceiptWithLoad extends Receipt {
  load?: { reference_number: string; status: string };
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

export default function ReceiptsPage() {
  const supabase = createClient();
  const [receipts, setReceipts] = useState<ReceiptWithLoad[]>([]);
  const [drivers, setDrivers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [driverFilter, setDriverFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [viewReceipt, setViewReceipt] = useState<ReceiptWithLoad | null>(null);

  useEffect(() => {
    async function fetchReceipts() {
      try {
        const { data, error } = await supabase
          .from("receipts")
          .select(
            `*,
            load:load_id(reference_number, status, driver_id),
            uploaded_by_user:uploaded_by(full_name),
            truck:truck_id(truck_number)`
          )
          .order("created_at", { ascending: false });

        if (error) console.error("Failed to fetch receipts:", error);

        // Fetch drivers for filter
        const { data: driversData } = await supabase
          .from("users")
          .select("id, full_name")
          .eq("role", "driver")
          .order("full_name");

        setDrivers(driversData || []);

        // Enrich receipts with driver info
        const enriched = (data || []).map((r: any) => {
          const receipt = r as ReceiptWithLoad;
          if (receipt.load?.driver_id) {
            const driver = driversData?.find((d) => d.id === receipt.load?.driver_id);
            if (driver) {
              receipt.driver = { full_name: driver.full_name };
            }
          }
          return receipt;
        });

        setReceipts(enriched);
      } catch (err) {
        console.error("Receipts fetch exception:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchReceipts();
  }, []);

  const filtered = useMemo(() => {
    return receipts.filter((r) => {
      const matchesSearch =
        (r.uploaded_by_user as any)?.full_name?.toLowerCase().includes(search.toLowerCase()) ||
        r.receipt_type?.toLowerCase().includes(search.toLowerCase()) ||
        r.file_name?.toLowerCase().includes(search.toLowerCase());
      
      const matchesDriver =
        driverFilter === "all" ||
        r.uploaded_by === driverFilter ||
        (r.uploaded_by_user as any)?.full_name?.toLowerCase().includes(driverFilter.toLowerCase());

      const matchesType = typeFilter === "all" || r.receipt_type === typeFilter;

      const matchesDateRange =
        (!dateFrom || new Date(r.created_at) >= new Date(dateFrom)) &&
        (!dateTo || new Date(r.created_at) <= new Date(dateTo + "T23:59:59"));

      return matchesSearch && matchesDriver && matchesType && matchesDateRange;
    });
  }, [receipts, search, driverFilter, typeFilter, dateFrom, dateTo]);

  return (
    <div className="space-y-6">
      <PageHeader title="Receipts" description={`${filtered.length} of ${receipts.length} receipts`} />

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search receipts..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
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
              <SelectItem key={key} value={key}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2">
          <Input
            type="date"
            placeholder="From"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="w-[140px]"
          />
          <span className="text-muted-foreground">to</span>
          <Input
            type="date"
            placeholder="To"
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
        <p className="text-center text-sm text-muted-foreground py-16">No receipts found</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((receipt) => (
            <Card key={receipt.id} className="overflow-hidden cursor-pointer hover:shadow-md transition-shadow" onClick={() => setViewReceipt(receipt)}>
              <div className="aspect-[4/3] bg-muted flex items-center justify-center">
                {receipt.file_url ? (
                  <img src={receipt.file_url} alt="Receipt" className="w-full h-full object-cover" />
                ) : (
                  <FileImage className="h-10 w-10 text-muted-foreground" />
                )}
              </div>
              <CardContent className="p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold">
                    {receipt.uploaded_by_user?.full_name || "Unknown Driver"}
                  </span>
                  {receipt.receipt_type && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0.5">
                      {RECEIPT_TYPE_LABELS[receipt.receipt_type] || receipt.receipt_type}
                    </Badge>
                  )}
                </div>
                {receipt.amount && (
                  <p className="text-sm font-semibold text-primary mb-1">
                    ${Number(receipt.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                )}
                {receipt.receipt_type === "road_service" && receipt.truck?.truck_number && (
                  <p className="text-xs text-muted-foreground">Truck #{receipt.truck.truck_number}</p>
                )}
                <p className="text-xs text-muted-foreground mt-1">
                  {format(new Date(receipt.created_at), "MMM d, yyyy")}
                </p>
                {receipt.notes && (
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{receipt.notes}</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* View Dialog */}
      <Dialog open={!!viewReceipt} onOpenChange={() => setViewReceipt(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Receipt — {viewReceipt?.uploaded_by_user?.full_name || "Unknown"}</DialogTitle>
          </DialogHeader>
          {viewReceipt && (
            <div className="space-y-4">
              {viewReceipt.file_url && (
                <div className="rounded-md overflow-hidden border">
                  <img src={viewReceipt.file_url} alt="Receipt" className="w-full" />
                </div>
              )}

              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Driver</span>
                  <span className="font-medium">{viewReceipt.uploaded_by_user?.full_name || "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Receipt Type</span>
                  <span className="font-medium">
                    {viewReceipt.receipt_type ? RECEIPT_TYPE_LABELS[viewReceipt.receipt_type] : "—"}
                  </span>
                </div>
                {viewReceipt.amount && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Amount</span>
                    <span className="font-medium text-primary">
                      ${Number(viewReceipt.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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

              {viewReceipt.file_url && (
                <Button asChild variant="outline" className="w-full">
                  <a href={viewReceipt.file_url} target="_blank" rel="noopener noreferrer">
                    <Download className="mr-2 h-4 w-4" /> Download POD
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
