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
import { SelectField } from "@/components/shared/select-field";
import { reviewSuggestion } from "@/lib/actions/suggestion.actions";
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
  /** Live catalog groups, so a category added in Settings is offered here too. */
  categories: { id: string; name: string }[];
}

export function SuggestionReviewCard({
  suggestion,
  categories,
}: SuggestionReviewCardProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [label, setLabel] = useState(suggestion.label);
  // Empty means "let the label decide", which is the right default for a label an
  // admin has not looked at yet.
  const [categoryId, setCategoryId] = useState("");
  const [scope, setScope] = useState<"GLOBAL" | "LISTING_ONLY">(
    suggestion.listing ? "LISTING_ONLY" : "GLOBAL"
  );
  const [adminNote, setAdminNote] = useState("");

  function approve() {
    startTransition(async () => {
      const result = await reviewSuggestion(suggestion.id, {
        decision: "APPROVED",
        label,
        categoryId: suggestion.kind === "AMENITY" ? categoryId : undefined,
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
              {/* "Decide from the label" is a real choice rather than an empty field,
                  so it stays an option; `SelectField` carries its empty value through
                  unchanged. */}
              <SelectField
                id={`category-${suggestion.id}`}
                value={categoryId}
                onValueChange={setCategoryId}
                options={[
                  { value: "", label: "Decide from the label" },
                  ...categories.map((category) => ({
                    value: category.id,
                    label: category.name,
                  })),
                ]}
                className="h-9 bg-transparent data-[size=default]:h-9 md:data-[size=default]:h-9"
              />
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
