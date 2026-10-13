import Link from "next/link";
import { MessageSquareText, Store } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { reviewerName } from "@/lib/reviews/rules";
import { getBusinessReviews, getReviewEligibility } from "@/lib/reviews/server";
import { ReportBusinessButton } from "@/components/business/public/report-business";
import { buttonVariants } from "@/components/ui/button";
import { OwnerReplyForm, ReportReviewButton, ReviewForm } from "./review-forms";
import { Stars } from "./stars";

const dateFmt = new Intl.DateTimeFormat("en-NG", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Africa/Lagos",
});

type Business = {
  id: string;
  slug: string;
  name: string;
  ownerId: string;
  status: string;
};

const NOT_ELIGIBLE: Record<string, string> = {
  UNCONFIRMED: "Confirm your email address to write a review.",
  NO_CONTACT:
    "To keep reviews genuine, you can review this business after contacting it through CustomerHowFar (WhatsApp, call or email) while logged in.",
};

/** Rating summary, the viewer's review form (if allowed) and the list of reviews. */
export async function ReviewsSection({
  business,
  interactive,
}: {
  business: Business;
  /** False on owner/admin previews of a listing that isn't live. */
  interactive: boolean;
}) {
  const viewer = await getCurrentUser().catch(() => null);
  const { reviews, breakdown } = await getBusinessReviews(business.id, viewer?.id ?? null);
  const published = reviews.filter((r) => r.status === "PUBLISHED");
  const total = breakdown.reduce((n, b) => n + b.count, 0);
  const average = total ? breakdown.reduce((n, b) => n + b.stars * b.count, 0) / total : 0;
  const isOwner = viewer?.id === business.ownerId;
  const own = viewer ? reviews.find((r) => r.userId === viewer.id) : undefined;
  const eligibility =
    interactive && viewer && !isOwner ? await getReviewEligibility(viewer.id, business) : null;
  const loginHref = `/login?next=${encodeURIComponent(`/business/${business.slug}`)}`;

  return (
    <div className="space-y-8">
      <section aria-labelledby="reviews-title" className="space-y-5">
        <h2
          id="reviews-title"
          className="flex scroll-mt-24 items-center gap-2 text-lg font-semibold text-gray-900"
        >
          <MessageSquareText aria-hidden="true" className="size-5 text-gray-500" />
          Reviews
        </h2>

        {total > 0 ? (
          <div className="grid grid-cols-1 gap-4 rounded-xl border border-border bg-white p-4 sm:grid-cols-[10rem_minmax(0,1fr)] sm:p-5">
            <div>
              <p className="text-4xl font-bold text-gray-900 tabular-nums">{average.toFixed(1)}</p>
              <Stars value={average} />
              <p className="mt-1 text-sm text-gray-700">
                {total} review{total === 1 ? "" : "s"}
              </p>
            </div>
            <ul aria-label="Rating breakdown" className="space-y-1.5">
              {breakdown.map((b) => (
                <li key={b.stars} className="flex items-center gap-2 text-sm text-gray-700">
                  <span className="w-12 shrink-0">
                    {b.stars} star{b.stars === 1 ? "" : "s"}
                  </span>
                  <span
                    aria-hidden="true"
                    className="h-2 flex-1 overflow-hidden rounded-full bg-gray-200"
                  >
                    <span
                      className="block h-full rounded-full bg-accent-400"
                      style={{ width: `${total ? (b.count / total) * 100 : 0}%` }}
                    />
                  </span>
                  <span className="w-8 shrink-0 text-right tabular-nums">
                    {b.count}
                    <span className="sr-only"> review{b.count === 1 ? "" : "s"}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-sm text-gray-700">No reviews yet.</p>
        )}

        {interactive && (
          <div>
            {!viewer ? (
              <p className="rounded-xl bg-muted p-4 text-sm text-gray-800">
                Have you used this business?{" "}
                <Link href={loginHref} className="font-semibold text-brand-700 underline">
                  Log in to write a review
                </Link>
                .
              </p>
            ) : isOwner ? (
              <p className="flex items-start gap-2 rounded-xl bg-muted p-4 text-sm text-gray-800">
                <Store aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                This is your business. You can reply to each review below.
              </p>
            ) : own || eligibility?.ok ? (
              <ReviewForm
                businessId={business.id}
                existing={
                  own
                    ? {
                        id: own.id,
                        rating: own.rating,
                        comment: own.comment ?? "",
                        hidden: own.status === "HIDDEN",
                      }
                    : null
                }
              />
            ) : eligibility && !eligibility.ok && NOT_ELIGIBLE[eligibility.reason] ? (
              <p className="rounded-xl bg-muted p-4 text-sm text-gray-800">
                {NOT_ELIGIBLE[eligibility.reason]}
              </p>
            ) : null}
          </div>
        )}

        {reviews.length > 0 && (
          <ol aria-label="Customer reviews" className="space-y-4">
            {reviews.map((r) => {
              const mine = r.userId === viewer?.id;
              if (r.status !== "PUBLISHED" && !mine) return null;
              return (
                <li key={r.id}>
                  <article
                    aria-label={`Review by ${reviewerName(r.user.fullName)}`}
                    className="rounded-xl border border-border bg-white p-4"
                  >
                    <header className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-semibold text-gray-900">
                        {reviewerName(r.user.fullName)}
                        {mine && (
                          <span className="ml-1 text-sm font-normal text-gray-600">(you)</span>
                        )}
                      </p>
                      <time dateTime={r.createdAt.toISOString()} className="text-xs text-gray-600">
                        {dateFmt.format(r.createdAt)}
                      </time>
                    </header>
                    <Stars value={r.rating} size="sm" className="mt-1" />
                    {r.status === "HIDDEN" && (
                      <p className="mt-2 text-xs font-medium text-gray-700">
                        Hidden by our team. Only you can see it.
                      </p>
                    )}
                    {r.comment && (
                      <p className="mt-2 text-sm leading-6 whitespace-pre-line text-gray-800">
                        {r.comment}
                      </p>
                    )}
                    {r.ownerReply && (
                      <div className="mt-3 rounded-lg border-l-4 border-brand-600 bg-brand-50 p-3 text-sm text-gray-800">
                        <p className="font-semibold text-brand-900">Reply from {business.name}</p>
                        <p className="mt-1 whitespace-pre-line">{r.ownerReply}</p>
                      </div>
                    )}
                    {interactive && isOwner && r.status === "PUBLISHED" && (
                      <OwnerReplyForm reviewId={r.id} existingReply={r.ownerReply} />
                    )}
                    {interactive && viewer && !mine && r.status === "PUBLISHED" && (
                      <div className="mt-2 flex justify-end">
                        <ReportReviewButton reviewId={r.id} />
                      </div>
                    )}
                  </article>
                </li>
              );
            })}
          </ol>
        )}
        {published.length === 50 && (
          <p className="text-sm text-gray-600">Showing the 50 most recent reviews.</p>
        )}
      </section>

      {interactive && !isOwner && (
        <div className="border-t border-border pt-4">
          {viewer ? (
            <ReportBusinessButton businessId={business.id} businessName={business.name} />
          ) : (
            <Link
              href={loginHref}
              className={buttonVariants({ variant: "ghost", className: "px-0 text-gray-700" })}
            >
              Log in to report this business
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

export function ReviewsSkeleton() {
  return <div aria-hidden="true" className="h-48 animate-pulse rounded-xl bg-muted" />;
}
