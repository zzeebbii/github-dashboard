import { useMemo } from "react";

interface SafeHtmlProps {
  /** Untrusted HTML, e.g. a GitHub `bodyHTML`. */
  readonly html: string;
  /**
   * Pass `useSanitizeHtml()` (application/html-sanitizer.ts). Typed structurally here because
   * ui/ depends on domain/ only.
   */
  readonly sanitize: (dirty: string, imageLabel: string) => TrustedHTML | string;
  /** Text of the link that replaces each image. */
  readonly imageLabel?: string;
}

/**
 * The only component that renders raw HTML (FR-6.6). Everything it renders has been through
 * `sanitize`; under the app's CSP an unsanitised string would be refused by the browser anyway.
 *
 * First caller is the PR detail panel (T24).
 */
export function SafeHtml({ html, sanitize, imageLabel = "Image — open in GitHub" }: SafeHtmlProps) {
  // Memoised: React re-assigns innerHTML whenever the __html value changes identity, and each
  // sanitise call returns a new TrustedHTML object.
  const clean = useMemo(() => sanitize(html, imageLabel), [sanitize, html, imageLabel]);
  return <div dangerouslySetInnerHTML={{ __html: clean }} />;
}
