/**
 * Licence handling for devsense-php-ls premium features.
 *
 * devsense-php-ls reads its licence from `initializationOptions["0"]` of the
 * `initialize` request (or from the DEVSENSE_PHP_LS_LICENSE env variable of its
 * own process). The value is a STRING: either the licence key, or the entire
 * `{JSON CODE}` obtained from https://www.devsense.com/purchase/validation
 * (offline activation), passed verbatim as a string.
 *
 * The licence is a server-side secret: it is never logged and never sent to
 * browser clients.
 */

/** Environment variable holding the licence key or the offline-activation JSON code. */
export const LICENSE_ENV_VAR = 'DEVSENSE_PHP_LS_LICENSE';

/** initializationOptions property devsense-php-ls reads the licence from. */
export const LICENSE_INIT_OPTION = '0';

/** Resolve the licence: explicit option first, then the env variable. Blank values count as "no licence". */
export function resolveLicense(option: string | undefined, env: NodeJS.ProcessEnv = process.env): string | undefined {
  const value = (option ?? env[LICENSE_ENV_VAR])?.trim();
  return value ? value : undefined;
}

/**
 * Build the initializationOptions for the single real `initialize`.
 * The licence (when set) always wins over any `"0"` in `extra`.
 */
export function buildInitializationOptions(license: string | undefined, extra?: Record<string, unknown>): Record<string, unknown> {
  const options: Record<string, unknown> = { ...(extra ?? {}) };
  if (license) options[LICENSE_INIT_OPTION] = license;
  return options;
}

/**
 * Deep-copy `value`, replacing any string that contains one of `secrets` with "[redacted]".
 * Used as defence in depth before data derived from the LS handshake goes to clients.
 */
export function redactSecrets<T>(value: T, secrets: readonly string[]): T {
  const active = secrets.filter((s) => s.length > 0);
  if (active.length === 0) return value;
  const walk = (v: unknown): unknown => {
    if (typeof v === 'string') return active.some((s) => v.includes(s)) ? '[redacted]' : v;
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, inner] of Object.entries(v as Record<string, unknown>)) out[k] = walk(inner);
      return out;
    }
    return v;
  };
  return walk(value) as T;
}
