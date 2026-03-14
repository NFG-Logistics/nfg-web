"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/hooks/use-user";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Search, Loader2, Plus, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import type { User as UserType, Load, LoadStatus, Truck, Trailer } from "@/types";
import { STATUS_CONFIG } from "@/lib/constants";

interface DriverWithLoad extends UserType {
  active_load?: Load | null;
}

export default function DriversPage() {
  const supabase = createClient();
  const { user: currentUser } = useUser();
  const [drivers, setDrivers] = useState<DriverWithLoad[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [availabilityFilter, setAvailabilityFilter] = useState<string>("all");

  // Create Driver modal state
  const [createOpen, setCreateOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [trailers, setTrailers] = useState<Trailer[]>([]);
  const [selectedTruck, setSelectedTruck] = useState<string>("none");
  const [selectedTrailer, setSelectedTrailer] = useState<string>("none");

  const fetchDrivers = useCallback(async () => {
    try {
      let query = supabase
        .from("users")
        .select("*")
        .eq("role", "driver");

      if (availabilityFilter === "available") {
        query = query.eq("availability_status", "available");
      } else if (availabilityFilter === "unavailable") {
        query = query.neq("availability_status", "available");
      }

      const { data: driverData, error: driverErr } = await query.order("full_name");
      if (driverErr) console.error("Failed to fetch drivers:", driverErr);

      const { data: activeLoads, error: loadsErr } = await supabase
        .from("loads")
        .select("id, reference_number, status, driver_id")
        .not("status", "in", '("delivered","cancelled","declined")');

      if (loadsErr) console.error("Failed to fetch active loads:", loadsErr);

      const driverMap = new Map<string, Load>();
      (activeLoads || []).forEach((l) => {
        if (l.driver_id) driverMap.set(l.driver_id, l as Load);
      });

      const enriched = (driverData || []).map((d) => ({
        ...d,
        active_load: driverMap.get(d.id) || null,
      }));

      setDrivers(enriched);
    } catch (err) {
      console.error("Drivers fetch exception:", err);
    } finally {
      setLoading(false);
    }
  }, [availabilityFilter, supabase]);

  useEffect(() => {
    fetchDrivers();
  }, [fetchDrivers]);

  // Fetch trucks & trailers for the create modal
  const fetchFleetOptions = useCallback(async () => {
    const [trucksRes, trailersRes] = await Promise.all([
      supabase.from("trucks").select("*").eq("is_active", true).order("truck_number"),
      supabase.from("trailers").select("*").eq("is_active", true).order("trailer_number"),
    ]);
    setTrucks(trucksRes.data || []);
    setTrailers(trailersRes.data || []);
  }, [supabase]);

  useEffect(() => {
    if (createOpen) {
      fetchFleetOptions();
    }
  }, [createOpen, fetchFleetOptions]);

  const filtered = drivers.filter((d) => {
    const matchesSearch =
      d.full_name.toLowerCase().includes(search.toLowerCase()) ||
      d.email.toLowerCase().includes(search.toLowerCase()) ||
      d.phone?.includes(search);
    return matchesSearch;
  });

  const available = drivers.filter((d) => d.availability_status === "available");
  const unavailable = drivers.filter((d) => d.availability_status !== "available");

  const handleCreateDriver = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitting(true);

    const fd = new FormData(e.currentTarget);
    const full_name = fd.get("full_name") as string;
    const email = fd.get("email") as string;
    const phone = (fd.get("phone") as string) || null;
    const password = fd.get("password") as string;

    try {
      const res = await fetch("/api/admin/create-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name,
          email,
          phone,
          password,
          truck_id: selectedTruck !== "none" ? selectedTruck : null,
          trailer_id: selectedTrailer !== "none" ? selectedTrailer : null,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to create driver");
      }

      toast.success(`Driver "${full_name}" created successfully`);
      setCreateOpen(false);
      setSelectedTruck("none");
      setSelectedTrailer("none");
      setShowPassword(false);
      fetchDrivers();
    } catch (err: any) {
      toast.error(err.message || "Failed to create driver");
    } finally {
      setSubmitting(false);
    }
  };

  const openCreate = () => {
    setSelectedTruck("none");
    setSelectedTrailer("none");
    setShowPassword(false);
    setCreateOpen(true);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Drivers"
        description={`${drivers.length} total · ${available.length} available · ${unavailable.length} unavailable`}
      >
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" /> Create Driver
        </Button>
      </PageHeader>

      {/* Search + Filter */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search drivers..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={availabilityFilter} onValueChange={setAvailabilityFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All Drivers" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Drivers</SelectItem>
            <SelectItem value="available">Available</SelectItem>
            <SelectItem value="unavailable">Unavailable</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Drivers Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-16">No drivers found</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Driver</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Availability</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Current Load</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((driver) => {
                  const initials = driver.full_name
                    .split(" ")
                    .map((n) => n[0])
                    .join("")
                    .toUpperCase()
                    .slice(0, 2);
                  const loadCfg = driver.active_load
                    ? STATUS_CONFIG[driver.active_load.status as LoadStatus]
                    : null;
                  const isAvailable =
                    driver.is_active &&
                    (!driver.active_load || driver.availability_status === "available");

                  return (
                    <TableRow key={driver.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8">
                            <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                              {initials}
                            </AvatarFallback>
                          </Avatar>
                          <span className="font-medium">{driver.full_name}</span>
                        </div>
                      </TableCell>
                      <TableCell>{driver.email}</TableCell>
                      <TableCell>{driver.phone || "—"}</TableCell>
                      <TableCell>
                        <Badge variant={isAvailable ? "success" : "secondary"}>
                          {isAvailable ? "Available" : "Unavailable"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={driver.is_active ? "success" : "secondary"}>
                          {driver.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {driver.active_load ? (
                          <Badge variant={loadCfg?.variant} className="text-xs">
                            {driver.active_load.reference_number}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground text-sm">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create Driver Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Create New Driver</DialogTitle>
            <DialogDescription>
              Add a new driver to the system. They will be able to log in with the
              credentials provided.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateDriver} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="full_name">Full Name *</Label>
                <Input id="full_name" name="full_name" placeholder="John Doe" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email *</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="john@example.com"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone Number</Label>
                <Input
                  id="phone"
                  name="phone"
                  type="tel"
                  placeholder="(555) 123-4567"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Temporary Password *</Label>
                <div className="relative">
                  <Input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Min. 6 characters"
                    required
                    minLength={6}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => setShowPassword(!showPassword)}
                    tabIndex={-1}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Truck (optional)</Label>
                <Select value={selectedTruck} onValueChange={setSelectedTruck}>
                  <SelectTrigger>
                    <SelectValue placeholder="No truck assigned" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No truck assigned</SelectItem>
                    {trucks.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.truck_number}
                        {t.make ? ` — ${t.make}` : ""}
                        {t.model ? ` ${t.model}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Trailer (optional)</Label>
                <Select value={selectedTrailer} onValueChange={setSelectedTrailer}>
                  <SelectTrigger>
                    <SelectValue placeholder="No trailer assigned" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No trailer assigned</SelectItem>
                    {trailers.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.trailer_number}
                        {t.trailer_type ? ` — ${t.trailer_type}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="rounded-md bg-muted/50 p-3 text-sm text-muted-foreground">
              The driver will be created with <strong>role = driver</strong> and{" "}
              <strong>availability = available</strong>. They can log in to the
              mobile app immediately with the email and password provided.
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateOpen(false)}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create Driver
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
