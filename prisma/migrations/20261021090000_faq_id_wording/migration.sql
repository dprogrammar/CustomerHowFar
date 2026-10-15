-- Calmer wording for the ID check help answers: "reviewed by our team" instead of "checked
-- visually". Data only. Each statement replaces just the exact old sentence, so an answer an
-- admin has since edited in /admin/help-assistant is left as it is.

UPDATE "faq_entries"
SET "answer" = replace(
      "answer",
      'The business owner shared a photo of a government ID and a selfie holding it, and our team checked them visually.',
      'The business owner shared a photo of a government ID and a selfie holding it, which our team reviewed.'),
    "updated_at" = now()
WHERE "slug" = 'id-submitted'
  AND position('and our team checked them visually.' in "answer") > 0;

UPDATE "faq_entries"
SET "answer" = replace(
      "answer",
      'Our team needs to check your ID visually before your listing can be approved.',
      'Our team needs to review your ID before your listing can be approved.'),
    "updated_at" = now()
WHERE "slug" = 'id-check'
  AND position('Our team needs to check your ID visually' in "answer") > 0;
