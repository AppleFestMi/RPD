/**
 * Auth.js module augmentation.
 *
 * The default Session type only exposes name/email/image on user. We
 * carry a stable user id through the JWT and surface it on the session
 * object so server code (getCurrentActor, requireActor) can resolve
 * the actor without a second lookup.
 *
 * The JWT itself uses the standard `sub` claim for the user id. No
 * roles or permissions are stored in the token — those are read fresh
 * from the database per request by loadActor.
 */
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
    } & DefaultSession["user"];
  }
}
