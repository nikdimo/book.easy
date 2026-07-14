"use client";

import { useState } from "react";
import { splitDescriptionPreview } from "@/lib/utils/description-preview";

export function ExpandableDescription({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const { visible, truncated } = splitDescriptionPreview(text);

  return (
    <div>
      <p className="whitespace-pre-line leading-relaxed text-muted-foreground">
        {expanded || !truncated ? text : `${visible}…`}
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
