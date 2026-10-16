/** RFC 4648 §5 base64url without padding, as PKCE (RFC 7636) and OAuth `state` use. */
function base64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

/** 32 random bytes → 43 URL-safe characters: a PKCE verifier or an OAuth `state`. */
export function randomUrlSafe(): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(32)));
}

/** The S256 `code_challenge` for `verifier` (RFC 7636 §4.2). */
export async function codeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64Url(new Uint8Array(digest));
}
