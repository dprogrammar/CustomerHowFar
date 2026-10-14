-- More help entries for common questions, and extra keywords for existing ones.
INSERT INTO "faq_entries" ("id", "slug", "question", "answer", "keywords", "category", "sort_order", "updated_at") VALUES

(gen_random_uuid(), 'photos', 'How do I add photos to my listing?',
$md$Photos are step 4 of [listing your business](/business/new): add your logo, a cover photo and up to 12 photos of your own work. Clear, bright photos of real jobs you've done get the most customers.

To change photos later, go to [My businesses](/dashboard), tap **Edit**, then go to **Photos**.$md$,
ARRAY['upload photos', 'add photos', 'pictures', 'images', 'logo', 'cover photo', 'change photos', 'photos of my work', 'gallery'],
'BUSINESSES', 45, now()),

(gen_random_uuid(), 'app', 'Is there a CustomerHowFar app?',
$md$Not yet. CustomerHowFar works in any phone or computer browser, so there's nothing to download: just open the website. It's built to load quickly on slow networks.$md$,
ARRAY['app', 'mobile app', 'download', 'android app', 'iphone app', 'play store', 'app store', 'install'],
'ACCOUNT', 50, now()),

(gen_random_uuid(), 'data-privacy', 'Is my personal data safe?',
$md$We only collect what we need to run the service, and we never sell your data or show third-party adverts.

- ID and selfie images are private: only our admin team can see them, through links that expire after 5 minutes, and they're deleted 90 days after our review.
- Payment proofs are private files too.
- You can delete your account and data any time from your [account page](/account).

Read our [Privacy Policy](/privacy) for the details.$md$,
ARRAY['my data', 'personal data', 'privacy', 'data protection', 'ndpa', 'who can see my information', 'is my information safe', 'sell my data'],
'ACCOUNT', 60, now());

UPDATE "faq_entries"
SET "keywords" = "keywords" || ARRAY['how do you check', 'check businesses', 'vetting', 'verify businesses', 'checked']
WHERE "slug" = 'review-process';

UPDATE "faq_entries"
SET "keywords" = "keywords" || ARRAY['what do i do if i am scammed', 'i was scammed']
WHERE "slug" = 'something-wrong';
