// Supabase Edge Function: ingest-telemetry
// Follows strict authorization, role validation, and telemetry ingestion

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing Authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    // Authenticated user client
    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: userError,
    } = await supabaseUser.auth.getUser();

    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized access" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Service client with elevated permissions for strict validation and update
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Verify user has driver role
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profileError || !profile || (profile.role !== "driver" && profile.role !== "admin")) {
      return new Response(JSON.stringify({ error: "Only assigned drivers or admins can stream telemetry" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payload = await req.json();
    const { vehicle_id, latitude, longitude, speed, heading, accuracy, altitude } = payload;

    // Validate coordinates
    if (
      typeof latitude !== "number" ||
      typeof longitude !== "number" ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      return new Response(JSON.stringify({ error: "Invalid coordinate bounds" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate GPS accuracy and speed
    if (accuracy != null && (typeof accuracy !== "number" || accuracy < 0 || accuracy > 10000)) {
      return new Response(JSON.stringify({ error: "GPS accuracy out of valid range" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (speed != null && (typeof speed !== "number" || speed < 0)) {
      return new Response(JSON.stringify({ error: "Speed must be non-negative" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify vehicle assignment: vehicle must have assigned_driver_id = user.id
    if (profile.role === "driver") {
      const { data: vehicle, error: vehicleCheckError } = await supabaseAdmin
        .from("vehicles")
        .select("id, assigned_driver_id")
        .eq("id", vehicle_id)
        .single();

      if (vehicleCheckError || !vehicle || vehicle.assigned_driver_id !== user.id) {
        return new Response(JSON.stringify({ error: "Vehicle not assigned to this driver" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const now = new Date().toISOString();

    // Update latest vehicle state
    const { error: updateError } = await supabaseAdmin
      .from("vehicles")
      .update({
        current_lat: latitude,
        current_lng: longitude,
        current_speed: speed ?? 0,
        current_heading: heading ?? 0,
        current_accuracy: accuracy ?? null,
        last_ping: now,
      })
      .eq("id", vehicle_id);

    if (updateError) {
      throw updateError;
    }

    // Insert historical telemetry record
    const { error: historyError } = await supabaseAdmin
      .from("telemetry")
      .insert({
        vehicle_id,
        driver_id: user.id,
        latitude,
        longitude,
        speed: speed ?? 0,
        heading: heading ?? 0,
        accuracy: accuracy ?? null,
        altitude: altitude ?? null,
        recorded_at: now,
      });

    if (historyError) {
      console.error("Telemetry insert error:", historyError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        recorded_at: now,
        vehicle_id,
        coordinates: { latitude, longitude },
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
