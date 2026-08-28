import type { User } from "@supabase/supabase-js";
import type { UserProfile } from "@/types";

export function profileFromUser(user: User): UserProfile {
  const meta = user.user_metadata ?? {};
  return {
    fullName: meta.full_name ?? user.email ?? "User",
    institution: meta.institution ?? "",
    email: user.email ?? "",
    role: meta.role ?? "researcher",
    discipline: meta.discipline ?? null,
  };
}
