"use client";

// Form to create a new client. As the admin types the name, we suggest a slug
// (web address) which they can still edit. On success the action redirects, so
// we mostly only ever render an error here.

import { useActionState, useState } from "react";
import { createClientAction } from "@/lib/admin/actions";
import { slugify } from "@/lib/admin/slug";
import { ResultBanner, SubmitButton, inputClass, labelClass } from "./FormBits";

export default function AddClientForm() {
  const [result, action] = useActionState(createClientAction, null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);

  // Keep slug in sync with the name until the admin edits the slug themselves.
  const onNameChange = (value: string) => {
    setName(value);
    if (!slugEdited) setSlug(slugify(value));
  };

  return (
    <form action={action} className="space-y-4">
      <div className="space-y-1.5">
        <label htmlFor="name" className={labelClass}>
          Client name
        </label>
        <input
          id="name"
          name="name"
          required
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="Acme Coaching"
          className={inputClass}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="slug" className={labelClass}>
          Web address (slug)
        </label>
        <input
          id="slug"
          name="slug"
          value={slug}
          onChange={(e) => {
            setSlug(e.target.value);
            setSlugEdited(true);
          }}
          placeholder="acme-coaching"
          className={inputClass}
        />
        <p className="text-xs text-neutral-500">
          Used in the dashboard link. Lowercase letters, numbers and hyphens.
        </p>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="logo_url" className={labelClass}>
          Logo URL <span className="text-neutral-500">(optional)</span>
        </label>
        <input
          id="logo_url"
          name="logo_url"
          type="url"
          placeholder="https://…/logo.png"
          className={inputClass}
        />
      </div>

      <ResultBanner result={result} />
      <SubmitButton>Create client</SubmitButton>
    </form>
  );
}
