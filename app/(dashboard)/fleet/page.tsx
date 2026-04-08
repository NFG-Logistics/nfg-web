"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/hooks/use-user";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Pencil, Trash2, Search, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { Truck, Trailer } from "@/types";

export default function FleetPage() {
  const supabase = createClient();
  const { user } = useUser();
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [trailers, setTrailers] = useState<Trailer[]>([]);
  const [loading, setLoading] = useState(true);
  const [truckSearch, setTruckSearch] = useState("");
  const [trailerSearch, setTrailerSearch] = useState("");
  const [truckDialogOpen, setTruckDialogOpen] = useState(false);
  const [trailerDialogOpen, setTrailerDialogOpen] = useState(false);
  const [editTruck, setEditTruck] = useState<Truck | null>(null);
  const [editTrailer, setEditTrailer] = useState<Trailer | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const fetchFleet = async () => {
    try {
      // Fetch trucks with assigned loads
      const { data: trucksData, error: trucksErr } = await supabase
        .from("trucks")
        .select("*")
        .order("truck_number");

      if (trucksErr) throw trucksErr;

      // Fetch trailers with assigned loads
      const { data: trailersData, error: trailersErr } = await supabase
        .from("trailers")
        .select("*")
        .order("trailer_number");

      if (trailersErr) throw trailersErr;

      setTrucks(trucksData || []);
      setTrailers(trailersData || []);
    } catch (err) {
      console.error("Fleet fetch exception:", err);
      toast.error("Failed to load fleet data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFleet();
  }, []);

  const filteredTrucks = trucks.filter(
    (t) =>
      t.truck_number.toLowerCase().includes(truckSearch.toLowerCase()) ||
      t.make?.toLowerCase().includes(truckSearch.toLowerCase()) ||
      t.license_plate?.toLowerCase().includes(truckSearch.toLowerCase())
  );

  const filteredTrailers = trailers.filter(
    (t) =>
      t.trailer_number.toLowerCase().includes(trailerSearch.toLowerCase()) ||
      t.trailer_type?.toLowerCase().includes(trailerSearch.toLowerCase()) ||
      t.license_plate?.toLowerCase().includes(trailerSearch.toLowerCase())
  );

  const handleTruckSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
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
      maintenance_status: fd.get("maintenance_status") as string || "available",
      maintenance_notes: fd.get("maintenance_notes") as string || null,
      last_service_date: fd.get("last_service_date") as string || null,
      is_active: true,
    };

    let error;
    if (editTruck) {
      ({ error } = await supabase.from("trucks").update(payload).eq("id", editTruck.id));
    } else {
      ({ error } = await supabase.from("trucks").insert(payload));
    }

    if (error) {
      toast.error(error.message);
    } else {
      toast.success(editTruck ? "Truck updated" : "Truck added");
    }
    setTruckDialogOpen(false);
    setEditTruck(null);
    setSubmitting(false);
    fetchFleet();
  };

  const handleTrailerSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitting(true);
    const fd = new FormData(e.currentTarget);
    const payload = {
      company_id: user?.company_id,
      trailer_number: fd.get("trailer_number") as string,
      trailer_type: fd.get("trailer_type") as string || null,
      length_ft: fd.get("length_ft") ? Number(fd.get("length_ft")) : null,
      license_plate: fd.get("license_plate") as string || null,
      maintenance_status: fd.get("maintenance_status") as string || "available",
      maintenance_notes: fd.get("maintenance_notes") as string || null,
      last_service_date: fd.get("last_service_date") as string || null,
      is_active: true,
    };

    let error;
    if (editTrailer) {
      ({ error } = await supabase.from("trailers").update(payload).eq("id", editTrailer.id));
    } else {
      ({ error } = await supabase.from("trailers").insert(payload));
    }

    if (error) {
      toast.error(error.message);
    } else {
      toast.success(editTrailer ? "Trailer updated" : "Trailer added");
    }
    setTrailerDialogOpen(false);
    setEditTrailer(null);
    setSubmitting(false);
    fetchFleet();
  };

  const handleTruckDelete = async (truck: Truck) => {
    if (!confirm(`Delete truck ${truck.truck_number}?`)) return;
    const { error } = await supabase.from("trucks").delete().eq("id", truck.id);
    if (error) toast.error(error.message);
    else {
      toast.success("Truck deleted");
      fetchFleet();
    }
  };

  const handleTrailerDelete = async (trailer: Trailer) => {
    if (!confirm(`Delete trailer ${trailer.trailer_number}?`)) return;
    const { error } = await supabase.from("trailers").delete().eq("id", trailer.id);
    if (error) toast.error(error.message);
    else {
      toast.success("Trailer deleted");
      fetchFleet();
    }
  };

  const toggleMaintenance = async (type: "truck" | "trailer", id: string, currentStatus: string) => {
    const newStatus = currentStatus === "available" ? "in_service" : "available";
    const table = type === "truck" ? "trucks" : "trailers";
    const { error } = await supabase.from(table).update({ maintenance_status: newStatus }).eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success(`${type === "truck" ? "Truck" : "Trailer"} maintenance status updated`);
      fetchFleet();
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Fleet Management" description={`${trucks.length} trucks · ${trailers.length} trailers`} />

      <Tabs defaultValue="trucks" className="space-y-4">
        <TabsList>
          <TabsTrigger value="trucks">Trucks ({trucks.length})</TabsTrigger>
          <TabsTrigger value="trailers">Trailers ({trailers.length})</TabsTrigger>
        </TabsList>

        {/* Trucks Tab */}
        <TabsContent value="trucks">
          <div className="flex items-center justify-between mb-4">
            <div className="relative max-w-sm flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search trucks..."
                value={truckSearch}
                onChange={(e) => setTruckSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button onClick={() => { setEditTruck(null); setTruckDialogOpen(true); }}>
              <Plus className="mr-2 h-4 w-4" /> Add Truck
            </Button>
          </div>

          <Card>
            <CardContent className="p-0">
              {loading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : filteredTrucks.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-16">No trucks found</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Truck #</TableHead>
                      <TableHead>Make / Model</TableHead>
                      <TableHead>Year</TableHead>
                      <TableHead>License Plate</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Maintenance Notes</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredTrucks.map((truck) => (
                      <TableRow key={truck.id}>
                        <TableCell className="font-medium">{truck.truck_number}</TableCell>
                        <TableCell>{[truck.make, truck.model].filter(Boolean).join(" ") || "—"}</TableCell>
                        <TableCell>{truck.year || "—"}</TableCell>
                        <TableCell>{truck.license_plate || "—"}</TableCell>
                        <TableCell>
                          <Badge
                            variant={truck.maintenance_status === "in_service" ? "destructive" : "success"}
                            className="cursor-pointer"
                            onClick={() => toggleMaintenance("truck", truck.id, truck.maintenance_status || "available")}
                          >
                            {truck.maintenance_status === "in_service" ? "In Service" : "Available"}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-[220px]">
                          <span
                            className="line-clamp-2 text-sm text-muted-foreground"
                            title={truck.maintenance_notes || undefined}
                          >
                            {truck.maintenance_notes?.trim() || "—"}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon" onClick={() => { setEditTruck(truck); setTruckDialogOpen(true); }}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => handleTruckDelete(truck)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Trailers Tab */}
        <TabsContent value="trailers">
          <div className="flex items-center justify-between mb-4">
            <div className="relative max-w-sm flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search trailers..."
                value={trailerSearch}
                onChange={(e) => setTrailerSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button onClick={() => { setEditTrailer(null); setTrailerDialogOpen(true); }}>
              <Plus className="mr-2 h-4 w-4" /> Add Trailer
            </Button>
          </div>

          <Card>
            <CardContent className="p-0">
              {loading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : filteredTrailers.length === 0 ? (
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
                      <TableHead>Maintenance Notes</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredTrailers.map((trailer) => (
                      <TableRow key={trailer.id}>
                        <TableCell className="font-medium">{trailer.trailer_number}</TableCell>
                        <TableCell>{trailer.trailer_type || "—"}</TableCell>
                        <TableCell>{trailer.length_ft ? `${trailer.length_ft}'` : "—"}</TableCell>
                        <TableCell>{trailer.license_plate || "—"}</TableCell>
                        <TableCell>
                          <Badge
                            variant={trailer.maintenance_status === "in_service" ? "destructive" : "success"}
                            className="cursor-pointer"
                            onClick={() => toggleMaintenance("trailer", trailer.id, trailer.maintenance_status || "available")}
                          >
                            {trailer.maintenance_status === "in_service" ? "In Service" : "Available"}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-[220px]">
                          <span
                            className="line-clamp-2 text-sm text-muted-foreground"
                            title={trailer.maintenance_notes || undefined}
                          >
                            {trailer.maintenance_notes?.trim() || "—"}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon" onClick={() => { setEditTrailer(trailer); setTrailerDialogOpen(true); }}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => handleTrailerDelete(trailer)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Truck Dialog */}
      <Dialog open={truckDialogOpen} onOpenChange={(o) => { setTruckDialogOpen(o); if (!o) setEditTruck(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editTruck ? "Edit Truck" : "Add New Truck"}</DialogTitle>
            <DialogDescription>{editTruck ? "Update truck information." : "Register a new truck."}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleTruckSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Truck Number *</Label>
                <Input name="truck_number" defaultValue={editTruck?.truck_number || ""} required />
              </div>
              <div className="space-y-2">
                <Label>Make</Label>
                <Input name="make" defaultValue={editTruck?.make || ""} />
              </div>
              <div className="space-y-2">
                <Label>Model</Label>
                <Input name="model" defaultValue={editTruck?.model || ""} />
              </div>
              <div className="space-y-2">
                <Label>Year</Label>
                <Input name="year" type="number" defaultValue={editTruck?.year || ""} />
              </div>
              <div className="space-y-2">
                <Label>License Plate</Label>
                <Input name="license_plate" defaultValue={editTruck?.license_plate || ""} />
              </div>
              <div className="space-y-2">
                <Label>VIN</Label>
                <Input name="vin" defaultValue={editTruck?.vin || ""} />
              </div>
              <div className="space-y-2">
                <Label>Status (available / in service)</Label>
                <Select name="maintenance_status" defaultValue={editTruck?.maintenance_status || "available"}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="available">Available</SelectItem>
                    <SelectItem value="in_service">In Service</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Last Service Date</Label>
                <Input name="last_service_date" type="date" defaultValue={editTruck?.last_service_date || ""} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Maintenance Notes</Label>
              <textarea
                name="maintenance_notes"
                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                defaultValue={editTruck?.maintenance_notes || ""}
              />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={submitting}>
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editTruck ? "Update" : "Add"} Truck
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Trailer Dialog */}
      <Dialog open={trailerDialogOpen} onOpenChange={(o) => { setTrailerDialogOpen(o); if (!o) setEditTrailer(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editTrailer ? "Edit Trailer" : "Add New Trailer"}</DialogTitle>
            <DialogDescription>{editTrailer ? "Update trailer information." : "Register a new trailer."}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleTrailerSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Trailer Number *</Label>
                <Input name="trailer_number" defaultValue={editTrailer?.trailer_number || ""} required />
              </div>
              <div className="space-y-2">
                <Label>Type</Label>
                <Input name="trailer_type" defaultValue={editTrailer?.trailer_type || ""} placeholder="Dry Van, Reefer, Flatbed..." />
              </div>
              <div className="space-y-2">
                <Label>Length (ft)</Label>
                <Input name="length_ft" type="number" defaultValue={editTrailer?.length_ft || ""} />
              </div>
              <div className="space-y-2">
                <Label>License Plate</Label>
                <Input name="license_plate" defaultValue={editTrailer?.license_plate || ""} />
              </div>
              <div className="space-y-2">
                <Label>Status (available / in service)</Label>
                <Select name="maintenance_status" defaultValue={editTrailer?.maintenance_status || "available"}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="available">Available</SelectItem>
                    <SelectItem value="in_service">In Service</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Last Service Date</Label>
                <Input name="last_service_date" type="date" defaultValue={editTrailer?.last_service_date || ""} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Maintenance Notes</Label>
              <textarea
                name="maintenance_notes"
                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                defaultValue={editTrailer?.maintenance_notes || ""}
              />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={submitting}>
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editTrailer ? "Update" : "Add"} Trailer
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
