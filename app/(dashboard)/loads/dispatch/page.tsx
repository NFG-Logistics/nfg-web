"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/hooks/use-user";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  Plus,
  X,
  MapPin,
  Calendar,
  Clock,
  CheckCircle2,
  Loader2,
  User,
  Phone,
  FileText,
} from "lucide-react";
import type { User as UserType } from "@/types";

interface Stop {
  id: string;
  type: "pickup" | "delivery";
  facility_name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  date: string;
  timeType: "fixed" | "interval";
  time?: string;
  startTime?: string;
  endTime?: string;
  contact_name?: string;
  contact_phone?: string;
  notes?: string;
}

interface FleetOption {
  id: string;
  label: string;
}

export default function DispatchPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { user } = useUser();
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);

  // Section 1: Stops
  const [stops, setStops] = useState<Stop[]>([]);
  const [availableDrivers, setAvailableDrivers] = useState<UserType[]>([]);
  const [driverSearch, setDriverSearch] = useState("");

  // Section 2: Load Details
  const [loadNumber, setLoadNumber] = useState("");
  const [rate, setRate] = useState("");
  const [clientName, setClientName] = useState("");
  const [loadNotes, setLoadNotes] = useState("");
  const [rateConfirmation, setRateConfirmation] = useState<File | null>(null);

  // Section 3: Driver Selection
  const [selectedDriver, setSelectedDriver] = useState<string>("");
  const [availableTrucks, setAvailableTrucks] = useState<FleetOption[]>([]);
  const [availableTrailers, setAvailableTrailers] = useState<FleetOption[]>([]);
  const [selectedTruck, setSelectedTruck] = useState<string>("");
  const [selectedTrailer, setSelectedTrailer] = useState<string>("");

  useEffect(() => {
    async function fetchAvailableDrivers() {
      const { data, error } = await supabase
        .from("users")
        .select("*")
        .eq("role", "driver")
        .eq("is_active", true)
        .eq("availability_status", "available")
        .order("full_name");

      if (error) {
        console.error("Failed to fetch drivers:", error);
        return;
      }

      setAvailableDrivers(data || []);
    }

    fetchAvailableDrivers();
  }, [supabase]);

  useEffect(() => {
    async function fetchAvailableFleet() {
      const [
        { data: trucks, error: trucksError },
        { data: trailers, error: trailersError },
        { data: activeLoads, error: activeLoadsError },
      ] =
        await Promise.all([
          supabase
            .from("trucks")
            .select("id, truck_number, maintenance_status")
            .eq("is_active", true)
            .order("truck_number"),
          supabase
            .from("trailers")
            .select("id, trailer_number, maintenance_status")
            .eq("is_active", true)
            .order("trailer_number"),
          supabase
            .from("loads")
            .select("truck_id, trailer_id, status")
            .not("status", "in", '("delivered","cancelled")'),
        ]);

      if (trucksError) {
        console.error("Failed to fetch trucks:", trucksError);
      } else {
        const inUseTruckIds = new Set(
          (activeLoads || []).map((l: { truck_id?: string | null }) => l.truck_id).filter(Boolean)
        );
        const availableTruckRows = (trucks ?? []).filter(
          (truck: { id: string; maintenance_status?: string | null }) =>
            truck.maintenance_status !== "in_service" && !inUseTruckIds.has(truck.id)
        );
        setAvailableTrucks(
          availableTruckRows.map((truck: { id: string; truck_number: string }) => ({
            id: truck.id,
            label: truck.truck_number,
          }))
        );
      }

      if (trailersError) {
        console.error("Failed to fetch trailers:", trailersError);
      } else {
        const inUseTrailerIds = new Set(
          (activeLoads || [])
            .map((l: { trailer_id?: string | null }) => l.trailer_id)
            .filter(Boolean)
        );
        const availableTrailerRows = (trailers ?? []).filter(
          (trailer: { id: string; maintenance_status?: string | null }) =>
            trailer.maintenance_status !== "in_service" && !inUseTrailerIds.has(trailer.id)
        );
        setAvailableTrailers(
          availableTrailerRows.map((trailer: { id: string; trailer_number: string }) => ({
            id: trailer.id,
            label: trailer.trailer_number,
          }))
        );
      }

      if (activeLoadsError) {
        console.error("Failed to fetch active loads for fleet filtering:", activeLoadsError);
      }
    }

    fetchAvailableFleet();
  }, [supabase]);

  // Add default pickup stop
  useEffect(() => {
    if (stops.length === 0) {
      addStop("pickup");
    }
  }, []);

  const addStop = (type: "pickup" | "delivery") => {
    const newStop: Stop = {
      id: `stop-${Date.now()}-${Math.random()}`,
      type,
      facility_name: "",
      address: "",
      city: "",
      state: "",
      zip: "",
      date: "",
      timeType: "fixed",
      time: "",
    };
    setStops([...stops, newStop]);
  };

  const removeStop = (id: string) => {
    setStops(stops.filter((s) => s.id !== id));
  };

  const updateStop = (id: string, updates: Partial<Stop>) => {
    setStops(stops.map((s) => (s.id === id ? { ...s, ...updates } : s)));
  };

  // Validation
  const validateStep1 = (): boolean => {
    const pickups = stops.filter((s) => s.type === "pickup");
    const deliveries = stops.filter((s) => s.type === "delivery");

    if (pickups.length < 1) {
      toast.error("At least one pickup stop is required");
      return false;
    }
    if (deliveries.length < 1) {
      toast.error("At least one delivery stop is required");
      return false;
    }

    // Validate all stops have required fields
    for (const stop of stops) {
      if (!stop.facility_name || !stop.address || !stop.city || !stop.state || !stop.zip) {
        toast.error(`Please complete all required fields for ${stop.type} stop`);
        return false;
      }
    }

    // Validate pickup times < delivery times
    const pickupDates = pickups
      .map((p) => {
        const date = p.date ? new Date(p.date) : null;
        if (p.timeType === "interval" && p.startTime) {
          const [hours, minutes] = p.startTime.split(":");
          if (date) date.setHours(parseInt(hours), parseInt(minutes));
        } else if (p.time) {
          const [hours, minutes] = p.time.split(":");
          if (date) date.setHours(parseInt(hours), parseInt(minutes));
        }
        return date;
      })
      .filter((d) => d !== null)
      .sort((a, b) => (a && b ? a.getTime() - b.getTime() : 0));

    const deliveryDates = deliveries
      .map((d) => {
        const date = d.date ? new Date(d.date) : null;
        if (d.timeType === "interval" && d.startTime) {
          const [hours, minutes] = d.startTime.split(":");
          if (date) date.setHours(parseInt(hours), parseInt(minutes));
        } else if (d.time) {
          const [hours, minutes] = d.time.split(":");
          if (date) date.setHours(parseInt(hours), parseInt(minutes));
        }
        return date;
      })
      .filter((d) => d !== null)
      .sort((a, b) => (a && b ? a.getTime() - b.getTime() : 0));

    if (pickupDates.length > 0 && deliveryDates.length > 0) {
      const lastPickup = pickupDates[pickupDates.length - 1];
      const firstDelivery = deliveryDates[0];
      if (lastPickup && firstDelivery && lastPickup.getTime() >= firstDelivery.getTime()) {
        toast.error("At least one pickup time must be before the first delivery time");
        return false;
      }
    }

    return true;
  };

  const validateStep2 = (): boolean => {
    if (!loadNumber.trim()) {
      toast.error("Load number is required");
      return false;
    }
    if (!rate || Number(rate) <= 0) {
      toast.error("Rate must be greater than 0");
      return false;
    }
    if (!clientName.trim()) {
      toast.error("Client company name is required");
      return false;
    }
    return true;
  };

  const validateStep3 = (): boolean => {
    if (!selectedDriver) {
      toast.error("Please select a driver");
      return false;
    }
    if (!selectedTruck) {
      toast.error("Please select a truck");
      return false;
    }
    if (!selectedTrailer) {
      toast.error("Please select a trailer");
      return false;
    }
    return true;
  };

  const handleNext = () => {
    if (step === 1 && !validateStep1()) return;
    if (step === 2 && !validateStep2()) return;
    if (step === 3 && !validateStep3()) return;
    setStep(step + 1);
  };

  const handleSubmit = async () => {
    if (!validateStep3()) return;

    setSubmitting(true);

    try {
      // Sort stops chronologically
      const sortedStops = [...stops].sort((a, b) => {
        const dateA = a.date ? new Date(a.date).getTime() : 0;
        const dateB = b.date ? new Date(b.date).getTime() : 0;
        if (dateA !== dateB) return dateA - dateB;
        // If same date, pickups come before deliveries
        if (a.type === "pickup" && b.type === "delivery") return -1;
        if (a.type === "delivery" && b.type === "pickup") return 1;
        return 0;
      });

      // Build stops payload
      const stopsPayload = sortedStops.map((stop, index) => {
        let appointmentDate: string | null = null;
        if (stop.date) {
          const date = new Date(stop.date);
          if (stop.timeType === "interval" && stop.startTime) {
            const [hours, minutes] = stop.startTime.split(":");
            date.setHours(parseInt(hours), parseInt(minutes));
            appointmentDate = date.toISOString();
          } else if (stop.time) {
            const [hours, minutes] = stop.time.split(":");
            date.setHours(parseInt(hours), parseInt(minutes));
            appointmentDate = date.toISOString();
          } else {
            appointmentDate = date.toISOString();
          }
        }

        return {
          type: stop.type,
          stop_order: index + 1,
          facility_name: stop.facility_name,
          address: stop.address,
          city: stop.city,
          state: stop.state,
          zip: stop.zip,
          appointment_date: appointmentDate,
          contact_name: stop.contact_name || null,
          contact_phone: stop.contact_phone || null,
          notes: stop.notes || null,
        };
      });

      const { data: load, error: loadError } = await supabase
        .from("loads")
        .insert({
          company_id: user?.company_id,
          dispatcher_id: user?.id,
          driver_id: selectedDriver,
          truck_id: selectedTruck,
          trailer_id: selectedTrailer,
          reference_number: loadNumber,
          rate: Number(rate),
          client_name: clientName.trim(),
          special_instructions: loadNotes.trim() || null,
          status: "dispatched",
        })
        .select()
        .single();

      if (loadError) {
        toast.error(`Failed to create load: ${loadError.message}`);
        setSubmitting(false);
        return;
      }

      // Upload rate confirmation file if provided
      if (rateConfirmation && load) {
        try {
          const ext = rateConfirmation.name.split(".").pop() || "pdf";
          const storagePath = `${load.id}/${Date.now()}.${ext}`;
          const { error: uploadError } = await supabase.storage
            .from("rate-confirmations")
            .upload(storagePath, rateConfirmation);

          if (!uploadError) {
            await supabase
              .from("loads")
              .update({ rate_confirmation_path: storagePath })
              .eq("id", load.id);
          } else {
            console.warn("Rate confirmation upload failed:", uploadError.message);
          }
        } catch (err) {
          console.warn("Rate confirmation upload error:", err);
        }
      }

      // Insert stops
      const stopsWithLoadId = stopsPayload.map((stop) => ({
        ...stop,
        load_id: load.id,
      }));

      const { error: stopsError } = await supabase.from("stops").insert(stopsWithLoadId);

      if (stopsError) {
        toast.error(`Failed to create stops: ${stopsError.message}`);
        setSubmitting(false);
        return;
      }

      await supabase.from("status_updates").insert({
        load_id: load.id,
        previous_status: null,
        new_status: "dispatched",
        changed_by: user?.id,
        notes: "Load dispatched to driver",
      });

      // Send notification to driver
      const selectedDriverData = availableDrivers.find((d) => d.id === selectedDriver);
      if (selectedDriverData) {
        await supabase.from("notifications").insert({
          user_id: selectedDriver,
          title: "New Load Assigned",
          body: `You have been assigned load ${loadNumber}. Check your loads for details.`,
          type: "load_assigned",
          data: { load_id: load.id, reference_number: loadNumber },
        });
      }

      // Update driver to unavailable (best-effort)
      await supabase
        .from("users")
        .update({ availability_status: "unavailable" })
        .eq("id", selectedDriver);

      toast.success(`Load ${loadNumber} dispatched successfully`);
      router.push("/loads");
    } catch (err) {
      toast.error(`Error: ${(err as Error).message}`);
      setSubmitting(false);
    }
  };

  const filteredDrivers = useMemo(() => {
    if (!driverSearch) return availableDrivers;
    const search = driverSearch.toLowerCase();
    return availableDrivers.filter(
      (d) =>
        d.full_name.toLowerCase().includes(search) ||
        d.phone?.toLowerCase().includes(search)
    );
  }, [availableDrivers, driverSearch]);

  const sortedStops = useMemo(() => {
    return [...stops].sort((a, b) => {
      const dateA = a.date ? new Date(a.date).getTime() : 0;
      const dateB = b.date ? new Date(b.date).getTime() : 0;
      if (dateA !== dateB) return dateA - dateB;
      if (a.type === "pickup" && b.type === "delivery") return -1;
      if (a.type === "delivery" && b.type === "pickup") return 1;
      return 0;
    });
  }, [stops]);

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Dispatch Driver</h1>
          <p className="text-sm text-muted-foreground">
            Step {step} of 3: {step === 1 && "Add Stops"}
            {step === 2 && "Load Details"}
            {step === 3 && "Select Driver"}
          </p>
        </div>
      </div>

      {/* Progress indicator */}
      <div className="flex items-center gap-2">
        {[1, 2, 3].map((s) => (
          <div key={s} className="flex items-center flex-1">
            <div
              className={`flex items-center justify-center w-8 h-8 rounded-full border-2 ${
                s <= step
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-muted border-muted-foreground/20"
              }`}
            >
              {s < step ? <CheckCircle2 className="h-4 w-4" /> : s}
            </div>
            {s < 3 && (
              <div
                className={`flex-1 h-0.5 mx-2 ${
                  s < step ? "bg-primary" : "bg-muted"
                }`}
              />
            )}
          </div>
        ))}
      </div>

      {/* Section 1: Add Stops */}
      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              Add Stops
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => addStop("pickup")}
              >
                <Plus className="mr-2 h-4 w-4" /> Add Pickup
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => addStop("delivery")}
              >
                <Plus className="mr-2 h-4 w-4" /> Add Delivery
              </Button>
            </div>

            <div className="space-y-4">
              {sortedStops.map((stop) => (
                <Card key={stop.id} className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <Badge variant={stop.type === "pickup" ? "default" : "secondary"}>
                      {stop.type === "pickup" ? "Pickup" : "Delivery"}
                    </Badge>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeStop(stop.id)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <Label>Company Name *</Label>
                      <Input
                        value={stop.facility_name}
                        onChange={(e) =>
                          updateStop(stop.id, { facility_name: e.target.value })
                        }
                        placeholder="Facility name"
                        required
                      />
                    </div>
                    <div className="col-span-2">
                      <Label>Address *</Label>
                      <Input
                        value={stop.address}
                        onChange={(e) => updateStop(stop.id, { address: e.target.value })}
                        placeholder="Street address"
                        required
                      />
                    </div>
                    <div>
                      <Label>City *</Label>
                      <Input
                        value={stop.city}
                        onChange={(e) => updateStop(stop.id, { city: e.target.value })}
                        required
                      />
                    </div>
                    <div>
                      <Label>State *</Label>
                      <Input
                        value={stop.state}
                        onChange={(e) =>
                          updateStop(stop.id, { state: e.target.value.toUpperCase().slice(0, 2) })
                        }
                        maxLength={2}
                        placeholder="XX"
                        required
                      />
                    </div>
                    <div>
                      <Label>ZIP *</Label>
                      <Input
                        value={stop.zip}
                        onChange={(e) => updateStop(stop.id, { zip: e.target.value })}
                        required
                      />
                    </div>
                    <div>
                      <Label>Date *</Label>
                      <Input
                        type="date"
                        value={stop.date}
                        onChange={(e) => updateStop(stop.id, { date: e.target.value })}
                        required
                      />
                    </div>
                    <div>
                      <Label>Time Type</Label>
                      <select
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        value={stop.timeType}
                        onChange={(e) =>
                          updateStop(stop.id, {
                            timeType: e.target.value as "fixed" | "interval",
                          })
                        }
                      >
                        <option value="fixed">Fixed Time</option>
                        <option value="interval">Time Interval</option>
                      </select>
                    </div>
                    {stop.timeType === "fixed" ? (
                      <div>
                        <Label>Time</Label>
                        <Input
                          type="time"
                          value={stop.time || ""}
                          onChange={(e) => updateStop(stop.id, { time: e.target.value })}
                        />
                      </div>
                    ) : (
                      <>
                        <div>
                          <Label>Start Time</Label>
                          <Input
                            type="time"
                            value={stop.startTime || ""}
                            onChange={(e) => updateStop(stop.id, { startTime: e.target.value })}
                          />
                        </div>
                        <div>
                          <Label>End Time</Label>
                          <Input
                            type="time"
                            value={stop.endTime || ""}
                            onChange={(e) => updateStop(stop.id, { endTime: e.target.value })}
                          />
                        </div>
                      </>
                    )}
                    <div>
                      <Label>Contact Name</Label>
                      <Input
                        value={stop.contact_name || ""}
                        onChange={(e) => updateStop(stop.id, { contact_name: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>Contact Phone</Label>
                      <Input
                        value={stop.contact_phone || ""}
                        onChange={(e) => updateStop(stop.id, { contact_phone: e.target.value })}
                      />
                    </div>
                    <div className="col-span-2">
                      <Label>Notes</Label>
                      <Input
                        value={stop.notes || ""}
                        onChange={(e) => updateStop(stop.id, { notes: e.target.value })}
                      />
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Section 2: Load Details */}
      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Load Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Load Number *</Label>
              <Input
                value={loadNumber}
                onChange={(e) => setLoadNumber(e.target.value)}
                placeholder="e.g., 3856701"
                required
              />
            </div>
            <div>
              <Label>Client Company Name *</Label>
              <Input
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="Name of the client company (broker/shipper)"
                required
              />
              <p className="text-xs text-muted-foreground mt-1">
                The company that hired NFG for this logistics service
              </p>
            </div>
            <div>
              <Label>Rate ($) *</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                placeholder="0.00"
                required
              />
            </div>
            <div>
              <Label>Note (Optional)</Label>
              <Input
                value={loadNotes}
                onChange={(e) => setLoadNotes(e.target.value)}
                placeholder="Any additional notes for the driver schedule"
              />
            </div>
            <div>
              <Label>Rate Confirmation (Optional)</Label>
              <Input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                onChange={(e) => setRateConfirmation(e.target.files?.[0] || null)}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Section 3: Select Driver */}
      {step === 3 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Select Driver
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Search Driver</Label>
              <Input
                placeholder="Search by name or phone..."
                value={driverSearch}
                onChange={(e) => setDriverSearch(e.target.value)}
              />
            </div>
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {filteredDrivers.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No available drivers found
                </p>
              ) : (
                filteredDrivers.map((driver) => (
                  <Card
                    key={driver.id}
                    className={`cursor-pointer transition-colors ${
                      selectedDriver === driver.id
                        ? "border-primary bg-primary/5"
                        : "hover:bg-muted/50"
                    }`}
                    onClick={() => setSelectedDriver(driver.id)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium">{driver.full_name}</p>
                          <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                            {driver.phone && (
                              <span className="flex items-center gap-1">
                                <Phone className="h-3 w-3" />
                                {driver.phone}
                              </span>
                            )}
                            <Badge variant="success" className="text-xs">
                              Available
                            </Badge>
                          </div>
                        </div>
                        {selectedDriver === driver.id && (
                          <CheckCircle2 className="h-5 w-5 text-primary" />
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <Label htmlFor="truck-select">Truck *</Label>
                <select
                  id="truck-select"
                  className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={selectedTruck}
                  onChange={(e) => setSelectedTruck(e.target.value)}
                >
                  <option value="">Select available truck</option>
                  {availableTrucks.map((truck) => (
                    <option key={truck.id} value={truck.id}>
                      {truck.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="trailer-select">Trailer *</Label>
                <select
                  id="trailer-select"
                  className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={selectedTrailer}
                  onChange={(e) => setSelectedTrailer(e.target.value)}
                >
                  <option value="">Select available trailer</option>
                  {availableTrailers.map((trailer) => (
                    <option key={trailer.id} value={trailer.id}>
                      {trailer.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <Button
          type="button"
          variant="outline"
          onClick={() => (step > 1 ? setStep(step - 1) : router.back())}
          disabled={submitting}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          {step === 1 ? "Cancel" : "Back"}
        </Button>
        {step < 3 ? (
          <Button onClick={handleNext} disabled={submitting}>
            Next
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        ) : (
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Dispatching...
              </>
            ) : (
              <>
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Dispatch Load
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
