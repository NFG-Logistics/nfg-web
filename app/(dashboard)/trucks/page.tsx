"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/hooks/use-user";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Search, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { Truck } from "@/types";

export default function TrucksPage() {
  const supabase = createClient();
  const { user } = useUser();
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTruck, setEditTruck] = useState<Truck | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const fetchTrucks = async () => {
    try {
      const { data, error } = await supabase.from("trucks").select("*").order("truck_number");
      if (error) { console.error("Failed to fetch trucks:", error); toast.error("Failed to load trucks: " + error.message); }
      setTrucks(data || []);
    } catch (err) {
      console.error("Trucks fetch exception:", err);
      toast.error("Connection error loading trucks");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchTrucks(); }, []);

  const filtered = trucks.filter((t) =>
    t.truck_number.toLowerCase().includes(search.toLowerCase()) ||
    t.make?.toLowerCase().includes(search.toLowerCase()) ||
    t.license_plate?.toLowerCase().includes(search.toLowerCase())
  );

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitting(true);
    const fd = new FormData(e.currentTarget);
    const payload = {
      company_id: user?.company_id,
      truck_number: fd.get("truck_number") as string,
      make: fd.get("make") as string || null,
      model: fd.get("model") as string || null,
      year: fd.get("year") ? Number(fd.get("year")) : null,
      vin: fd.get("vin") as string || null,
      license_plate: fd.get("license_plate") as string || null,
      is_active: true,
    };

    let error;
    if (editTruck) {
      ({ error } = await supabase.from("trucks").update(payload).eq("id", editTruck.id));
    } else {
      ({ error } = await supabase.from("trucks").insert(payload));
    }

    if (error) { toast.error(error.message); } else { toast.success(editTruck ? "Truck updated" : "Truck added"); }
    setDialogOpen(false);
    setEditTruck(null);
    setSubmitting(false);
    fetchTrucks();
  };

  const handleDelete = async (truck: Truck) => {
    if (!confirm(`Delete truck ${truck.truck_number}?`)) return;
    const { error } = await supabase.from("trucks").delete().eq("id", truck.id);
    if (error) toast.error(error.message); else { toast.success("Truck deleted"); fetchTrucks(); }
  };

  const openEdit = (truck: Truck) => { setEditTruck(truck); setDialogOpen(true); };
  const openCreate = () => { setEditTruck(null); setDialogOpen(true); };

  return (
    <div className="space-y-6">
      <PageHeader title="Trucks" description={`${trucks.length} trucks registered`}>
        <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" /> Add Truck</Button>
      </PageHeader>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search trucks..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : filtered.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-16">No trucks found</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Truck #</TableHead>
                  <TableHead>Make / Model</TableHead>
                  <TableHead>Year</TableHead>
                  <TableHead>License Plate</TableHead>
                  <TableHead>VIN</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((truck) => (
                  <TableRow key={truck.id}>
                    <TableCell className="font-medium">{truck.truck_number}</TableCell>
                    <TableCell>{[truck.make, truck.model].filter(Boolean).join(" ") || "—"}</TableCell>
                    <TableCell>{truck.year || "—"}</TableCell>
                    <TableCell>{truck.license_plate || "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{truck.vin || "—"}</TableCell>
                    <TableCell><Badge variant={truck.is_active ? "success" : "secondary"}>{truck.is_active ? "Active" : "Inactive"}</Badge></TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(truck)}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(truck)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) setEditTruck(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editTruck ? "Edit Truck" : "Add New Truck"}</DialogTitle>
            <DialogDescription>{editTruck ? "Update truck information." : "Register a new truck."}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Truck Number *</Label><Input name="truck_number" defaultValue={editTruck?.truck_number || ""} required /></div>
              <div className="space-y-2"><Label>Make</Label><Input name="make" defaultValue={editTruck?.make || ""} /></div>
              <div className="space-y-2"><Label>Model</Label><Input name="model" defaultValue={editTruck?.model || ""} /></div>
              <div className="space-y-2"><Label>Year</Label><Input name="year" type="number" defaultValue={editTruck?.year || ""} /></div>
              <div className="space-y-2"><Label>License Plate</Label><Input name="license_plate" defaultValue={editTruck?.license_plate || ""} /></div>
              <div className="space-y-2"><Label>VIN</Label><Input name="vin" defaultValue={editTruck?.vin || ""} /></div>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={submitting}>
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{editTruck ? "Update" : "Add"} Truck
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
