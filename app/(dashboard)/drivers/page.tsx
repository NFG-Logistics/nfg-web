"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Loader2, Phone, Mail, Plus } from "lucide-react";
import type { User as UserType, Load, LoadStatus } from "@/types";
import { STATUS_CONFIG } from "@/lib/constants";
import Link from "next/link";

interface DriverWithLoad extends UserType {
  active_load?: Load | null;
}

export default function DriversPage() {
  const supabase = createClient();
  const [drivers, setDrivers] = useState<DriverWithLoad[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [availabilityFilter, setAvailabilityFilter] = useState<string>("all");

  useEffect(() => {
    async function fetchDrivers() {
      try {
        // PART 3: Fix driver filter - use server query based on availability filter
        let query = supabase
          .from("users")
          .select("*")
          .eq("role", "driver");

        // Apply availability filter at server level
        if (availabilityFilter === "available") {
          query = query.eq("availability_status", "available");
        } else if (availabilityFilter === "unavailable") {
          query = query.neq("availability_status", "available");
        }
        // "all" doesn't need additional filter

        const { data: driverData, error: driverErr } = await query.order("full_name");

        if (driverErr) console.error("Failed to fetch drivers:", driverErr);

        // Fetch active loads to see who's assigned
        const { data: activeLoads, error: loadsErr } = await supabase
          .from("loads")
          .select("id, reference_number, status, driver_id")
          .not("status", "in", '("delivered","cancelled")');

        if (loadsErr) console.error("Failed to fetch active loads:", loadsErr);

        const driverMap = new Map<string, Load>();
        (activeLoads || []).forEach((l) => { if (l.driver_id) driverMap.set(l.driver_id, l as Load); });

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
    }
    fetchDrivers();
  }, [availabilityFilter, supabase]);

  // Client-side search filter only (availability is handled by server)
  const filtered = drivers.filter((d) => {
    const matchesSearch =
      d.full_name.toLowerCase().includes(search.toLowerCase()) ||
      d.email.toLowerCase().includes(search.toLowerCase()) ||
      d.phone?.includes(search);

    return matchesSearch;
  });

  // Count stats for display
  const available = drivers.filter((d) => d.availability_status === "available");
  const unavailable = drivers.filter((d) => d.availability_status !== "available");

  return (
    <div className="space-y-6">
      <PageHeader title="Drivers" description={`${drivers.length} total · ${available.length} available · ${unavailable.length} unavailable`}>
        <Button asChild>
          <Link href="/settings?tab=users">
            <Plus className="mr-2 h-4 w-4" /> Create New Driver
          </Link>
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
                  const initials = driver.full_name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
                  const loadCfg = driver.active_load ? STATUS_CONFIG[driver.active_load.status as LoadStatus] : null;
                  const isAvailable = driver.is_active && (!driver.active_load || driver.availability_status === "available");
                  
                  return (
                    <TableRow key={driver.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8">
                            <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">{initials}</AvatarFallback>
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
    </div>
  );
}
