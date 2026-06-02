"use client";

// Form to attach a Meta ad account to a client. The Meta ID can be entered with
// or without the "act_" prefix — the server normalises it.

import { useActionState } from "react";
import { createAdAccountAction } from "@/lib/admin/actions";
import { ResultBanner, SubmitButton, inputClass, labelClass } from "./FormBits";

export default function AddAdAccountForm({
  clientId,
  slug,
}: {
  clientId: string;
  slug: string;
}) {
  const [result, action] = useActionState(createAdAccountAction, null);

  return (
    <form action={action} className="space-y-4">
      {/* Hidden context the action needs. */}
      <input type="hidden" name="client_id" value={clientId} />
      <input type="hidden" name="slug" value={slug} />

      <div className="space-y-1.5">
        <label htmlFor="meta_account_id" className={labelClass}>
          Meta ad account ID
        </label>
        <input
          id="meta_account_id"
          name="meta_account_id"
          required
          placeholder="act_1234567890 or just 1234567890"
          className={inputClass}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="name" className={labelClass}>
          Display name
        </label>
        <input
          id="name"
          name="name"
          required
          placeholder="Acme — Main Account"
          className={inputClass}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="source" className={labelClass}>
            Source
          </label>
          <select
            id="source"
            name="source"
            defaultValue="agency"
            className={inputClass}
          >
            <option value="agency">Agency (our access)</option>
            <option value="client_oauth">Client OAuth (Phase 6)</option>
          </select>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="currency" className={labelClass}>
            Currency
          </label>
          <input
            id="currency"
            name="currency"
            defaultValue="GBP"
            placeholder="GBP"
            className={inputClass}
          />
        </div>
      </div>

      <ResultBanner result={result} />
      <SubmitButton>Add ad account</SubmitButton>
    </form>
  );
}
