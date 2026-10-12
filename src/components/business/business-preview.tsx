import { Clock3, MapPin, MessageCircle, Phone } from "lucide-react";
import { DAYS, type OpeningHours } from "@/lib/business/rules";
import { CategoryIcon } from "@/components/category-icon";
import { CloudinaryImage } from "@/components/cloudinary-image";
import { Badge } from "@/components/ui/badge";

export type PreviewBusiness = {
  name: string;
  tagline: string | null;
  description: string | null;
  yearsOfExperience: number | null;
  services: string[];
  openingHours: unknown;
  phone: string;
  whatsappNumber: string;
  area: string | null;
  logoPublicId: string | null;
  coverPublicId: string | null;
  category: { name: string; icon: string };
  state: { name: string } | null;
  lga: { name: string } | null;
  photos: { id: string; publicId: string; caption: string | null }[];
};

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

/** How the listing will look to customers. Used on the review step. */
export function BusinessPreview({ business }: { business: PreviewBusiness }) {
  const hours = business.openingHours as OpeningHours | null;
  const location = [business.area, business.lga?.name, business.state?.name]
    .filter(Boolean)
    .join(", ");

  return (
    <article className="overflow-hidden rounded-2xl border border-border bg-white shadow-card">
      <div className="relative aspect-[16/7] bg-gradient-to-br from-brand-100 to-accent-100">
        {business.coverPublicId ? (
          <CloudinaryImage
            publicId={business.coverPublicId}
            alt=""
            fill
            sizes="(min-width: 768px) 720px, 100vw"
            className="object-cover"
          />
        ) : (
          <CategoryIcon
            name={business.category.icon}
            aria-hidden="true"
            className="absolute inset-0 m-auto size-14 text-brand-700/30"
          />
        )}
      </div>
      <div className="px-4 pb-5 sm:px-6">
        <div className="-mt-8 flex items-end gap-3">
          <span className="relative flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-brand-700 text-xl font-bold text-white ring-4 ring-white">
            {business.logoPublicId ? (
              <CloudinaryImage
                publicId={business.logoPublicId}
                alt=""
                fill
                sizes="64px"
                className="bg-white object-contain"
              />
            ) : (
              initials(business.name)
            )}
          </span>
        </div>
        <h2 className="mt-3 text-xl font-bold text-gray-900">{business.name}</h2>
        <p className="mt-0.5 text-sm font-medium text-brand-700">{business.category.name}</p>
        {business.tagline && <p className="mt-1 text-gray-700">{business.tagline}</p>}

        <ul className="mt-3 space-y-1 text-sm text-gray-700">
          {location && (
            <li className="flex items-center gap-2">
              <MapPin aria-hidden="true" className="size-4 text-gray-500" />
              {location}
            </li>
          )}
          {business.yearsOfExperience !== null && (
            <li className="flex items-center gap-2">
              <Clock3 aria-hidden="true" className="size-4 text-gray-500" />
              {business.yearsOfExperience} years of experience
            </li>
          )}
        </ul>

        <div className="mt-4 flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white">
            <MessageCircle aria-hidden="true" className="size-4" />
            WhatsApp
          </span>
          <span className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-gray-900 ring-1 ring-border">
            <Phone aria-hidden="true" className="size-4" />
            Call
          </span>
        </div>

        {business.description && (
          <p className="mt-5 text-sm leading-6 whitespace-pre-line text-gray-800">
            {business.description}
          </p>
        )}

        {business.services.length > 0 && (
          <div className="mt-5">
            <h3 className="text-sm font-semibold text-gray-900">Services</h3>
            <ul className="mt-2 flex flex-wrap gap-2">
              {business.services.map((service) => (
                <li key={service}>
                  <Badge variant="brand">{service}</Badge>
                </li>
              ))}
            </ul>
          </div>
        )}

        {hours && (
          <div className="mt-5">
            <h3 className="text-sm font-semibold text-gray-900">Opening hours</h3>
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm text-gray-700">
              {DAYS.map(({ key, label }) => (
                <div key={key} className="contents">
                  <dt>{label}</dt>
                  <dd>{hours[key] ? `${hours[key]!.open} - ${hours[key]!.close}` : "Closed"}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}

        {business.photos.length > 0 && (
          <div className="mt-5">
            <h3 className="text-sm font-semibold text-gray-900">Our work</h3>
            <ul className="mt-2 grid grid-cols-3 gap-2">
              {business.photos.map((photo) => (
                <li
                  key={photo.id}
                  className="relative aspect-square overflow-hidden rounded-lg bg-muted"
                >
                  <CloudinaryImage
                    publicId={photo.publicId}
                    alt={photo.caption ?? `Work photo of ${business.name}`}
                    fill
                    sizes="(min-width: 768px) 240px, 33vw"
                    className="object-cover"
                  />
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </article>
  );
}
