"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Search, Loader2, FileImage, AlertCircle, Download, Eye } from "lucide-react";
import { format } from "date-fns";
import type { Receipt } from "@/types";

interface ReceiptWithLoad extends Receipt {
  load?: { reference_number: string; status: string };
  uploader?: { full_name: string };
}

export default function ReceiptsPage() {
  const supabase = createClient();
  const [receipts, setReceipts] = useState<ReceiptWithLoad[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [viewReceipt, setViewReceipt] = useState<ReceiptWithLoad | null>(null);

  useEffect(() => {
    async function fetchReceipts() {
      try {
        const { data, error } = await supabase
          .from("receipts")
          .select("*, load:load_id(reference_number, status), uploader:uploaded_by(full_name)")
          .order("created_at", { ascending: false });
        if (error) console.error("Failed to fetch receipts:", error);
        setReceipts((data as any) || []);
      } catch (err) {
        console.error("Receipts fetch exception:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchReceipts();
  }, []);

  const filtered = receipts.filter((r) =>
    (r.load as any)?.reference_number?.toLowerCase().includes(search.toLowerCase()) ||
    r.signed_by?.toLowerCase().includes(search.toLowerCase()) ||
    r.file_name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <PageHeader title="Receipts" description={`${receipts.length} receipts uploaded`} />

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search receipts..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-16">No receipts found</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((receipt) => (
            <Card key={receipt.id} className="overflow-hidden cursor-pointer hover:shadow-md transition-shadow" onClick={() => setViewReceipt(receipt)}>
              <div className="aspect-[4/3] bg-muted flex items-center justify-center">
                {receipt.file_url ? (
                  <img src={receipt.file_url} alt="POD" className="w-full h-full object-cover" />
                ) : receipt.no_pod_available ? (
                  <div className="text-center p-4">
                    <AlertCircle className="h-8 w-8 text-amber-500 mx-auto mb-2" />
                    <p className="text-xs text-muted-foreground">No POD Available</p>
                  </div>
                ) : (
                  <FileImage className="h-10 w-10 text-muted-foreground" />
                )}
              </div>
              <CardContent className="p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-semibold">{(receipt.load as any)?.reference_number || "—"}</span>
                  {receipt.no_pod_available ? (
                    <Badge variant="warning" className="text-xs">No POD</Badge>
                  ) : (
                    <Badge variant="success" className="text-xs">POD</Badge>
                  )}
                </div>
                {receipt.signed_by && <p className="text-xs text-muted-foreground">Signed by: {receipt.signed_by}</p>}
                <p className="text-xs text-muted-foreground mt-1">
                  {format(new Date(receipt.created_at), "MMM d, yyyy")}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* View Dialog */}
      <Dialog open={!!viewReceipt} onOpenChange={() => setViewReceipt(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Receipt — {(viewReceipt?.load as any)?.reference_number}</DialogTitle>
          </DialogHeader>
          {viewReceipt && (
            <div className="space-y-4">
              {viewReceipt.file_url ? (
                <div className="rounded-md overflow-hidden border">
                  <img src={viewReceipt.file_url} alt="POD" className="w-full" />
                </div>
              ) : viewReceipt.no_pod_available ? (
                <div className="rounded-md border p-8 text-center">
                  <AlertCircle className="h-10 w-10 text-amber-500 mx-auto mb-2" />
                  <p className="text-sm font-medium">No POD Available</p>
                  <p className="text-xs text-muted-foreground mt-1">Driver marked this load as having no POD</p>
                </div>
              ) : null}

              <div className="space-y-2 text-sm">
                {viewReceipt.signed_by && (
                  <div className="flex justify-between"><span className="text-muted-foreground">Signed By</span><span className="font-medium">{viewReceipt.signed_by}</span></div>
                )}
                <div className="flex justify-between"><span className="text-muted-foreground">Uploaded By</span><span>{(viewReceipt.uploader as any)?.full_name || "—"}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Upload Date</span><span>{format(new Date(viewReceipt.created_at), "MMM d, yyyy h:mm a")}</span></div>
                {viewReceipt.notes && <div><span className="text-muted-foreground">Notes:</span><p className="mt-1">{viewReceipt.notes}</p></div>}
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
