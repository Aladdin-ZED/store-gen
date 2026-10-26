/**
 * Template secret values, shared by the server configuration (src/lib/auth/config.ts) and the isomorphic edge
 * configuration (src/lib/edge/env.ts), so "this secret is configured" has one definition everywhere. Pure: no
 * imports, no environment, no I/O (src/lib/urls, which reads edge/env, is importable by client components).
 *
 * Template values ("change-me…", "your-secret", "xxxxxx", "aaaaaaaa…") are public wherever the template is: in
 * .env.example, the docs or any copy of the project. A secret matching this is treated as unset, so a deploy with
 * copied defaults stays closed (404) instead of open to anyone holding the template. Generated values do not match
 * in practice (8 equal characters in a row: about 1 in 5 million for a 64-char hex secret, far less for base64url).
 */
export const PLACEHOLDER_RE = /change[-_ ]?me|replace[-_ ]?me|your[-_ ]?(?:app[-_ ]?)?(?:secret|key|token|gate|password)|placeholder|example|x{6,}|(.)\1{7,}/i;

/** true for a known template / placeholder value (never for a randomly generated one). */
export function isPlaceholderSecret(value: string): boolean {
  return PLACEHOLDER_RE.test(value);
}
