/// Runtime configuration. `VITE_API_BASE_URL` is inlined at build time by Vite;
/// falls back to the local backend for dev.
export const API_BASE_URL: string =
  import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';
