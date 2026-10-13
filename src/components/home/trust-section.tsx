import { Camera, MessageCircle, ShieldCheck, type LucideIcon } from "lucide-react";
import { Container } from "@/components/ui/container";
import { SectionHeading } from "./section-heading";

const POINTS: { title: string; description: string; icon: LucideIcon }[] = [
  {
    title: "Reviewed listings",
    description:
      "Our team reviews every listing before it goes live. The \u201cID submitted\u201d badge means the owner shared a government ID and selfie, which we checked by eye.",
    icon: ShieldCheck,
  },
  {
    title: "Real work photos",
    description:
      "See photos of jobs a business has actually done, so you know the quality before you call.",
    icon: Camera,
  },
  {
    title: "Direct contact",
    description:
      "Talk to the business yourself on WhatsApp or by phone. No middlemen and no booking fees.",
    icon: MessageCircle,
  },
];

export function TrustSection() {
  return (
    <section aria-labelledby="trust-title" className="py-12 sm:py-16">
      <Container>
        <SectionHeading
          id="trust-title"
          eyebrow="Why CustomerHowFar"
          title="Hire with confidence"
          align="center"
        />
        <ul className="grid grid-cols-1 gap-4 sm:gap-6 md:grid-cols-3">
          {POINTS.map(({ title, description, icon: Icon }) => (
            <li key={title} className="flex gap-4 md:flex-col md:items-center md:text-center">
              <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-accent-50 text-accent-700 ring-1 ring-accent-200">
                <Icon aria-hidden="true" className="size-6" />
              </span>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
              </div>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}
