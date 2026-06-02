// Reusable sign-out button. Renders a tiny form that POSTs to the sign-out
// route handler, which clears the session cookies and redirects to /login.
// Implemented as a plain form (no client JS required) so it works everywhere.

export default function SignOutButton({
  className,
}: {
  className?: string;
}) {
  return (
    <form action="/auth/signout" method="post">
      <button
        type="submit"
        className={
          className ??
          "rounded-lg border border-white/10 bg-neutral-900 px-4 py-2 text-sm font-medium text-neutral-300 transition hover:border-amber-400/40 hover:text-white"
        }
      >
        Sign out
      </button>
    </form>
  );
}
