/**
 * Single-tenant deployment: there is exactly ONE client — the founder this Second
 * Brain belongs to. Everything (knowledge docs, brand kit, content guides, the
 * uploaded vault) is scoped to this one slug. No env var is needed; if you fork
 * this for a different founder, change it here in one place.
 */
export const APP_CLIENT = "danny";
