"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { reviewSuggestion } from "@/lib/actions/suggestion.actions";
import { AMENITY_CATEGORIES } from "@/lib/constants";
import { toast } from "sonner";
import { Check, X } from "lucide-react";

interface SuggestionReviewCardProps {
  suggestion: {
    id: string;
    kind: string;
    label: string;
    note: string | null;
    createdAt: Date;
    host: { name: string; email: string };
    listing: { id: string; title: string; slug: string } | null;
  };
}

export function SuggestionReviewCard({ suggestion }: SuggestionReviewCardProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [label, setLabel] = useState(suggestion.label);
  const [category, setCategory] = useState<string>(AMENITY_CATEGORIES[0]);
  const [scope, setScope] = useState<"GLOBAL" | "LISTING_ONLY">(
    suggestion.listing ? "LISTING_ONLY" : "GLOBAL"
  );
  const [adminNote, setAdminNote] = useState("");

  function approve() {
    startTransition(async () => {
      const result = await reviewSuggestion(suggestion.id, {
        decision: "APPROVED",
        label,
        category: suggestion.kind === "AMENITY" ? category : undefined,
        scope,
        adminNote,
      });
      if (result?.error) toast.error(result.error);
      else {
        toast.success(
          scope === "GLOBAL" ? "Added to the catalog" : "Approved for this listing"
        );
        router.refresh();
      }
    });
  }

  function reject() {
    startTransition(async () => {
      const result = await reviewSuggestion(suggestion.id, {
        decision: "REJECTED",
        adminNote,
      });
      if (result?.error) toast.error(result.error);
      else {
        toast.success("Suggestion rejected");
        router.refresh();
      }
    });
  }

  return (
    <Card>
      <CardContent className="pt-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary">
                {suggestion.kind === "PROPERTY_TYPE" ? "Property type" : "Amenity"}
              </Badge>
              <span className="text-sm text-muted-foreground">
                Suggested by {suggestion.host.name} ({suggestion.host.email})
              </span>
            </div>
            {suggestion.listing && (
              <p className="mt-1 text-sm">
                For listing:{" "}
                <Link
                  href={`/admin/listings/${suggestion.listing.id}`}
                  className="underline underline-offset-2"
                >
                  {suggestion.listing.title}
                </Link>
              </p>
            )}
            {suggestion.note && (
              <p className="mt-1 text-sm text-muted-foreground">&ldquo;{suggestion.note}&rdquo;</p>
            )}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor={`label-${suggestion.id}`}>Label</Label>
            <Input
              id={`label-${suggestion.id}`}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>

          {suggestion.kind === "AMENITY" && (
            <div className="space-y-1.5">
              <Label htmlFor={`category-${suggestion.id}`}>Category</Label>
              <select
                id={`category-${suggestion.id}`}
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="flex h-9 w-full rounded-lg border border-input bg-transparent px-3 py-1 text-sm shadow-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {AMENITY_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <Label>Approve as</Label>
          <div className="flex flex-wrap gap-3">
            {suggestion.listing && (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name={`scope-${suggestion.id}`}
                  checked={scope === "LISTING_ONLY"}
                  onChange={() => setScope("LISTING_ONLY")}
                />
                This listing only
              </label>
            )}
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name={`scope-${suggestion.id}`}
                checked={scope === "GLOBAL"}
                onChange={() => setScope("GLOBAL")}
              />
              Standard option for all future listings
            </label>
          </div>
        </div>

        <Textarea
          placeholder="Admin note (optional)"
          value={adminNote}
          onChange={(e) => setAdminNote(e.target.value)}
          rows={2}
        />

        <div className="flex gap-2">
          <Button disabled={isPending || label.trim().length < 2} onClick={approve}>
            <Check className="h-4 w-4 mr-2" />
            Approve
          </Button>
          <Button variant="destructive" disabled={isPending} onClick={reject}>
            <X className="h-4 w-4 mr-2" />
            Reject
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
