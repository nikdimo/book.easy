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
  return (
    <div className="flex gap-1" role="radiogroup" aria-label={label}>
      {[1, 2, 3, 4, 5].map((score) => (
        <button
          key={score}
          type="button"
          role="radio"
          aria-checked={value === score}
          aria-label={`${score} out of 5`}
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
  const router = useRouter();
  const categories = direction === "GUEST_TO_HOST" ? guestCategories : hostCategories;
  const [ratings, setRatings] = useState<
    Partial<Record<ReviewRatingCategory, number>>
  >({});
  const [publicComment, setPublicComment] = useState("");
  const [privateNote, setPrivateNote] = useState("");
  const [pending, setPending] = useState(false);
  const allRated = categories.every(({ value }) => ratings[value]);

  async function submit() {
    if (!allRated) {
      toast.error("Choose a star rating for every category");
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
    toast.success("Your rating was submitted privately");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">How did it go?</h2>
        <p className="mt-1 text-muted-foreground">
          Rate your experience with {otherPartyName}.
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
        <Label htmlFor="public-review">Public review</Label>
        <Textarea
          id="public-review"
          value={publicComment}
          onChange={(event) => setPublicComment(event.target.value)}
          minLength={10}
          maxLength={2000}
          rows={5}
          placeholder={
            direction === "GUEST_TO_HOST"
              ? "What should future guests know about this stay?"
              : "What should future hosts know about this guest?"
          }
        />
        <p className="text-xs text-muted-foreground">
          This appears publicly only after the double-blind window and admin approval.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="private-note">Private note (optional)</Label>
        <Textarea
          id="private-note"
          value={privateNote}
          onChange={(event) => setPrivateNote(event.target.value)}
          maxLength={2000}
          rows={3}
          placeholder={`Only ${otherPartyName} and BookEasy administrators can read this.`}
        />
      </div>

      <div className="flex gap-3 rounded-xl bg-muted p-4 text-sm text-muted-foreground">
        <LockKeyhole className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <p>
          Your rating is sealed. Neither side can see the other&apos;s stars or
          comments before submitting, and public content is reviewed by an administrator.
        </p>
      </div>

      <Button
        size="lg"
        className="w-full"
        disabled={pending || !allRated || publicComment.trim().length < 10}
        onClick={() => void submit()}
      >
        {pending ? "Submitting..." : "Submit private rating"}
      </Button>
    </div>
  );
}
