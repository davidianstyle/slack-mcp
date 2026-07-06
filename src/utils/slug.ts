// Derives the env-var key fragment for a workspace slug, e.g.
// "acme-slack-com" -> "ACME_SLACK_COM" (used to build `SLACK_TOKEN_<SLUG>`,
// `SLACK_XOXC_<SLUG>`, `SLACK_XOXD_<SLUG>`). Shared between auth.ts (reading
// the env vars) and errors.ts (naming them in remediation hints) so the two
// can't drift apart.
export function envSlug(slug: string): string {
  return slug.replace(/-/g, "_").toUpperCase();
}
