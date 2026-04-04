import { createClient } from "@/lib/supabase/server";
import { getSupabaseUrl } from "@/lib/supabase/env";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const ALLOWED_ROLES = ["admin", "dispatcher", "driver"] as const;
type CreatedRole = (typeof ALLOWED_ROLES)[number];

function parseRole(body: { role?: string }, callerRole: string): CreatedRole | null {
  const raw = (body.role ?? "driver").toLowerCase();
  if (!ALLOWED_ROLES.includes(raw as CreatedRole)) return null;
  const r = raw as CreatedRole;
  if (callerRole === "dispatcher" && r !== "driver") return null;
  return r;
}

export async function POST(request: Request) {
  try {
    const supabase = createClient();
    const {
      data: { user: caller },
    } = await supabase.auth.getUser();

    if (!caller) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: callerProfile } = await supabase
      .from("users")
      .select("role, company_id")
      .eq("id", caller.id)
      .single();

    if (!callerProfile || !["admin", "dispatcher"].includes(callerProfile.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const companyId = callerProfile.company_id as string | null;
    if (!companyId) {
      return NextResponse.json(
        { error: "Your account has no company assigned. Cannot create users." },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { full_name, email, phone, password, truck_id, trailer_id } = body;

    if (!full_name || !email || !password) {
      return NextResponse.json(
        { error: "full_name, email, and password are required" },
        { status: 400 }
      );
    }

    const newRole = parseRole(body, callerProfile.role);
    if (!newRole) {
      return NextResponse.json(
        { error: "Invalid role, or dispatchers may only create driver accounts." },
        { status: 400 }
      );
    }

    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    if (!serviceRoleKey) {
      return NextResponse.json(
        {
          error:
            "SUPABASE_SERVICE_ROLE_KEY is not configured. Add it to the server environment so new users can be created without logging you out of the dashboard.",
        },
        { status: 503 }
      );
    }

    const adminClient = createServiceClient(getSupabaseUrl(), serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: adminData, error: adminError } =
      await adminClient.auth.admin.createUser({
        email: email.trim(),
        password,
        email_confirm: true,
        app_metadata: {
          company_id: companyId,
          role: newRole,
        },
        user_metadata: {
          full_name,
        },
      });

    if (adminError) {
      return NextResponse.json({ error: adminError.message }, { status: 400 });
    }

    if (!adminData.user) {
      return NextResponse.json(
        { error: "Failed to create auth account" },
        { status: 500 }
      );
    }

    const { error: upsertError } = await adminClient.from("users").upsert(
      {
        id: adminData.user.id,
        company_id: companyId,
        full_name,
        email: email.trim(),
        phone: phone || null,
        role: newRole,
        is_active: true,
        availability_status: "available",
      },
      { onConflict: "id" }
    );

    if (upsertError) {
      return NextResponse.json({ error: upsertError.message }, { status: 500 });
    }

    void truck_id;
    void trailer_id;

    return NextResponse.json({ success: true, user_id: adminData.user.id });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
