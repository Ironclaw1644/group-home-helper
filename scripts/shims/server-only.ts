// The real `server-only` package throws when imported outside a React Server
// Component. Verification scripts run in plain Node but exercise the same
// server modules, so they alias it to this no-op via scripts/tsconfig.json.
// Nothing in the app bundle resolves here.
export {};
