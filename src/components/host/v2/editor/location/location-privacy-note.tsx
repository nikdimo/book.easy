import { Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Resolved } from "@/lib/i18n/t";
import { EXACT_LOCATION_UNLOCK_DAYS } from "@/lib/utils/street-view-access";

/** Both the server `Translator` and the client one expose exactly this, which is why
 *  this component can be rendered inside the client workspace and in a plain
 *  server-rendered test without a provider. */
type Resolve = (key: string, source: string) => Resolved;

/**
 * What guests can see, in one line.
 *
 * This started as a panel with two icons and a bulleted list, which is a lot of
 * furniture for a fact a host needs once. The honest short version is the host's own
 * public line quoted back at them: seeing "Centar, Skopje" and nothing else says
 * everything a list of exclusions would, and it sits under the map where the question
 * actually comes up.
 */
export function LocationPrivacyNote({
  resolve,
  area,
  city,
  country,
  className,
}: {
  resolve: Resolve;
  area: string;
  city: string;
  country: string;
  className?: string;
}) {
  const publicLine = [area, city, country]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(", ");

  return (
    <p
      className={cn(
        "flex items-start gap-2 text-[13px] leading-5 text-slate-500",
        className,
      )}
    >
      <Eye className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      <span>
        {publicLine ? (
          <>
            {resolve("host.editor.location.public_prefix", "Guests see").text}{" "}
            {/* The host's own place names — never machine-translated in place. */}
            <span className="notranslate font-medium text-slate-700" translate="no">
              {publicLine}
            </span>
            {". "}
            {
              resolve(
                "host.editor.location.private_rest",
                "The street address, pin and Street View stay private until {days} days before check-in for a confirmed booking, when guests receive arrival instructions.",
              ).text.replace("{days}", String(EXACT_LOCATION_UNLOCK_DAYS))
            }
          </>
        ) : (
          resolve(
            "host.editor.location.public_empty",
            "Guests see only the area, city and country. Fill those in to see the exact line.",
          ).text
        )}
      </span>
    </p>
  );
}
