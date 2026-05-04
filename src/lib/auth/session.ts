/**
 * Server-side session helpers.
 *
 * Use `getCurrentActor()` at the top of any server component, server action,
 * or API route that needs to know who the user is. It returns null for
 * unauthenticated requests; pages call `requireActor()` to redirect.
 */
import "server-only";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/config";
import { loadActor, type ActorContext } from "@/lib/permissions/check";

export async function getCurrentActor(): Promise<ActorContext | null> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;
  return loadActor(userId);
}

/**
 * Same as getCurrentActor but redirects unauthenticated users to /login
 * with a sane callbackUrl. Use in server components.
 */
export async function requireActor(callbackPath = "/dashboard"): Promise<ActorContext> {
  const actor = await getCurrentActor();
  if (!actor) redirect(`/login?next=${encodeURIComponent(callbackPath)}`);
  return actor;
}
