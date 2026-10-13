import { Suspense } from "react";
import type { Metadata } from "next";
import { ContentPage } from "@/components/content/content-page";
import { UnsubscribeForm } from "@/components/service-areas/unsubscribe-form";

export const metadata: Metadata = {
  title: "Unsubscribe from the waitlist",
  robots: { index: false, follow: false },
};

async function Form({ searchParams }: Pick<PageProps<"/waitlist/unsubscribe">, "searchParams">) {
  const token = (await searchParams).token;
  return <UnsubscribeForm token={typeof token === "string" ? token : ""} />;
}

/**
 * Linked from every waitlist email. A button (not the link itself) confirms, so email security
 * scanners that open links can't unsubscribe people by accident.
 */
export default function UnsubscribePage({ searchParams }: PageProps<"/waitlist/unsubscribe">) {
  return (
    <ContentPage title="Unsubscribe from the waitlist">
      <Suspense
        fallback={<div aria-hidden="true" className="h-24 animate-pulse rounded-xl bg-muted" />}
      >
        <Form searchParams={searchParams} />
      </Suspense>
    </ContentPage>
  );
}
