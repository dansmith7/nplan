/**
 * Lets the visual prototype be viewed without an account while running the
 * Vite development server on this computer. This condition is impossible in
 * a production build, so it cannot accidentally open the hosted app.
 */
export function isLocalPreview(): boolean {
  if (typeof window === "undefined" || !import.meta.env.DEV) return false;
  return window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
}
