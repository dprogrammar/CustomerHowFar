import { Images, MessageCircle, Search, type LucideIcon } from "lucide-react";
import { Container } from "@/components/ui/container";
import { isListingFeeOn } from "@/lib/payments/fee-switch";
import { SectionHeading } from "./section-heading";

const STEPS: { title: string; description: string; icon: LucideIcon }[] = [
  {
    title: "Search",
    description: "Tell us the service you need and your state. We show you businesses near you.",
    icon: Search,
  },
  {
    title: "View their work",
    description: "Browse real photos of past jobs, read reviews and compare before you decide.",
    icon: Images,
  },
  {
    title: "Contact on WhatsApp",
    description: "Chat with the business directly to agree on price and timing. No middlemen.",
    icon: MessageCircle,
  },
];

export async function HowItWorks() {
  // While listing is free (fee switch off), say it's free for everyone.
  const feeOn = await isListingFeeOn();
  return (
    <section id="how-it-works" aria-labelledby="how-title" className="bg-surface py-12 sm:py-16">
      <Container>
        <SectionHeading
          id="how-title"
          eyebrow="How it works"
          title="Get the job done in 3 easy steps"
          description={feeOn ? undefined : "Free for customers, and free for businesses to list."}
          align="center"
        />

        <ol className="grid grid-cols-1 gap-4 sm:gap-6 md:grid-cols-3">
          {STEPS.map(({ title, description, icon: Icon }, index) => (
            <li
              key={title}
              className="relative flex gap-4 rounded-xl border border-border bg-white p-5 shadow-card md:flex-col md:p-6"
            >
              <span className="relative flex size-12 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white">
                <Icon aria-hidden="true" className="size-6" />
                <span
                  aria-hidden="true"
                  className="absolute -top-2 -right-2 flex size-6 items-center justify-center rounded-full bg-accent-400 text-xs font-bold text-gray-950 ring-2 ring-white"
                >
                  {index + 1}
                </span>
              </span>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  <span className="sr-only">Step {index + 1}: </span>
                  {title}
                </h3>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
              </div>
            </li>
          ))}
        </ol>
      </Container>
    </section>
  );
}
