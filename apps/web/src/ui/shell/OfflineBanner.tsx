import { WifiOff } from "lucide-react";
import { Icon } from "../Icon.tsx";

/**
 * Shown under the header while offline, with when the data was last refreshed (FR-3.11,
 * AC-3.9). Not a live region: the container announces going offline once, politely.
 */
export function OfflineBanner({ message }: { readonly message: string }) {
  return (
    <p className="offline-banner">
      <Icon icon={WifiOff} size={14} />
      {message}
    </p>
  );
}
