# CustomerHowFar data model

The schema lives in [`prisma/schema.prisma`](../prisma/schema.prisma). PostgreSQL on Supabase,
accessed only through Prisma on the server. Every table has Row Level Security enabled with no
policies, so the public Supabase Data API cannot read or write anything.

## Conventions

- **Tables and columns** are `snake_case` (mapped with `@map`); Prisma models are `PascalCase`.
- **IDs**: UUIDv7 (time-ordered, index-friendly) for user-generated rows; integers for the small
  reference tables (`states`, `lgas`); bigint for high-volume analytics (`contact_events`).
- **Money** is stored in **kobo** as integers (`amountKobo`), never floats. ₦5,000 = 500000.
- **Phone numbers** are stored in E.164 form: `+234XXXXXXXXXX`.
- **Images** are stored as Cloudinary public IDs, never URLs. Build URLs with
  `src/lib/images.ts`.
- **Timestamps**: every mutable table has `created_at` and `updated_at`.
- **Integrity rules the schema language can't express** live as `CHECK` constraints in the
  migration: rating 1–5, positive payment amounts, non-negative counters, etc.

## Models

| Model                | Purpose                                                                                                                                                                                                                                                                                                                 |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AppSetting`         | Single row (id 1) of global admin settings: `paymentRequired` (listing fee on/off) and `listingFeeNaira`.                                                                                                                                                                                                               |
| `Profile`            | App profile for a Supabase Auth user (same UUID). Name, phone, avatar and `role` (`CUSTOMER`, `BUSINESS_OWNER`, `ADMIN`).                                                                                                                                                                                               |
| `Category`           | Service categories (e.g. Electricians). `slug` is permanent. `icon` is a lucide icon name resolved via `src/config/category-icons.ts`. `parentId` allows subcategories. Deactivate (`isActive = false`) instead of deleting.                                                                                            |
| `State`              | The 36 states plus the FCT (37 rows).                                                                                                                                                                                                                                                                                   |
| `Lga`                | All 774 Local Government Areas, each linked to its state. Slugs are unique _per state_ (Surulere exists in Lagos and Oyo).                                                                                                                                                                                              |
| `Business`           | A listing owned by a `Profile`: name, category, contact details (phone, WhatsApp, email), address, state + LGA, services, opening hours (JSON), social links, logo/cover images, status, verification and featured flags, and denormalized counters (`viewCount`, `contactClickCount`, `ratingAverage`, `reviewCount`). |
| `BusinessPhoto`      | Work photos for a business (Cloudinary public ID, dimensions, caption, order). Max 12 per business, enforced in app code.                                                                                                                                                                                               |
| `Payment`            | Listing-fee payments via Paystack: amount in kobo, unique `reference` (makes webhooks idempotent), status, `paidAt`, raw provider `metadata`.                                                                                                                                                                           |
| `Review`             | A customer's rating (1–5) and comment. One per user per business. `HIDDEN` reviews are kept but not shown.                                                                                                                                                                                                              |
| `SavedBusiness`      | A user's saved/favourite businesses (composite key: user + business).                                                                                                                                                                                                                                                   |
| `ContactEvent`       | One row per WhatsApp/call/email click, for analytics. `userId` is null for signed-out visitors.                                                                                                                                                                                                                         |
| `ModerationDecision` | Append-only history of admin decisions on a business: `action` (`APPROVED`, `REJECTED`, `SUSPENDED`, `REINSTATED`), `comment`, admin, time. The latest `REJECTED` comment is shown to the owner as "Changes requested". (Named to avoid confusion with customer `Review`s.)                                             |

| `SettingChange` | Audit log of admin changes to `AppSetting`: field, old and new value, admin, time.

### Moderation and payment fairness

- `ModerationDecision.action` also records `RECHECKED`, `VERIFIED`/`UNVERIFIED` and
  `FEATURED`/`UNFEATURED`, so every admin change to a listing is in its history.
- Admin actions only apply if the listing's status is still what the admin saw (row lock +
  status check), so two admins can't act on the same listing at once.
- `Business.feeRequiredAtSubmit` records whether the listing fee was on when the owner last
  submitted. Approval requires a `SUCCESS` payment only when it is true; listings submitted
  while the fee was off are honored for free even if the fee is switched on later.
- Admin access: `requireAdmin()` (database role) guards every admin page and action. The proxy
  also returns a real 404 for `/admin` unless the login token's `app_metadata.role` is
  `admin` (set by `npm run make-admin`).

### Onboarding fields on `Business`

- `submittedAt`: last time the owner sent the listing for review; the admin queue is ordered by it.
- `needsRecheck`: set when the owner edits a live (`APPROVED`) listing. It stays live, but admins
  should look again. Cleared on (re)submission.
- `address`, `stateId`, `lgaId` are nullable because a draft is created at wizard step 1 and the
  location is added at step 2. Database CHECK constraints guarantee an LGA is never set without
  its state, and that anything past `DRAFT` has a complete location.
- Owners may have at most **5** businesses; a business at most **12** work photos (both enforced
  on the server with row locks, so they can't be raced).
- Images are uploaded straight from the browser to Cloudinary into a per-user folder
  (`customerhowfar/users/<userId>/`). Saving a photo verifies it exists, is in that user's folder,
  is jpg/png/webp and is at most 5 MB. Removed or replaced images are deleted from Cloudinary.

### Key relationships and delete rules

- **Profile → Business**: one owner, many businesses. Deleting a profile deletes their
  businesses, **unless** payments exist (see below).
- **Business → photos, reviews, saved, contact events**: cascade delete with the business.
- **Business → Category / State / LGA**: `RESTRICT`. Categories and locations in use can't be
  deleted; deactivate them instead.
- **Business → LGA uses a composite foreign key `(lga_id, state_id)`**, so the database itself
  guarantees a business's LGA belongs to its state.
- **Payment → Business / Profile**: `RESTRICT`. Financial records are never deleted, so a
  business or profile with payments can't be hard-deleted. Suspend or anonymize instead.
- **ContactEvent → Profile**: `SET NULL`, so analytics survive account deletion.
- **Profile ↔ Supabase `auth.users`**: no database-level foreign key (Prisma manages only the
  `public` schema). Auth is the source of truth; profiles are created on first sign-in.

### Indexes for the main queries

Public listings always filter on `status = APPROVED`, so the business indexes lead with
`status` or pair it with the filter column:

- newest: `(status, created_at DESC)`
- featured: `(status, is_featured)`
- by category: `(category_id, status)`
- by state: `(state_id, status)`
- by LGA: `(lga_id, state_id, status)` (also serves the composite foreign key)
- owner dashboard: `(owner_id)`; admin queue: `(created_at DESC)`

Full-text search will need its own index (Postgres `tsvector`/trigram) when search is built.

## Business status flow

```mermaid
stateDiagram-v2
    [*] --> DRAFT: owner starts a listing
    DRAFT --> PENDING_PAYMENT: submit (paymentRequired = true)
    DRAFT --> PENDING_REVIEW: submit (paymentRequired = false)
    PENDING_PAYMENT --> PENDING_REVIEW: Paystack payment SUCCESS
    PENDING_REVIEW --> APPROVED: admin approves (sets publishedAt the first time)
    PENDING_REVIEW --> REJECTED: admin rejects (sets rejectionReason)
    REJECTED --> PENDING_REVIEW: owner fixes and resubmits
    APPROVED --> SUSPENDED: admin suspends
    SUSPENDED --> APPROVED: admin reinstates
```

- Status changes happen only on the server (`src/lib/business/actions.ts`); nothing the browser
  sends can set a status. Owners can't edit `SUSPENDED` listings.
- Payment never publishes: a confirmed payment moves `PENDING_PAYMENT` to `PENDING_REVIEW`
  (`src/lib/business/payments.ts`), and only an admin can approve.
- A business with a `SUCCESS` payment is never asked to pay again (after edits, rejection or
  resubmission). If the fee is switched off while a listing awaits payment, the owner can submit
  it for review without paying.
- Only **`APPROVED`** businesses are shown publicly.
- **`DRAFT`** listings are visible only to their owner and can be edited freely.
- Whether payment is required is read from `AppSetting.paymentRequired` **at submit time**.
- A rejected business keeps its data; the owner edits and resubmits. If it has already paid,
  it does not pay again.

## Reference data and seeding

`npm run db:seed` (idempotent, safe to re-run):

- **Categories** come from `src/config/categories.ts`. The first 12 are the homepage's
  "Popular categories". Re-seeding updates names, icons, descriptions and order, but never
  `isActive`.
- **States** come from `src/config/states.ts`; **LGAs** from `prisma/data/nigeria-lgas.ts`
  (1999 Constitution, First Schedule). The seed refuses to run unless there are exactly 37
  states and 774 LGAs with the constitutional count for every state, then re-checks the
  database after writing.
- Nothing is ever deleted by the seed, because businesses may reference these rows.

The app reads categories, states and LGAs from the database through cached functions in
`src/lib/data/catalog.ts` (cached for days/weeks and tagged). After changing reference data,
re-run the seed and redeploy, or call `updateTag()` with the relevant tag from an admin action.
