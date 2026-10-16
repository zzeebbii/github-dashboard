import { useT } from "../../application/i18n.tsx";

/** Placeholder home page, rendered inside the shell's `main`. The real Home sections arrive with T20. */
export function HomePage() {
  const t = useT();
  return <h1>{t("appTitle")}</h1>;
}
