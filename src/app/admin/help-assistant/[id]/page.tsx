import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireAdmin } from "@/lib/auth/session";
import { getLiveFacts } from "@/lib/help/server";
import { prisma } from "@/lib/prisma";
import { FaqForm } from "@/components/admin/faq-form";

export const metadata: Metadata = { title: "Edit help answer" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function EditFaq({ params }: { params: PageProps<"/admin/help-assistant/[id]">["params"] }) {
  await requireAdmin();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const [entry, facts] = await Promise.all([
    prisma.faqEntry.findUnique({
      where: { id },
      select: {
        id: true,
        slug: true,
        question: true,
        answer: true,
        keywords: true,
        category: true,
        isActive: true,
      },
    }),
    getLiveFacts(),
  ]);
  if (!entry) notFound();
  return (
    <FaqForm
      facts={facts}
      initial={{ ...entry, keywords: entry.keywords.join("\n") }}
    />
  );
}

export default function EditFaqPage(props: PageProps<"/admin/help-assistant/[id]">) {
  return (
    <>
      <Link
        href="/admin/help-assistant"
        className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-brand-700 underline underline-offset-2"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Help assistant
      </Link>
      <h1 className="mb-4 text-2xl font-bold tracking-tight text-gray-900">Edit help answer</h1>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-muted" aria-hidden="true" />}>
        <EditFaq params={props.params} />
      </Suspense>
    </>
  );
}
