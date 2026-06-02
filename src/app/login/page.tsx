import { Suspense } from "react";
import LoginForm from "./LoginForm";

// Public login page. Dark gold/black branding to match the dashboard.
export const metadata = {
  title: "Sign in — funnels.com Meta Ads",
};

export default function LoginPage() {
  return (
    <main className="flex min-h-full flex-1 items-center justify-center bg-neutral-950 px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-400">
            funnels.com · Meta Ads
          </p>
          <h1 className="mt-2 text-2xl font-bold text-white">Sign in</h1>
          <p className="mt-1 text-sm text-neutral-400">
            Welcome back. Enter your details to continue.
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-neutral-900/40 p-6 shadow-xl shadow-black/30">
          {/* useSearchParams() must sit inside a Suspense boundary. */}
          <Suspense fallback={null}>
            <LoginForm />
          </Suspense>
        </div>

        <p className="mt-6 text-center text-xs text-neutral-600">
          Trouble signing in? Contact your account manager.
        </p>
      </div>
    </main>
  );
}
