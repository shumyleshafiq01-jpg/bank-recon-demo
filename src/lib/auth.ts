import { cookies } from "next/headers";
import { supabase } from "./supabase";

export type StaffRole = "super_admin" | "admin" | "staff";

export interface StaffSession {
  id: string;
  username: string;
  displayName: string;
  role: StaffRole;
  mustChangePin: boolean;
}

const COOKIE_NAME = "kafi_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export async function createSession(staffId: string): Promise<void> {
  const jar = await cookies();
  jar.set(COOKIE_NAME, staffId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE,
    path: "/",
  });
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE_NAME);
}

export async function getSession(): Promise<StaffSession | null> {
  const jar = await cookies();
  const staffId = jar.get(COOKIE_NAME)?.value;
  if (!staffId) return null;

  const { data, error } = await supabase
    .from("staff")
    .select("id, username, display_name, role, must_change_pin, active")
    .eq("id", staffId)
    .single();

  if (error || !data || !data.active) return null;

  return {
    id: data.id,
    username: data.username,
    displayName: data.display_name,
    role: data.role as StaffRole,
    mustChangePin: data.must_change_pin,
  };
}

export async function getStaffModules(staffId: string): Promise<Record<string, boolean>> {
  const { data } = await supabase
    .from("staff_modules")
    .select("module_slug, allowed")
    .eq("staff_id", staffId);

  const map: Record<string, boolean> = {};
  for (const row of data ?? []) {
    map[row.module_slug] = row.allowed;
  }
  return map;
}
