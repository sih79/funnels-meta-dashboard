"use client";

// A small button to backfill the last 90 days for an agency ad account. Shows
// the result (success row count, or a friendly "add your Meta token" note)
// inline beneath the button.

import { useActionState } from "react";
import { backfillAdAccountAction } from "@/lib/admin/actions";
import { ResultBanner, SubmitButton } from "./FormBits";

export default function BackfillButton({
  adAccountId,
  slug,
}: {
  adAccountId: string;
  slug: string;
}) {
  const [result, action] = useActionState(backfillAdAccountAction, null);

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="ad_account_id" value={adAccountId} />
      <input type="hidden" name="slug" value={slug} />
      <SubmitButton>Backfill 90 days now</SubmitButton>
      <ResultBanner result={result} />
    </form>
  );
}
