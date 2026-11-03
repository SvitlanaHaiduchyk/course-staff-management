import { createClient } from "@supabase/supabase-js";
const as = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false },
});
await as.auth.signInWithPassword({ email: "manager1@example.test", password: process.env.DEMO_USER_PASSWORD });
const fixed = await as
  .from("leave_records")
  .select(
    `id, on_date, status,
     positions(kind, job_title, employee_id, profiles!positions_employee_id_fkey(full_name, email)),
     leave_requests(leave_type, comment, employee_id)`,
  )
  .eq("status", "awaiting");
console.log("з явним FK:", fixed.data?.length, fixed.error?.message ?? "OK");
if (fixed.data?.[0]) console.log("працівник:", fixed.data[0].positions.profiles.email, "| дата:", fixed.data[0].on_date);
