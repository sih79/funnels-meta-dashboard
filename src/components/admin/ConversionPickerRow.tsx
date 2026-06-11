"use client";

// Single editable row of the tracked-conversions picker for one ad account.
// Each row is its own form so saving one doesn't disturb edits to the others.
// Matches the existing InviteStaffForm useActionState pattern.

import { useActionState } from "react";
import { updateTrackedConversionAction } from "@/lib/admin/actions";
import { ResultBanner, SubmitButton, inputClass } from "./FormBits";

export interface ConversionPickerRowProps {
  id: string;
  actionType: string;
  metaName: string | null;
  displayName: string;
  isEnabled: boolean;
  displayOrder: number;
  slug: string;
}

export default function ConversionPickerRow({
  id,
  actionType,
  metaName,
  displayName,
  isEnabled,
  displayOrder,
  slug,
}: ConversionPickerRowProps) {
  const [result, action] = useActionState(updateTrackedConversionAction, null);

  return (
    <form
      action={action}
      className="rounded-xl border border-white/10 bg-neutral-900/50 p-4"
    >
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="slug" value={slug} />

      <div className="grid grid-cols-1 gap-3 md:grid-cols-[auto_1fr_8rem_auto]">
        <label className="flex items-center gap-2 text-sm text-neutral-200">
          <input
            type="checkbox"
            name="is_enabled"
            defaultChecked={isEnabled}
            className="h-4 w-4 rounded border-white/20 bg-neutral-900 accent-amber-400"
          />
          Show on dashboard
        </label>

        <div>
          <input
            name="display_name"
            defaultValue={displayName}
            required
            placeholder="Display name"
            className={inputClass}
          />
          <p className="mt-1 text-xs text-neutral-500">
            {metaName ? `${metaName} · ` : ""}
            <code className="text-neutral-600">{actionType}</code>
          </p>
        </div>

        <input
          name="display_order"
          type="number"
          defaultValue={displayOrder}
          step={1}
          className={inputClass}
          aria-label="Display order"
        />

        <SubmitButton>Save</SubmitButton>
      </div>

      {result && (
        <div className="mt-3">
          <ResultBanner result={result} />
        </div>
      )}
    </form>
  );
}
