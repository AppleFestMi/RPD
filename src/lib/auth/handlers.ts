/**
 * Re-export Auth.js HTTP handlers from config.
 * Kept in /lib so the route file is a thin façade.
 */
import "server-only";
import { handlers, signIn, signOut, auth } from "./config";

export { signIn, signOut, auth };
export const GET = handlers.GET;
export const POST = handlers.POST;
