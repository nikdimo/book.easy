"use client";

import { useState } from "react";
import type {
  ReviewDirection,
  ReviewRatingCategory,
} from "@prisma/client";
import { useRouter } from "next/navigation";
import { LockKeyhole, Star } from "lucide-react";
import { toast } from "sonner";
import { submitReviewAction } from "@/lib/actions/review.actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { Tx, useI18n } from "@/lib/i18n/client";

function categoryCopy(resolve: ReturnType<typeof useI18n>["resolve"], direction: ReviewDirection, value: ReviewRatingCategory) {
  if (direction === "GUEST_TO_HOST") {
    switch (value) {
      case "OVERALL": return { label: resolve("review.category.guest.overall", "Overall stay").text, hint: resolve("review.category.guest.overall_hint", "How was the experience as a whole?").text };
      case "CLEANLINESS": return { label: resolve("review.category.cleanliness", "Cleanliness").text, hint: resolve("review.category.guest.cleanliness_hint", "Was the home clean and ready?").text };
      case "ACCURACY": return { label: resolve("review.category.accuracy", "Accuracy").text, hint: resolve("review.category.accuracy_hint", "Did the listing match what was promised?").text };
      case "CHECK_IN": return { label: resolve("review.category.check_in", "Check-in").text, hint: resolve("review.category.check_in_hint", "Was arrival clear and straightforward?").text };
      case "COMMUNICATION": return { label: resolve("review.category.communication", "Communication").text, hint: resolve("review.category.guest.communication_hint", "Was the host responsive and helpful?").text };
      case "LOCATION": return { label: resolve("review.category.location", "Location").text, hint: resolve("review.category.location_hint", "How was the area for your trip?").text };
      case "VALUE": return { label: resolve("review.category.value", "Value").text, hint: resolve("review.category.value_hint", "Did the stay feel worth the price?").text };
      default: break;
    }
  }
  switch (value) {
    case "OVERALL": return { label: resolve("review.category.host.overall", "Overall experience").text, hint: resolve("review.category.host.overall_hint", "How was hosting this guest?").text };
    case "CLEANLINESS": return { label: resolve("review.category.cleanliness", "Cleanliness").text, hint: resolve("review.category.host.cleanliness_hint", "How was the home left after checkout?").text };
    case "COMMUNICATION": return { label: resolve("review.category.communication", "Communication").text, hint: resolve("review.category.host.communication_hint", "Was the guest clear and responsive?").text };
    case "HOUSE_RULES": return { label: resolve("review.category.house_rules", "House rules").text, hint: resolve("review.category.house_rules_hint", "Did the guest respect the agreed rules?").text };
    default: return { label: value, hint: "" };
  }
}

const guestCategories: Array<{
  value: ReviewRatingCategory;
  label: string;
  hint: string;
}> = [
  { value: "OVERALL", label: "Overall stay", hint: "How was the experience as a whole?" },
  { value: "CLEANLINESS", label: "Cleanliness", hint: "Was the home clean and ready?" },
  { value: "ACCURACY", label: "Accuracy", hint: "Did the listing match what was promised?" },
  { value: "CHECK_IN", label: "Check-in", hint: "Was arrival clear and straightforward?" },
  { value: "COMMUNICATION", label: "Communication", hint: "Was the host responsive and helpful?" },
  { value: "LOCATION", label: "Location", hint: "How was the area for your trip?" },
  { value: "VALUE", label: "Value", hint: "Did the stay feel worth the price?" },
];

const hostCategories: Array<{
  value: ReviewRatingCategory;
  label: string;
  hint: string;
}> = [
  { value: "OVERALL", label: "Overall experience", hint: "How was hosting this guest?" },
  { value: "CLEANLINESS", label: "Cleanliness", hint: "How was the home left after checkout?" },
  { value: "COMMUNICATION", label: "Communication", hint: "Was the guest clear and responsive?" },
  { value: "HOUSE_RULES", label: "House rules", hint: "Did the guest respect the agreed rules?" },
];

function StarPicker({
  value,
  onChange,
  label,
}: {
  value?: number;
  onChange: (score: number) => void;
  label: string;
}) {
  const { resolve } = useI18n();
  return (
    <div className="flex gap-1" role="radiogroup" aria-label={label}>
      {[1, 2, 3, 4, 5].map((score) => (
        <button
          key={score}
          type="button"
          role="radio"
          aria-checked={value === score}
          aria-label={resolve("review.score_out_of_five", "{score} out of 5").text.replace("{score}", String(score))}
          onClick={() => onChange(score)}
          className="rounded-md p-1 text-amber-500 transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Star
            className={cn(
              "h-8 w-8",
              value && score <= value ? "fill-current" : "fill-transparent"
            )}
            strokeWidth={1.6}
          />
        </button>
      ))}
    </div>
  );
}

export function RatingForm({
  bookingId,
  direction,
  otherPartyName,
}: {
  bookingId: string;
  direction: ReviewDirection;
  otherPartyName: string;
}) {
  const { resolve } = useI18n();
  const router = useRouter();
  const categories = (direction === "GUEST_TO_HOST" ? guestCategories : hostCategories).map((category) => ({
    ...category,
    ...categoryCopy(resolve, direction, category.value),
  }));
  const [ratings, setRatings] = useState<
    Partial<Record<ReviewRatingCategory, number>>
  >({});
  const [publicComment, setPublicComment] = useState("");
  const [privateNote, setPrivateNote] = useState("");
  const [pending, setPending] = useState(false);
  const allRated = categories.every(({ value }) => ratings[value]);

  async function submit() {
    if (!allRated) {
      toast.error(resolve("review.complete_categories", "Choose a star rating for every category").text);
      return;
    }
    setPending(true);
    const formData = new FormData();
    formData.set("bookingId", bookingId);
    formData.set("ratings", JSON.stringify(ratings));
    formData.set("publicComment", publicComment);
    formData.set("privateNote", privateNote);
    const result = await submitReviewAction(formData);
    setPending(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success(resolve("review.submitted", "Your rating was submitted privately").text);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold"><Tx k="review.heading" source="How did it go?" /></h2>
        <p className="mt-1 text-muted-foreground">
          {resolve("review.rate_with", "Rate your experience with {name}.").text.replace("{name}", otherPartyName)}
        </p>
      </div>

      <div className="space-y-3">
        {categories.map((category, index) => (
          <div
            key={category.value}
            className={cn(
              "flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between",
              index > 0 && "border-t"
            )}
          >
            <div>
              <p className="font-medium">{category.label}</p>
              <p className="text-sm text-muted-foreground">{category.hint}</p>
            </div>
            <StarPicker
              value={ratings[category.value]}
              label={category.label}
              onChange={(score) =>
                setRatings((current) => ({ ...current, [category.value]: score }))
              }
            />
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <Label htmlFor="public-review"><Tx k="review.public" source="Public review" /></Label>
        <Textarea
          id="public-review"
          value={publicComment}
          onChange={(event) => setPublicComment(event.target.value)}
          minLength={10}
          maxLength={2000}
          rows={5}
          placeholder={
            direction === "GUEST_TO_HOST"
              ? resolve("review.public_guest_placeholder", "What should future guests know about this stay?").text
              : resolve("review.public_host_placeholder", "What should future hosts know about this guest?").text
          }
        />
        <p className="text-xs text-muted-foreground">
          <Tx k="review.public_notice" source="This appears publicly only after the double-blind window and admin approval." />
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="private-note"><Tx k="review.private_note" source="Private note (optional)" /></Label>
        <Textarea
          id="private-note"
          value={privateNote}
          onChange={(event) => setPrivateNote(event.target.value)}
          maxLength={2000}
          rows={3}
          placeholder={resolve("review.private_placeholder", "Only {name} and Linger Homes administrators can read this.").text.replace("{name}", otherPartyName)}
        />
      </div>

      <div className="flex gap-3 rounded-xl bg-muted p-4 text-sm text-muted-foreground">
        <LockKeyhole className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <p>
          <Tx k="review.sealed_notice" source="Your rating is sealed. Neither side can see the other's stars or comments before submitting, and public content is reviewed by an administrator." />
        </p>
      </div>

      <Button
        size="lg"
        className="w-full"
        disabled={pending || !allRated || publicComment.trim().length < 10}
        onClick={() => void submit()}
      >
        {pending
          ? resolve("common.submitting", "Submitting...").text
          : resolve("review.submit", "Submit private rating").text}
      </Button>
    </div>
  );
}
