import type { LucideIcon } from "lucide-react";

/**
 * Lucide icons render as inline SVG from the bundle: no icon font, no CDN (FR-1.2).
 *
 * Decorative by default and hidden from assistive tech. Pass `label` when the icon alone
 * carries meaning; it is then exposed as an image with that accessible name.
 */
export function Icon({
  icon: Glyph,
  label,
  size = 16,
}: {
  icon: LucideIcon;
  label?: string;
  size?: number;
}) {
  if (label === undefined) {
    return <Glyph size={size} aria-hidden="true" focusable="false" />;
  }
  return <Glyph size={size} role="img" aria-label={label} focusable="false" />;
}
