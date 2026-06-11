"use client";

// One card per business manager. Shows name + slug + token status, plus two
// inline forms: one to edit name/slug, one to rotate (or remove) the Meta
// access token. Two separate useActionState hooks so each form's banner is
// independent.

import { useActionState, useEffect, useRef } from "react";
import {
  updateBusinessManagerAction,
  updateBusinessManagerTokenAction,
} from "@/lib/admin/actions";
import { ResultBanner, SubmitButton, inputClass, labelClass } from "./FormBits";

export interface BusinessManagerCardProps {
  id: string;
  name: string;
  slug: string;
  hasMetaToken: boolean;
  metaTokenUpdatedAt: string | null;
}

function formatDate(iso: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function BusinessManagerCard({
  id,
  name,
  slug,
  hasMetaToken,
  metaTokenUpdatedAt,
}: BusinessManagerCardProps) {
  const [detailResult, detailAction] = useActionState(
    updateBusinessManagerAction,
    null,
  );
  const [tokenResult, tokenAction] = useActionState(
    updateBusinessManagerTokenAction,
    null,
  );

  const tokenFormRef = useRef<HTMLFormElement>(null);

  // Clear the token input after a successful save so the next rotation starts
  // from a blank field (avoids accidentally re-saving the same value).
  useEffect(() => {
    if (tokenResult?.ok) {
      tokenFormRef.current?.reset();
    }
  }, [tokenResult]);

  return (
    <section className="rounded-xl border border-white/10 bg-neutral-900/50 p-6">
      <header className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-white">{name}</h3>
          <p className="mt-0.5 text-xs text-neutral-500">/{slug}</p>
        </div>
        <TokenBadge hasToken={hasMetaToken} updatedAt={metaTokenUpdatedAt} />
      </header>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Edit name / slug */}
        <form action={detailAction} className="space-y-4">
          <input type="hidden" name="id" value={id} />

          <div className="space-y-1.5">
            <label htmlFor={`bm_${id}_name`} className={labelClass}>
              Name
            </label>
            <input
              id={`bm_${id}_name`}
              name="name"
              required
              defaultValue={name}
              className={inputClass}
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor={`bm_${id}_slug`} className={labelClass}>
              Slug
            </label>
            <input
              id={`bm_${id}_slug`}
              name="slug"
              required
              defaultValue={slug}
              className={inputClass}
            />
          </div>

          <ResultBanner result={detailResult} />
          <SubmitButton>Save details</SubmitButton>
        </form>

        {/* Replace / remove Meta token */}
        <form ref={tokenFormRef} action={tokenAction} className="space-y-4">
          <input type="hidden" name="id" value={id} />

          <div className="space-y-1.5">
            <label htmlFor={`bm_${id}_token`} className={labelClass}>
              {hasMetaToken ? "Replace Meta access token" : "Add Meta access token"}
            </label>
            <input
              id={`bm_${id}_token`}
              name="meta_access_token"
              type="password"
              autoComplete="off"
              placeholder="Paste new Meta access token"
              className={inputClass}
            />
            <p className="text-xs text-neutral-500">
              Encrypted before storage. The current token is never shown.
            </p>
          </div>

          <ResultBanner result={tokenResult} />
          <div className="flex items-center justify-between gap-3">
            <SubmitButton>{hasMetaToken ? "Replace" : "Save token"}</SubmitButton>
            {hasMetaToken ? (
              <button
                type="submit"
                name="remove"
                value="1"
                className="text-xs font-medium text-red-300 underline-offset-4 transition hover:text-red-200 hover:underline"
              >
                Remove token
              </button>
            ) : null}
          </div>
        </form>
      </div>
    </section>
  );
}

function TokenBadge({
  hasToken,
  updatedAt,
}: {
  hasToken: boolean;
  updatedAt: string | null;
}) {
  if (hasToken) {
    return (
      <div className="flex flex-col items-end">
        <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-300">
          Token set
        </span>
        {updatedAt ? (
          <span className="mt-1 text-[10px] text-neutral-500">
            Updated {formatDate(updatedAt)}
          </span>
        ) : null}
      </div>
    );
  }
  return (
    <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-2.5 py-0.5 text-xs font-medium text-amber-300">
      No token
    </span>
  );
}
