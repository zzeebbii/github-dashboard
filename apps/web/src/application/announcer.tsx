import { createContext, type ReactNode, useCallback, useContext, useState } from "react";
import { createPortal } from "react-dom";

type Announce = (text: string) => void;

const AnnouncerContext = createContext<Announce | undefined>(undefined);

/**
 * The app's one polite live region (FR-1.9, ADR-0021). Status updates such as "refreshed"
 * go through `announce(text)` instead of each component adding its own region. The region
 * sits directly in `<body>`, outside the app's landmarks and layout.
 */
export function AnnouncerProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState({ text: "", id: 0 });
  const announce = useCallback<Announce>((text) => {
    setMessage((previous) => ({ text, id: previous.id + 1 }));
  }, []);

  return (
    <AnnouncerContext value={announce}>
      {children}
      {createPortal(
        <div role="status" aria-live="polite" className="sr-only">
          {/* A fresh node per call, so the same text twice is announced twice. */}
          <span key={message.id}>{message.text}</span>
        </div>,
        document.body,
      )}
    </AnnouncerContext>
  );
}

export function useAnnounce(): Announce {
  const announce = useContext(AnnouncerContext);
  if (announce === undefined)
    throw new Error("useAnnounce must be used inside <AnnouncerProvider>.");
  return announce;
}
