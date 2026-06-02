"use client";

// Form to invite a client login. The server creates the auth user with a
// temporary password and shows it back here so the admin can pass it on
// (real email delivery isn't wired up yet).

import { useActionState } from "react";
import { inviteClientLoginAction } from "@/lib/admin/actions";
import { ResultBanner, SubmitButton, inputClass, labelClass } from "./FormBits";

export default function InviteLoginForm({
  clientId,
  slug,
}: {
  clientId: string;
  slug: string;
}) {
  const [result, action] = useActionState(inviteClientLoginAction, null);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="client_id" value={clientId} />
      <input type="hidden" name="slug" value={slug} />

      <div className="space-y-1.5">
        <label htmlFor="email" className={labelClass}>
          Client email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          placeholder="owner@acme.com"
          className={inputClass}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="full_name" className={labelClass}>
          Full name <span className="text-neutral-500">(optional)</span>
        </label>
        <input
          id="full_name"
          name="full_name"
          placeholder="Jane Doe"
          className={inputClass}
        />
      </div>

      <ResultBanner result={result} />
      <p className="text-xs text-neutral-500">
        We create the login with a temporary password and show it here. Copy it
        and send it to the client — email sending isn&apos;t set up yet.
      </p>
      <SubmitButton>Create client login</SubmitButton>
    </form>
  );
}
