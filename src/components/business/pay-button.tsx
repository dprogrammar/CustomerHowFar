"use client";

import { useState } from "react";
import { CreditCard } from "lucide-react";
import { FormAlert } from "@/components/auth/form-fields";
import { Button } from "@/components/ui/button";

/** Placeholder until Paystack is wired in. Never changes the listing status. */
export function PayButton({ amountLabel }: { amountLabel: string }) {
  const [clicked, setClicked] = useState(false);
  return (
    <div className="space-y-3">
      <Button type="button" size="lg" variant="accent" fullWidth onClick={() => setClicked(true)}>
        <CreditCard aria-hidden="true" />
        Pay {amountLabel} now
      </Button>
      <div aria-live="polite">
        {clicked && (
          <FormAlert status="success">
            Payment coming soon. Online payment is being set up; your listing is saved and will be
            waiting here.
          </FormAlert>
        )}
      </div>
    </div>
  );
}
