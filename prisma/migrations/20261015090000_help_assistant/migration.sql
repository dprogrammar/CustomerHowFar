-- CreateEnum
CREATE TYPE "faq_category" AS ENUM ('CUSTOMERS', 'SAFETY', 'BUSINESSES', 'ACCOUNT');

-- CreateTable
CREATE TABLE "faq_entries" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "keywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "category" "faq_category" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "times_shown" INTEGER NOT NULL DEFAULT 0,
    "helpful_count" INTEGER NOT NULL DEFAULT 0,
    "not_helpful_count" INTEGER NOT NULL DEFAULT 0,
    "search_vector" tsvector,
    "match_terms" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "faq_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "unanswered_questions" (
    "id" UUID NOT NULL,
    "text" VARCHAR(200) NOT NULL,
    "asked_on" DATE NOT NULL,

    CONSTRAINT "unanswered_questions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "faq_entries_slug_key" ON "faq_entries"("slug");

-- CreateIndex
CREATE INDEX "faq_entries_is_active_category_sort_order_idx" ON "faq_entries"("is_active", "category", "sort_order");

-- CreateIndex
CREATE INDEX "faq_entries_search_vector_idx" ON "faq_entries" USING GIN ("search_vector");

-- CreateIndex
CREATE INDEX "unanswered_questions_asked_on_idx" ON "unanswered_questions"("asked_on");


-- Integrity rules
ALTER TABLE "faq_entries" ADD CONSTRAINT "faq_entries_slug_format"
  CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length("slug") <= 60);
ALTER TABLE "faq_entries" ADD CONSTRAINT "faq_entries_question_length"
  CHECK (char_length("question") BETWEEN 5 AND 160);
ALTER TABLE "faq_entries" ADD CONSTRAINT "faq_entries_answer_length"
  CHECK (char_length("answer") BETWEEN 10 AND 4000);
ALTER TABLE "faq_entries" ADD CONSTRAINT "faq_entries_keywords_count"
  CHECK (cardinality("keywords") <= 60);
ALTER TABLE "faq_entries" ADD CONSTRAINT "faq_entries_counters_non_negative"
  CHECK ("times_shown" >= 0 AND "helpful_count" >= 0 AND "not_helpful_count" >= 0);
ALTER TABLE "unanswered_questions" ADD CONSTRAINT "unanswered_questions_text_length"
  CHECK (char_length("text") BETWEEN 3 AND 200);

-- Search columns, kept in sync by a trigger (app code never writes them):
--  search_vector: question and keywords (weight A) and the answer text (C), for full-text search;
--  match_terms: distinct words of the question and keywords, for trigram (typo) matching.
CREATE OR REPLACE FUNCTION faq_entries_search_refresh() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  kw text := array_to_string(NEW."keywords", ' ');
  plain_answer text := regexp_replace(NEW."answer", '\{\{[a-z_]+\}\}|\]\([^)]*\)|[*\[\]]', ' ', 'g');
BEGIN
  NEW."search_vector" :=
    setweight(to_tsvector('english', NEW."question"), 'A') ||
    setweight(to_tsvector('english', kw), 'A') ||
    setweight(to_tsvector('english', plain_answer), 'C');
  NEW."match_terms" := ARRAY(
    SELECT DISTINCT w
    FROM regexp_split_to_table(lower(NEW."question" || ' ' || kw), '[^a-z0-9]+') AS w
    WHERE char_length(w) >= 3
  );
  RETURN NEW;
END;
$$;
CREATE TRIGGER faq_entries_search_refresh
BEFORE INSERT OR UPDATE OF "question", "answer", "keywords" ON "faq_entries"
FOR EACH ROW EXECUTE FUNCTION faq_entries_search_refresh();

-- Row Level Security: block the Supabase Data API; the app uses Prisma (postgres role).
ALTER TABLE "faq_entries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "unanswered_questions" ENABLE ROW LEVEL SECURITY;


-- Seed: the help centre content (from /help, /safety and the listing-fee help), so /help and the
-- chat assistant start with the same answers. Live facts use placeholders filled at display time:
-- {{live_states}}, {{listing_fee}}, {{fee_status}}, {{payment_methods}}, {{contact_email}}.
INSERT INTO "faq_entries" ("id", "slug", "question", "answer", "keywords", "category", "sort_order", "updated_at") VALUES

-- For customers
(gen_random_uuid(), 'find', 'How do I find a business?',
$md$Use the search bar at the top of every page: type what you need (for example "tailor" or "AC repair") and choose your state and area. You can also browse by [category](/categories). Sort by **Highest rated** to see businesses with the best reviews first.

You can also ask me here, for example "plumber in Lekki".$md$,
ARRAY['find a business', 'search', 'look for', 'looking for', 'artisan', 'browse', 'near me', 'close to me', 'how to find', 'categories', 'service'],
'CUSTOMERS', 10, now()),

(gen_random_uuid(), 'contact-business', 'How do I contact a business?',
$md$Open the business's page and tap **Chat on WhatsApp**, **Call** or **Email**. You talk to the business directly, and we don't charge you anything.

Tip: log in first, so you can leave a review afterwards.$md$,
ARRAY['contact a business', 'call', 'whatsapp', 'reach', 'message', 'talk to the business', 'phone number of a business', 'get in touch'],
'CUSTOMERS', 20, now()),

(gen_random_uuid(), 'id-submitted', 'What does "ID submitted" mean?',
$md$The business owner shared a photo of a government ID and a selfie holding it, and our team checked them visually.

It is **not** an official government verification, and it doesn't guarantee the quality of their work. It's one helpful sign, not a promise.$md$,
ARRAY['id submitted', 'badge', 'verified', 'verification badge', 'is this business real', 'legit', 'genuine', 'trusted', 'can i trust', 'id badge'],
'CUSTOMERS', 30, now()),

(gen_random_uuid(), 'which-states', 'Which states are you in?',
$md$We're live in **{{live_states}}** right now, and we're launching one state at a time.

Not in your state yet? [Join the waitlist](/coming-soon#waitlist) and we'll email you once when we launch there.$md$,
ARRAY['states', 'which state', 'location', 'locations', 'where are you', 'available in', 'are you in', 'do you cover', 'coming soon', 'launch', 'my state', 'abuja', 'port harcourt', 'ibadan', 'waitlist', 'other states'],
'CUSTOMERS', 40, now()),

(gen_random_uuid(), 'free-for-customers', 'Is CustomerHowFar free for customers?',
$md$Yes. Searching for businesses and contacting them through CustomerHowFar is free. You agree the price and pay the business directly for their work.$md$,
ARRAY['free', 'free to use', 'do customers pay', 'charge customers', 'cost to use', 'commission'],
'CUSTOMERS', 50, now()),

(gen_random_uuid(), 'reviews-help', 'How do reviews work?',
$md$To keep reviews genuine, you can review a business after contacting it through CustomerHowFar while logged in, with a confirmed email. You can edit or delete your review any time.

If a review looks fake or offensive, tap **Report** under it.$md$,
ARRAY['review', 'reviews', 'rating', 'ratings', 'stars', 'rate a business', 'leave a review', 'write a review', 'fake review'],
'CUSTOMERS', 60, now()),

(gen_random_uuid(), 'report-a-problem', 'How do I report a problem?',
$md$To report a business, use **Report this business** at the bottom of its page (you need to be logged in). For anything else, a bug or a question, [contact us](/contact) or email [{{contact_email}}](mailto:{{contact_email}}).$md$,
ARRAY['report', 'report a business', 'scam', 'scammer', 'fraud', 'complain', 'complaint', 'problem', 'bug', 'issue', 'bad business', 'wahala'],
'CUSTOMERS', 70, now()),

-- Staying safe
(gen_random_uuid(), 'stay-safe', 'How do I stay safe?',
$md$- Meet in a public place, or have someone with you when a worker comes to your home.
- Never pay the full price upfront to a business you don't know. Agree a small deposit for materials, and pay the rest when the work is done.
- Agree the price and the job in writing, for example on WhatsApp.
- Report anything suspicious using "Report this business" on the listing.

Read our full [safety tips](/safety).$md$,
ARRAY['safe', 'safety', 'stay safe', 'safety tips', 'avoid scam', 'careful', 'protect myself', '419', 'trust'],
'SAFETY', 10, now()),

(gen_random_uuid(), 'paying-safely', 'How should I pay a business?',
$md$- **Never pay the full price upfront** to a business you don't know. Agree a small deposit for materials and pay the rest when the work is done.
- Pay to an account in the business or owner's name. Be careful if they ask you to pay a different person.
- Keep receipts and screenshots of your messages.
- Be very careful with offers that look too good to be true, or anyone who asks for "registration", "clearing" or other fees before doing any work.

CustomerHowFar is a directory: deals and payments are between you and the business.$md$,
ARRAY['pay a business', 'deposit', 'upfront', 'pay upfront', 'advance payment', 'part payment', 'balance', 'payment safety'],
'SAFETY', 20, now()),

(gen_random_uuid(), 'home-visits', 'Is it safe to let a worker into my home?',
$md$- Meet in a public place when you can, especially the first time.
- When someone comes to your home, have a friend or family member with you.
- Don't leave valuables lying around, and don't share your bank details or PINs.
- Trust your instincts. If something feels wrong, stop.$md$,
ARRAY['home visit', 'come to my house', 'my home', 'meet', 'meeting', 'stranger', 'house'],
'SAFETY', 30, now()),

(gen_random_uuid(), 'something-wrong', 'What should I do if something goes wrong?',
$md$- Tap **Report this business** at the bottom of the listing. Our team checks every report and can suspend listings and accounts.
- If you've lost money or been threatened, report it to the police. Your bank can also help if you act quickly.
- Questions? [Contact us](/contact).

Remember: CustomerHowFar is a directory. Deals are between you and the business.$md$,
ARRAY['went wrong', 'lost money', 'scammed', 'threatened', 'police', 'refund', 'cheated', 'dispute', 'ran away with my money', 'bad job'],
'SAFETY', 40, now()),

-- For businesses
(gen_random_uuid(), 'how-to-list', 'How do I list my business?',
$md$Create a free account, then tap [List your business](/business/new). It takes about 5 minutes and has five short steps: basics, location, about, photos and review.

Clear photos of your own work make the biggest difference. You can list up to 5 businesses. Right now, businesses can list in **{{live_states}}**.$md$,
ARRAY['list my business', 'add my business', 'register my business', 'post my business', 'advertise my business', 'advertise', 'put my business', 'list my shop', 'create a listing', 'sign up as a business', 'become a vendor', 'join as a business', 'listing'],
'BUSINESSES', 10, now()),

(gen_random_uuid(), 'review-process', 'What happens after I submit my listing?',
$md$Our team checks every listing before it goes live, usually within 1 to 2 working days. We check that the details are complete, the photos are real work and the phone number works. We email you when your listing is live, or tell you what to fix.$md$,
ARRAY['after i submit', 'approval', 'approve', 'how long', 'review time', 'pending', 'in review', 'waiting', 'go live', 'still pending', 'when will my listing'],
'BUSINESSES', 20, now()),

(gen_random_uuid(), 'listing-fee', 'How much is the listing fee, and how do I pay?',
$md${{fee_status}}

You pay by {{payment_methods}}. The payment page shows the amount, where to pay and a reference to use. After paying, upload a screenshot or photo of your receipt, and our team confirms it, usually within 1 working day.

The fee is for reviewing your listing and isn't refundable once your listing is approved. See our [Terms of Service](/terms#listing-fee) for details. You will never pay twice for the same listing.$md$,
ARRAY['listing fee', 'fee', 'price', 'pricing', 'cost', 'how much', 'charge', 'pay', 'payment', 'bank transfer', 'is listing free', 'amount', 'money'],
'BUSINESSES', 30, now()),

(gen_random_uuid(), 'id-check', 'Why do you ask for my ID and a selfie?',
$md$To keep CustomerHowFar safe and trusted. Our team needs to check your ID visually before your listing can be approved. Only our admin team sees the photos, we never ask for your ID number, and the photos are deleted 90 days after our review.

Start from [Verify your identity](/account/verify-identity).$md$,
ARRAY['id', 'id check', 'selfie', 'identity', 'verify my identity', 'verification', 'government id', 'id card', 'nin', 'nin slip', 'voters card', 'drivers licence', 'passport'],
'BUSINESSES', 40, now()),

(gen_random_uuid(), 'edit-delete', 'How do I edit or delete my listing?',
$md$Go to [My businesses](/dashboard). Tap **Edit** to change your details or photos; changes to a live listing show straight away. Tap **Delete business** to remove it (you'll type the business name to confirm).

To close your whole account, use "Delete my account" on your [account page](/account).$md$,
ARRAY['edit', 'edit my listing', 'change my listing', 'update my details', 'change photos', 'change my number', 'delete my listing', 'remove my listing', 'delete business'],
'BUSINESSES', 50, now()),

(gen_random_uuid(), 'rejected', 'Why was my listing rejected?',
$md$We'll always tell you why by email and on your dashboard. Common reasons: unclear photos or photos that aren't your own work, a phone number we couldn't reach, a short description, the wrong category, or an incomplete address.

Fix the issue and tap **Resubmit**. If you already paid, you won't be charged again.$md$,
ARRAY['rejected', 'declined', 'changes requested', 'not approved', 'resubmit', 'why reject', 'refused'],
'BUSINESSES', 60, now()),

(gen_random_uuid(), 'reply-reviews', 'Can I reply to reviews?',
$md$Yes. Open your listing while logged in and tap **Reply** under any review. You can post one public reply per review and edit it later. If a review breaks our rules, report it and our team will check it.$md$,
ARRAY['reply', 'reply to a review', 'respond', 'answer a review', 'bad review', 'owner reply'],
'BUSINESSES', 70, now()),

-- Your account
(gen_random_uuid(), 'create-account', 'How do I create an account?',
$md$Tap [Sign up](/signup), enter your name, email and a password, then confirm your email from the link we send you. Accounts are free.$md$,
ARRAY['sign up', 'signup', 'register', 'create an account', 'open an account', 'join', 'new account'],
'ACCOUNT', 10, now()),

(gen_random_uuid(), 'forgot-password', 'I forgot my password. What do I do?',
$md$Go to [Forgot password](/forgot-password), enter your email and we'll send you a link to set a new password. Check your spam folder if it doesn't arrive within a few minutes.$md$,
ARRAY['forgot password', 'reset password', 'change password', 'cannot log in', 'login problem', 'password', 'locked out', 'sign in problem'],
'ACCOUNT', 20, now()),

(gen_random_uuid(), 'delete-account', 'How do I delete my account?',
$md$Go to your [account page](/account) and use **Delete my account**. It deletes your profile, login, listings, photos, reviews and ID images straight away. Anonymous payment records are kept for accounting. See our [Privacy Policy](/privacy) for details.$md$,
ARRAY['delete my account', 'close my account', 'remove my data', 'deactivate', 'delete my data', 'privacy'],
'ACCOUNT', 30, now()),

(gen_random_uuid(), 'contact-us', 'How do I contact CustomerHowFar?',
$md$Use our [contact form](/contact) or email [{{contact_email}}](mailto:{{contact_email}}). A person from our team reads every message.

I'm an automated assistant, so I can't see account details or handle complaints myself.$md$,
ARRAY['contact you', 'contact customerhowfar', 'customer care', 'customer service', 'support', 'human', 'agent', 'real person', 'talk to someone', 'email you', 'call you', 'help desk'],
'ACCOUNT', 40, now());
