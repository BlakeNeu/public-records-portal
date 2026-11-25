"use client";

import { useActionState } from "react";
import { createRequest } from "@/app/actions/requests";

const input =
  "w-full rounded border border-line bg-surface px-3 py-2 focus:outline-2 focus:outline-accent";

export function NewRequestForm() {
  const [state, formAction, pending] = useActionState(createRequest, undefined);

  return (
    <form action={formAction} className="space-y-4 rounded-lg border border-line bg-surface p-6">
      <div className="space-y-1">
        <label htmlFor="subject" className="block text-sm font-medium">
          Subject
        </label>
        <input id="subject" name="subject" required maxLength={200} className={input} />
        {state?.errors?.subject && <p className="text-sm text-danger">{state.errors.subject[0]}</p>}
      </div>
      <div className="space-y-1">
        <label htmlFor="description" className="block text-sm font-medium">
          Records you need
        </label>
        <textarea id="description" name="description" required rows={6} maxLength={5000} className={input} />
        {state?.errors?.description && (
          <p className="text-sm text-danger">{state.errors.description[0]}</p>
        )}
      </div>
      {state?.message && (
        <p role="alert" className="text-sm text-danger">
          {state.message}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-accent px-4 py-2 font-medium text-white hover:bg-accent-strong disabled:opacity-60"
      >
        {pending ? "Submitting…" : "Submit request"}
      </button>
    </form>
  );
}
