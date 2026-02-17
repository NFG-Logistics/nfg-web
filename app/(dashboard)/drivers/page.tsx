"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Search, Loader2, Phone, Mail } from "lucide-react";
import type { User as UserType, Load, LoadStatus } from "@/types";
import { STATUS_CONFIG } from "@/lib/constants";

interface DriverWithLoad extends UserType {
  active_load?: Load | null;
}

export default function DriversPage() {
  const supabase = createClient();
  const [drivers, setDrivers] = useState<DriverWithLoad[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    async function fetchDrivers() {
      try {
        // Fetch all drivers
        const { data: driverData, error: driverErr } = await supabase
          .from("users")
          .select("*")
          .eq("role", "driver")
          .order("full_name");

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
  }, []);

  const filtered = drivers.filter((d) =>
    d.full_name.toLowerCase().includes(search.toLowerCase()) ||
    d.email.toLowerCase().includes(search.toLowerCase()) ||
    d.phone?.includes(search)
  );

  const available = drivers.filter((d) => d.is_active && !d.active_load);
  const onLoad = drivers.filter((d) => d.active_load);

  return (
    <div className="space-y-6">
      <PageHeader title="Drivers" description={`${drivers.length} total · ${available.length} available · ${onLoad.length} on load`} />

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search drivers..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      {/* Drivers Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-16">No drivers found</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((driver) => {
            const initials = driver.full_name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
            const loadCfg = driver.active_load ? STATUS_CONFIG[driver.active_load.status as LoadStatus] : null;
            return (
              <Card key={driver.id}>
                <CardContent className="p-5">
                  <div className="flex items-start gap-4">
                    <Avatar className="h-12 w-12">
                      <AvatarFallback className="bg-primary/10 text-primary font-semibold">{initials}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <h3 className="font-semibold truncate">{driver.full_name}</h3>
                        {driver.is_active ? (
                          <Badge variant={driver.active_load ? "warning" : "success"} className="text-xs ml-2 shrink-0">
                            {driver.active_load ? "On Load" : "Available"}
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-xs ml-2 shrink-0">Inactive</Badge>
                        )}
                      </div>

                      <div className="space-y-1 text-sm text-muted-foreground">
                        <div className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" />{driver.email}</div>
                        {driver.phone && <div className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" />{driver.phone}</div>}
                      </div>

                      {driver.active_load && (
                        <div className="mt-3 rounded-md bg-muted/50 p-2.5">
                          <p className="text-xs text-muted-foreground">Current Load</p>
                          <div className="flex items-center justify-between mt-1">
                            <span className="text-sm font-medium">{driver.active_load.reference_number}</span>
                            <Badge variant={loadCfg?.variant} className="text-xs">{loadCfg?.label}</Badge>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
