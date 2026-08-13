"use client";

import { useId, useState } from "react";
import { splitDescriptionPreview } from "@/lib/utils/description-preview";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

export function PreservedPlaceText({
  text,
  placeNames,
}: {
  text: string;
  placeNames: string[];
}) {
  const names = placeNames
    .map((name) => name.trim())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  if (names.length === 0) return <>{text}</>;

  const pattern = new RegExp(`(${names.map(escapeRegExp).join("|")})`, "gi");
  return text.split(pattern).map((part, index) => {
    const isPlaceName = names.some((name) => name.toLowerCase() === part.toLowerCase());
    return isPlaceName ? (
      <span
        key={`${part}-${index}`}
        className="notranslate"
        translate="no"
      >
        {part}
      </span>
    ) : (
      <span key={`${part}-${index}`}>{part}</span>
    );
  });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function ExpandableDescription({
  text,
  preservePlaceNames = [],
}: {
  text: string;
  preservePlaceNames?: string[];
}) {
  const [expanded, setExpanded] = useState(false);
  const descriptionId = useId();
  const i18n = useI18n();
  const { truncated } = splitDescriptionPreview(text);
  const showMore = i18n.resolve("description.show_more", "Show more");
  const showLess = i18n.resolve("description.show_less", "Show less");

  return (
    <div>
      <p
        id={descriptionId}
        data-user-generated-content translate="yes"
        className={cn(
          "whitespace-pre-line leading-relaxed text-muted-foreground",
          truncated && !expanded && "line-clamp-5"
        )}
      >
        <PreservedPlaceText text={text} placeNames={preservePlaceNames} />
      </p>
      {truncated && (
        <button
          type="button"
          onClick={() => setExpanded((current) => !current)}
          aria-controls={descriptionId}
          aria-expanded={expanded}
          className="notranslate mt-2 text-sm font-semibold text-foreground underline underline-offset-2 hover:text-foreground/80"
          translate="no"
        >
          <span hidden={expanded}>{showMore.text}</span>
          <span hidden={!expanded}>{showLess.text}</span>
        </button>
      )}
    </div>
  );
}
