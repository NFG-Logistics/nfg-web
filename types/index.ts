// NFG — Shared TypeScript types (mirrors schema.sql)

// =============================================================================
// ENUMS
// =============================================================================

export type UserRole = "admin" | "dispatcher" | "driver";

export type LoadStatus =
  | "dispatched"
  | "on_site_shipper"
  | "loaded"
  | "on_site_receiver"
  | "empty"
  | "retake_requested"
  | "delivered"
  | "cancelled";

export type StopType = "pickup" | "delivery";

export type StopStatus = "pending" | "arrived" | "loading" | "unloading" | "completed";

export type DocumentType =
  | "bol"
  | "rate_confirmation"
  | "lumper_receipt"
  | "scale_ticket"
  | "cargo_photo"
  | "other";

export type PaymentStatus = "unpaid" | "invoiced" | "paid";

// =============================================================================
// TABLE TYPES
// =============================================================================

export interface Company {
  id: string;
  name: string;
  mc_number?: string;
  dot_number?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  phone?: string;
  email?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface User {
  id: string;
  company_id: string;
  role: UserRole;
  full_name: string;
  email: string;
  phone?: string;
  avatar_url?: string;
  is_active: boolean;
  availability_status?: "available" | "unavailable" | "in_service";
  created_at: string;
  updated_at: string;
}

export interface Truck {
  id: string;
  company_id: string;
  truck_number: string;
  make?: string;
  model?: string;
  year?: number;
  vin?: string;
  license_plate?: string;
  is_active: boolean;
  in_use: boolean;
  maintenance_status?: "available" | "in_service";
  maintenance_notes?: string;
  last_service_date?: string;
  created_at: string;
  updated_at: string;
}

export interface Trailer {
  id: string;
  company_id: string;
  trailer_number: string;
  trailer_type?: string;
  length_ft?: number;
  license_plate?: string;
  is_active: boolean;
  in_use: boolean;
  maintenance_status?: "available" | "in_service";
  maintenance_notes?: string;
  last_service_date?: string;
  created_at: string;
  updated_at: string;
}

export interface Load {
  id: string;
  company_id: string;
  reference_number: string;
  status: LoadStatus;
  driver_id?: string;
  dispatcher_id: string;
  truck_id?: string;
  trailer_id?: string;
  weight_lbs?: number;
  pieces?: number;
  equipment_type?: string;
  special_instructions?: string;
  client_name?: string;
  rate: number;
  payment_status: PaymentStatus;
  cancel_reason?: string;
  review_feedback?: string;
  reviewed_by?: string;
  reviewed_at?: string;
  dispatched_at: string;
  completed_at?: string;
  accepted_at?: string;
  cancelled_at?: string;
  rate_confirmation_path?: string;
  created_at: string;
  updated_at: string;
}

export interface Stop {
  id: string;
  load_id: string;
  type: StopType;
  stop_order: number;
  status: StopStatus;
  facility_name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  appointment_date?: string;
  arrival_at?: string;
  departure_at?: string;
  contact_name?: string;
  contact_phone?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface Document {
  id: string;
  load_id: string;
  stop_id?: string;
  uploaded_by: string;
  type: DocumentType;
  file_url: string;
  file_name: string;
  file_type?: string;
  notes?: string;
  created_at: string;
}

export interface Receipt {
  id: string;
  load_id?: string; // Optional - receipts can exist without a load
  stop_id?: string;
  uploaded_by: string;
  file_url?: string;
  file_name?: string;
  file_type?: string;
  signed_by?: string; // Optional - for backward compatibility
  no_pod_available?: boolean; // Optional - for backward compatibility
  receipt_type?: "fuel" | "road_service" | "toll" | "lumper" | "other" | "pod";
  truck_id?: string;
  amount?: number; // Cost/amount of the receipt
  notes?: string;
  created_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  title: string;
  body: string;
  type: string;
  is_read: boolean;
  data?: Record<string, unknown>;
  created_at: string;
}

export interface StatusUpdate {
  id: string;
  load_id: string;
  previous_status?: LoadStatus;
  new_status: LoadStatus;
  changed_by: string;
  notes?: string;
  created_at: string;
}

// =============================================================================
// LOAD WITH RELATIONS (common query shape)
// =============================================================================

export interface LoadWithDetails extends Load {
  driver?: User;
  dispatcher?: User;
  truck?: Truck;
  trailer?: Trailer;
  stops?: Stop[];
  documents?: Document[];
  receipts?: Receipt[];
  status_updates?: StatusUpdate[];
}

// =============================================================================
// SCHEDULE ENTRIES (manual entries on the Driver's Schedule page)
// =============================================================================

export interface ScheduleEntry {
  id: string;
  company_id: string;
  pickup_date: string;
  delivery_date: string;
  company_name: string;
  load_number: string;
  pickup_city: string;
  pickup_state: string;
  delivery_city: string;
  delivery_state: string;
  driver_id?: string | null;
  driver_name: string;
  rate: number;
  notes?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}
