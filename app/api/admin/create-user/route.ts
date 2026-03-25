import { createClient } from "@/lib/supabase/server";
import { getSupabaseUrl } from "@/lib/supabase/env";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    // 1. Verify the caller is an authenticated admin / dispatcher
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

    // 2. Parse body
    const body = await request.json();
    const { full_name, email, phone, password, truck_id, trailer_id } = body;

    if (!full_name || !email || !password) {
      return NextResponse.json(
        { error: "full_name, email, and password are required" },
        { status: 400 }
      );
    }

    // 3. Use service role key to create user via Admin API
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceRoleKey) {
      // Fallback: use signUp if service role key is not set
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name,
            role: "driver",
          },
        },
      });

      if (authError) {
        return NextResponse.json({ error: authError.message }, { status: 400 });
      }

      if (!authData.user) {
        return NextResponse.json(
          { error: "Failed to create auth account" },
          { status: 500 }
        );
      }

      // Insert into users table
      const { error: insertError } = await supabase.from("users").insert({
        id: authData.user.id,
        company_id: callerProfile.company_id,
        full_name,
        email,
        phone: phone || null,
        role: "driver",
        is_active: true,
        availability_status: "available",
      });

      if (insertError) {
        return NextResponse.json({ error: insertError.message }, { status: 500 });
      }

      return NextResponse.json({ success: true, user_id: authData.user.id });
    }

    // Use admin API (preferred)
    const adminClient = createServiceClient(getSupabaseUrl(), serviceRoleKey);

    const { data: adminData, error: adminError } =
      await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          full_name,
          role: "driver",
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

    // Insert into users table with service role client (bypasses RLS)
    const { error: insertError } = await adminClient.from("users").insert({
      id: adminData.user.id,
      company_id: callerProfile.company_id,
      full_name,
      email,
      phone: phone || null,
      role: "driver",
      is_active: true,
      availability_status: "available",
    });

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    // Optionally assign truck/trailer if provided (no load needed)
    // This is informational - trucks/trailers are assigned to loads, not drivers directly
    // But we can store it in user metadata or a separate table if needed in the future

    return NextResponse.json({ success: true, user_id: adminData.user.id });
  } catch (err: any) {
    console.error("create-user error:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}
