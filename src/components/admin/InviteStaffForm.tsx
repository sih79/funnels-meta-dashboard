"use client";

// Form to invite an admin or staff login, tagged to a business manager.
// Non-super-admin callers can only invite into their OWN business manager
// (the server action enforces this; we also reflect it in the UI by showing
// a read-only label instead of a dropdown).

import { useActionState, useEffect, useRef } from "react";
import { inviteStaffAction } from "@/lib/admin/actions";
import { ResultBanner, SubmitButton, inputClass, labelClass } from "./FormBits";

export default function InviteStaffForm({
  businessManagers,
  callerIsSuperAdmin,
  callerBusinessManagerId,
}: {
  businessManagers: { id: string; name: string }[];
  callerIsSuperAdmin: boolean;
  callerBusinessManagerId: string | null;
}) {
  const [result, action] = useActionState(inviteStaffAction, null);
  const formRef = useRef<HTMLFormElement>(null);

  // Clear the fields on a successful invite so the next one starts blank.
  useEffect(() => {
    if (result?.ok) {
      formRef.current?.reset();
    }
  }, [result]);

  const lockedBmName = !callerIsSuperAdmin
    ? businessManagers.find((bm) => bm.id === callerBusinessManagerId)?.name
    : null;

  return (
    <form ref={formRef} action={action} className="space-y-4">
      <div className="space-y-1.5">
        <label htmlFor="staff_full_name" className={labelClass}>
          Full name <span className="text-neutral-500">(optional)</span>
        </label>
        <input
          id="staff_full_name"
          name="full_name"
          placeholder="Jane Doe"
          className={inputClass}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="staff_email" className={labelClass}>
          Email
        </label>
        <input
          id="staff_email"
          name="email"
          type="email"
          required
          placeholder="jane@agency.com"
          className={inputClass}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="staff_password" className={labelClass}>
          Temporary password
        </label>
        <input
          id="staff_password"
          name="password"
          type="text"
          required
          minLength={8}
          placeholder="At least 8 characters"
          className={inputClass}
        />
        <p className="text-xs text-neutral-500">
          Min 8 chars. We&apos;ll set this as their initial password — share it
          with them out-of-band and ask them to change it after first sign-in.
        </p>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="staff_role" className={labelClass}>
          Role
        </label>
        <select
          id="staff_role"
          name="role"
          defaultValue="admin"
          className={inputClass}
        >
          <option value="admin">Admin</option>
          <option value="staff">Staff</option>
        </select>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="staff_bm" className={labelClass}>
          Business Manager
        </label>
        {callerIsSuperAdmin ? (
          <select
            id="staff_bm"
            name="business_manager_id"
            required
            defaultValue=""
            className={inputClass}
          >
            <option value="" disabled>
              Choose a business manager…
            </option>
            {businessManagers.map((bm) => (
              <option key={bm.id} value={bm.id}>
                {bm.name}
              </option>
            ))}
          </select>
        ) : (
          <>
            <div
              className={`${inputClass} flex items-center text-neutral-300`}
              aria-readonly="true"
            >
              {lockedBmName ?? "Your business manager"}
            </div>
            <input
              type="hidden"
              name="business_manager_id"
              value={callerBusinessManagerId ?? ""}
            />
          </>
        )}
      </div>

      <ResultBanner result={result} />
      <SubmitButton>Invite admin</SubmitButton>
    </form>
  );
}
