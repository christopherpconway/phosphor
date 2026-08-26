// Named configurations: whole VisualSaved objects keyed by name (PH-2/PH-3).
// Pure; localStorage IO stays in main.ts.
export const CONFIGS_KEY = "phosphor-configs";
export type ConfigStore = Record<string, unknown>;

export function isValidConfigName(name: string): boolean {
  const n = name.trim();
  return n.length >= 1 && n.length <= 32;
}

export function sanitizeStore(raw: unknown): ConfigStore {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};
  const out: ConfigStore = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (isValidConfigName(k) && typeof v === "object" && v !== null) out[k.trim()] = v;
  }
  return out;
}

export function configNames(store: ConfigStore): string[] {
  return Object.keys(store).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

export function withConfig(store: ConfigStore, name: string, value: unknown): ConfigStore {
  if (!isValidConfigName(name)) return store;
  return { ...store, [name.trim()]: value };
}

export function withoutConfig(store: ConfigStore, name: string): ConfigStore {
  const { [name.trim()]: _gone, ...rest } = store;
  return rest;
}
