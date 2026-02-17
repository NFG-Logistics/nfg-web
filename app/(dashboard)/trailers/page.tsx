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
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Search, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { Trailer } from "@/types";

export default function TrailersPage() {
  const supabase = createClient();
  const { user } = useUser();
  const [trailers, setTrailers] = useState<Trailer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTrailer, setEditTrailer] = useState<Trailer | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const fetchTrailers = async () => {
    try {
      const { data, error } = await supabase.from("trailers").select("*").order("trailer_number");
      if (error) { console.error("Failed to fetch trailers:", error); toast.error("Failed to load trailers: " + error.message); }
      setTrailers(data || []);
    } catch (err) {
      console.error("Trailers fetch exception:", err);
      toast.error("Connection error loading trailers");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchTrailers(); }, []);

  const filtered = trailers.filter((t) =>
    t.trailer_number.toLowerCase().includes(search.toLowerCase()) ||
    t.trailer_type?.toLowerCase().includes(search.toLowerCase()) ||
    t.license_plate?.toLowerCase().includes(search.toLowerCase())
  );

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitting(true);
    const fd = new FormData(e.currentTarget);
    const payload = {
      company_id: user?.company_id,
      trailer_number: fd.get("trailer_number") as string,
      trailer_type: fd.get("trailer_type") as string || null,
      length_ft: fd.get("length_ft") ? Number(fd.get("length_ft")) : null,
      license_plate: fd.get("license_plate") as string || null,
      is_active: true,
    };

    let error;
    if (editTrailer) {
      ({ error } = await supabase.from("trailers").update(payload).eq("id", editTrailer.id));
    } else {
      ({ error } = await supabase.from("trailers").insert(payload));
    }

    if (error) { toast.error(error.message); } else { toast.success(editTrailer ? "Trailer updated" : "Trailer added"); }
    setDialogOpen(false);
    setEditTrailer(null);
    setSubmitting(false);
    fetchTrailers();
  };

  const handleDelete = async (trailer: Trailer) => {
    if (!confirm(`Delete trailer ${trailer.trailer_number}?`)) return;
    const { error } = await supabase.from("trailers").delete().eq("id", trailer.id);
    if (error) toast.error(error.message); else { toast.success("Trailer deleted"); fetchTrailers(); }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Trailers" description={`${trailers.length} trailers registered`}>
        <Button onClick={() => { setEditTrailer(null); setDialogOpen(true); }}><Plus className="mr-2 h-4 w-4" /> Add Trailer</Button>
      </PageHeader>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search trailers..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : filtered.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-16">No trailers found</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Trailer #</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Length (ft)</TableHead>
                  <TableHead>License Plate</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((trailer) => (
                  <TableRow key={trailer.id}>
                    <TableCell className="font-medium">{trailer.trailer_number}</TableCell>
                    <TableCell>{trailer.trailer_type || "—"}</TableCell>
                    <TableCell>{trailer.length_ft ? `${trailer.length_ft}'` : "—"}</TableCell>
                    <TableCell>{trailer.license_plate || "—"}</TableCell>
                    <TableCell><Badge variant={trailer.is_active ? "success" : "secondary"}>{trailer.is_active ? "Active" : "Inactive"}</Badge></TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => { setEditTrailer(trailer); setDialogOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(trailer)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) setEditTrailer(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editTrailer ? "Edit Trailer" : "Add New Trailer"}</DialogTitle>
            <DialogDescription>{editTrailer ? "Update trailer information." : "Register a new trailer."}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Trailer Number *</Label><Input name="trailer_number" defaultValue={editTrailer?.trailer_number || ""} required /></div>
              <div className="space-y-2"><Label>Type</Label><Input name="trailer_type" defaultValue={editTrailer?.trailer_type || ""} placeholder="Dry Van, Reefer, Flatbed..." /></div>
              <div className="space-y-2"><Label>Length (ft)</Label><Input name="length_ft" type="number" defaultValue={editTrailer?.length_ft || ""} /></div>
              <div className="space-y-2"><Label>License Plate</Label><Input name="license_plate" defaultValue={editTrailer?.license_plate || ""} /></div>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={submitting}>
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{editTrailer ? "Update" : "Add"} Trailer
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
