"use client";

import { useState } from "react";
import { splitDescriptionPreview } from "@/lib/utils/description-preview";

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
      <span key={`${part}-${index}`} translate="no">{part}</span>
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
  const { visible, truncated } = splitDescriptionPreview(text);

  return (
    <div>
      <p className="whitespace-pre-line leading-relaxed text-muted-foreground">
        {expanded || !truncated ? (
          <PreservedPlaceText text={text} placeNames={preservePlaceNames} />
        ) : (
          <>
            <PreservedPlaceText text={visible} placeNames={preservePlaceNames} />…
          </>
        )}
      </p>
      {truncated && (
        <button
          type="button"
          onClick={() => setExpanded((current) => !current)}
          className="mt-2 text-sm font-semibold text-foreground underline underline-offset-2 hover:text-foreground/80"
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}
