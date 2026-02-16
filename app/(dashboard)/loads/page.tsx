"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/hooks/use-user";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { STATUS_CONFIG, PAYMENT_CONFIG } from "@/lib/constants";
import { Plus, Search, Loader2, Eye, XCircle } from "lucide-react";
import { toast } from "sonner";
import type { Load, User as UserType, LoadStatus, Stop, Truck, Trailer } from "@/types";

export default function LoadsPage() {
  const supabase = createClient();
  const { user } = useUser();
  const [loads, setLoads] = useState<(Load & { driver?: { full_name: string }; stops?: Stop[] })[]>([]);
  const [drivers, setDrivers] = useState<UserType[]>([]);
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [trailers, setTrailers] = useState<Trailer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [detailLoad, setDetailLoad] = useState<(Load & { driver?: { full_name: string }; stops?: Stop[] }) | null>(null);
  const [cancelLoad, setCancelLoad] = useState<Load | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const fetchLoads = useCallback(async () => {
    let query = supabase
      .from("loads")
      .select("*, driver:driver_id(full_name), stops(*)")
      .order("created_at", { ascending: false });

    if (statusFilter !== "all") query = query.eq("status", statusFilter);

    const { data } = await query;
    setLoads((data as any) || []);
    setLoading(false);
  }, [statusFilter]);

  useEffect(() => {
    fetchLoads();
    supabase.from("users").select("*").eq("role", "driver").eq("is_active", true).then(({ data }) => setDrivers(data || []));
    supabase.from("trucks").select("*").eq("is_active", true).then(({ data }) => setTrucks(data || []));
    supabase.from("trailers").select("*").eq("is_active", true).then(({ data }) => setTrailers(data || []));
  }, [fetchLoads]);

  const filtered = loads.filter((l) =>
    l.reference_number.toLowerCase().includes(search.toLowerCase()) ||
    (l.driver as any)?.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    l.commodity?.toLowerCase().includes(search.toLowerCase())
  );

  // Create load handler
  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitting(true);
    const fd = new FormData(e.currentTarget);

    const { data: load, error } = await supabase.from("loads").insert({
      company_id: user?.company_id,
      dispatcher_id: user?.id,
      driver_id: fd.get("driver_id") || null,
      truck_id: fd.get("truck_id") || null,
      trailer_id: fd.get("trailer_id") || null,
      commodity: fd.get("commodity"),
      rate: Number(fd.get("rate")) || 0,
      equipment_type: fd.get("equipment_type"),
      special_instructions: fd.get("special_instructions"),
    }).select().single();

    if (error) { toast.error(error.message); setSubmitting(false); return; }

    // Insert stops
    const pickupStop = {
      load_id: load.id, type: "pickup" as const, stop_order: 1,
      facility_name: fd.get("pickup_facility") as string,
      address: fd.get("pickup_address") as string,
      city: fd.get("pickup_city") as string,
      state: fd.get("pickup_state") as string,
      zip: fd.get("pickup_zip") as string,
    };
    const deliveryStop = {
      load_id: load.id, type: "delivery" as const, stop_order: 2,
      facility_name: fd.get("delivery_facility") as string,
      address: fd.get("delivery_address") as string,
      city: fd.get("delivery_city") as string,
      state: fd.get("delivery_state") as string,
      zip: fd.get("delivery_zip") as string,
    };

    await supabase.from("stops").insert([pickupStop, deliveryStop]);
    toast.success(`Load ${load.reference_number} created`);
    setCreateOpen(false);
    setSubmitting(false);
    fetchLoads();
  };

  // Cancel load handler
  const handleCancel = async () => {
    if (!cancelLoad || !cancelReason.trim()) return;
    setSubmitting(true);
    const { error } = await supabase
      .from("loads")
      .update({ status: "cancelled", cancel_reason: cancelReason.trim() })
      .eq("id", cancelLoad.id);

    if (error) { toast.error(error.message); } else { toast.success("Load cancelled"); }
    setCancelLoad(null);
    setCancelReason("");
    setSubmitting(false);
    fetchLoads();
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Loads" description="Manage all loads and shipments">
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" /> New Load</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create New Load</DialogTitle>
              <DialogDescription>Enter load details with pickup and delivery stops.</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Driver</Label>
                  <select name="driver_id" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                    <option value="">Unassigned</option>
                    {drivers.map((d) => <option key={d.id} value={d.id}>{d.full_name}</option>)}
                  </select>
                </div>
                <div className="space-y-2"><Label>Rate ($)</Label><Input name="rate" type="number" min="0" step="0.01" required /></div>
                <div className="space-y-2"><Label>Commodity</Label><Input name="commodity" /></div>
                <div className="space-y-2"><Label>Equipment</Label><Input name="equipment_type" placeholder="Dry Van, Reefer..." /></div>
                <div className="space-y-2">
                  <Label>Truck</Label>
                  <select name="truck_id" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                    <option value="">None</option>
                    {trucks.map((t) => <option key={t.id} value={t.id}>{t.truck_number}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Trailer</Label>
                  <select name="trailer_id" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                    <option value="">None</option>
                    {trailers.map((t) => <option key={t.id} value={t.id}>{t.trailer_number}</option>)}
                  </select>
                </div>
              </div>
              <div className="space-y-2"><Label>Special Instructions</Label><Textarea name="special_instructions" /></div>

              <div className="border-t pt-4"><h4 className="font-semibold mb-3">Pickup Stop</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2 space-y-2"><Label>Facility</Label><Input name="pickup_facility" required /></div>
                  <div className="col-span-2 space-y-2"><Label>Address</Label><Input name="pickup_address" required /></div>
                  <div className="space-y-2"><Label>City</Label><Input name="pickup_city" required /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2"><Label>State</Label><Input name="pickup_state" required maxLength={2} /></div>
                    <div className="space-y-2"><Label>ZIP</Label><Input name="pickup_zip" required /></div>
                  </div>
                </div>
              </div>
              <div className="border-t pt-4"><h4 className="font-semibold mb-3">Delivery Stop</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2 space-y-2"><Label>Facility</Label><Input name="delivery_facility" required /></div>
                  <div className="col-span-2 space-y-2"><Label>Address</Label><Input name="delivery_address" required /></div>
                  <div className="space-y-2"><Label>City</Label><Input name="delivery_city" required /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2"><Label>State</Label><Input name="delivery_state" required maxLength={2} /></div>
                    <div className="space-y-2"><Label>ZIP</Label><Input name="delivery_zip" required /></div>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button type="submit" disabled={submitting}>
                  {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Create Load
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </PageHeader>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search loads..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="All Statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
              <SelectItem key={key} value={key}>{cfg.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : filtered.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-16">No loads found</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Reference</TableHead>
                  <TableHead>Driver</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead>Commodity</TableHead>
                  <TableHead className="text-right">Rate</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((load) => {
                  const sCfg = STATUS_CONFIG[load.status as LoadStatus];
                  const pCfg = PAYMENT_CONFIG[load.payment_status];
                  return (
                    <TableRow key={load.id}>
                      <TableCell className="font-medium">{load.reference_number}</TableCell>
                      <TableCell>{(load.driver as any)?.full_name || "—"}</TableCell>
                      <TableCell><Badge variant={sCfg?.variant}>{sCfg?.label}</Badge></TableCell>
                      <TableCell><Badge variant={pCfg?.variant}>{pCfg?.label}</Badge></TableCell>
                      <TableCell>{load.commodity || "—"}</TableCell>
                      <TableCell className="text-right">${Number(load.rate).toLocaleString()}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => setDetailLoad(load)}><Eye className="h-4 w-4" /></Button>
                          {!["delivered", "cancelled"].includes(load.status) && (
                            <Button variant="ghost" size="icon" onClick={() => setCancelLoad(load)}><XCircle className="h-4 w-4 text-destructive" /></Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Detail Dialog */}
      <Dialog open={!!detailLoad} onOpenChange={() => setDetailLoad(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Load {detailLoad?.reference_number}</DialogTitle></DialogHeader>
          {detailLoad && (
            <div className="space-y-3 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Status</span><Badge variant={STATUS_CONFIG[detailLoad.status]?.variant}>{STATUS_CONFIG[detailLoad.status]?.label}</Badge></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Driver</span><span>{(detailLoad.driver as any)?.full_name || "Unassigned"}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Commodity</span><span>{detailLoad.commodity || "—"}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Rate</span><span className="font-semibold">${Number(detailLoad.rate).toLocaleString()}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Equipment</span><span>{detailLoad.equipment_type || "—"}</span></div>
              {detailLoad.special_instructions && <div><span className="text-muted-foreground">Notes:</span><p className="mt-1">{detailLoad.special_instructions}</p></div>}
              {detailLoad.cancel_reason && <div className="rounded-md bg-destructive/10 p-3"><span className="font-medium text-destructive">Cancel Reason:</span><p className="mt-1">{detailLoad.cancel_reason}</p></div>}
              {detailLoad.stops && detailLoad.stops.length > 0 && (
                <div className="border-t pt-3">
                  <h4 className="font-semibold mb-2">Stops</h4>
                  {detailLoad.stops.sort((a: Stop, b: Stop) => a.stop_order - b.stop_order).map((stop: Stop) => (
                    <div key={stop.id} className="flex items-start gap-2 py-1.5">
                      <Badge variant={stop.type === "pickup" ? "info" : "success"} className="mt-0.5 text-xs">{stop.type}</Badge>
                      <div><p className="font-medium">{stop.facility_name}</p><p className="text-muted-foreground">{stop.address}, {stop.city}, {stop.state} {stop.zip}</p></div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Cancel Dialog */}
      <Dialog open={!!cancelLoad} onOpenChange={() => { setCancelLoad(null); setCancelReason(""); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel Load {cancelLoad?.reference_number}</DialogTitle>
            <DialogDescription>This action cannot be undone. A reason is required.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Cancellation Reason</Label>
            <Textarea value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="Explain why this load is being cancelled..." required />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelLoad(null)}>Keep Load</Button>
            <Button variant="destructive" onClick={handleCancel} disabled={!cancelReason.trim() || submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Cancel Load
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
