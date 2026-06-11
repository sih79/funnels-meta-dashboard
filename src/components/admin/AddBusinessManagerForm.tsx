"use client";

// Super-admin-only form to create a new business manager. Optionally accepts
// an initial Meta access token, which the server action encrypts before
// storing. The token input is type=password so it never echoes on screen and
// is never sent back to the browser after submission.

import { useActionState, useEffect, useRef, useState } from "react";
import { createBusinessManagerAction } from "@/lib/admin/actions";
import { slugify } from "@/lib/admin/slug";
import { ResultBanner, SubmitButton, inputClass, labelClass } from "./FormBits";

export default function AddBusinessManagerForm() {
  const [result, action] = useActionState(createBusinessManagerAction, null);
  const formRef = useRef<HTMLFormElement>(null);
  const [name, setName] = useState("");

  useEffect(() => {
    if (result?.ok) {
      formRef.current?.reset();
      setName("");
    }
  }, [result]);

  const autoSlug = slugify(name);

  return (
    <form ref={formRef} action={action} className="space-y-4">
      <div className="space-y-1.5">
        <label htmlFor="bm_name" className={labelClass}>
          Name
        </label>
        <input
          id="bm_name"
          name="name"
          required
          placeholder="e.g. SH ACQ"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={inputClass}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="bm_slug" className={labelClass}>
          Slug <span className="text-neutral-500">(optional)</span>
        </label>
        <input
          id="bm_slug"
          name="slug"
          placeholder={autoSlug || "auto-generated from name"}
          className={inputClass}
        />
        <p className="text-xs text-neutral-500">
          Lowercase letters, numbers and hyphens only. Leave blank to use{" "}
          <code className="text-neutral-400">{autoSlug || "the name"}</code>.
        </p>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="bm_token" className={labelClass}>
          Meta access token <span className="text-neutral-500">(optional)</span>
        </label>
        <input
          id="bm_token"
          name="meta_access_token"
          type="password"
          autoComplete="off"
          placeholder="System-user long-lived token"
          className={inputClass}
        />
        <p className="text-xs text-neutral-500">
          Encrypted before storage. You can add or rotate it later.
        </p>
      </div>

      <ResultBanner result={result} />
      <SubmitButton>Add business manager</SubmitButton>
    </form>
  );
}
