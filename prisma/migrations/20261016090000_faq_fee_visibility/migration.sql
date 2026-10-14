-- CreateEnum
CREATE TYPE "faq_visibility" AS ENUM ('ALWAYS', 'FEE_ON', 'FEE_OFF');

-- AlterTable
ALTER TABLE "faq_entries" ADD COLUMN     "visibility" "faq_visibility" NOT NULL DEFAULT 'ALWAYS';


-- While listing is free (fee switch off), fee and payment answers are hidden and a "free to list"
-- answer is shown instead. Sentences about paying inside other answers are wrapped in
-- {{#fee_on}}...{{/fee_on}} so they only appear while the fee is on.
UPDATE "faq_entries" SET "visibility" = 'FEE_ON' WHERE "slug" = 'listing-fee';

INSERT INTO "faq_entries" ("id", "slug", "question", "answer", "keywords", "category", "visibility", "sort_order", "updated_at") VALUES
(gen_random_uuid(), 'free-to-list', 'Is it free to list?',
$md$Listing your business on CustomerHowFar is free. Tap '[List your business](/business/new)' to get started.$md$,
ARRAY['listing fee', 'fee', 'fees', 'cost', 'price', 'pricing', 'how much', 'charge', 'pay', 'payment', 'pay to list', 'pay for listing', 'is listing free', 'free to list', 'is it free', 'bank transfer', 'receipt', 'refund', 'money', 'amount', 'subscription'],
'BUSINESSES', 'FEE_OFF', 30, now());

UPDATE "faq_entries"
SET "answer" = replace("answer", ' If you already paid, you won''t be charged again.', '{{#fee_on}} If you already paid, you won''t be charged again.{{/fee_on}}')
WHERE "slug" = 'rejected';

UPDATE "faq_entries"
SET "answer" = replace("answer", ' Anonymous payment records are kept for accounting.', '{{#fee_on}} Anonymous payment records are kept for accounting.{{/fee_on}}')
WHERE "slug" = 'delete-account';

UPDATE "faq_entries"
SET "answer" = replace("answer", E'\n- Payment proofs are private files too.', E'{{#fee_on}}\n- Payment proofs are private files too.{{/fee_on}}')
WHERE "slug" = 'data-privacy';
