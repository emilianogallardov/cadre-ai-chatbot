import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy — Cadre AI Resource Agent",
  description:
    "What the Cadre AI Resource Agent collects, why, how long it is kept, and the controls you have.",
};

/**
 * Notice-at-collection page (ADR-008). CalOPPA requires a conspicuous privacy
 * policy the moment a commercial site collects PII from California residents —
 * the follow-up form's name+email crossed that line before chat storage did.
 * Every claim on this page is enforced in code: retention by pg_cron, private
 * mode by a server-side write skip, deletion by a signed-token route.
 */
export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10">
      <Link
        href="/"
        className="text-sm text-neutral-500 underline-offset-2 hover:underline dark:text-neutral-400"
      >
        &larr; Back to chat
      </Link>
      <h1 className="mt-4 text-2xl font-semibold">Privacy</h1>
      <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
        Cadre AI Resource Agent &middot; Effective July 10, 2026
      </p>

      <div className="mt-6 space-y-8 text-[15px] leading-relaxed">
        <section>
          <h2 className="font-semibold">What we collect</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              <strong>Chat messages</strong> you send and the assistant&apos;s
              replies, with a random conversation ID and timestamps. Nothing
              links a conversation to your identity unless you submit the
              follow-up form.
            </li>
            <li>
              <strong>Follow-up requests</strong>: your name, email, and
              question &mdash; stored only after you check the consent box.
            </li>
            <li>
              <strong>IP address</strong>, used transiently for abuse
              prevention (rate limiting); rate-limit counters expire within a
              day.
            </li>
          </ul>
          <p className="mt-2">
            We use no cookies, no analytics scripts, no advertising trackers,
            and no fingerprinting. Your conversation ID lives in your
            browser&apos;s session storage and disappears when you close the
            tab.
          </p>
        </section>

        <section>
          <h2 className="font-semibold">Why we collect it</h2>
          <p className="mt-2">
            To answer your questions; to let the Cadre team see the
            conversation behind a follow-up request you chose to submit, so
            they can respond with context; and to learn which questions the
            assistant cannot yet answer well, so coverage improves. We do not
            sell or share your personal information, and we do not use it for
            advertising.
          </p>
        </section>

        <section>
          <h2 className="font-semibold">How long we keep it</h2>
          <p className="mt-2">
            A daily scheduled job in our database deletes conversations and
            follow-up requests once they are older than{" "}
            <strong>30 days</strong>.
          </p>
        </section>

        <section>
          <h2 className="font-semibold">Your controls</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              <strong>Private mode</strong> (toggle in the chat header): stops
              new messages from being saved. Messages sent before you turned it
              on stay saved until you use Delete this chat. Your messages are
              still processed by our AI service provider to generate replies
              &mdash; that is how the assistant works &mdash; but Cadre keeps
              no copy of what you send while it is on.
            </li>
            <li>
              <strong>Delete this chat</strong>: while your tab is open, one
              click permanently deletes the saved copy of the current
              conversation.
            </li>
            <li>
              <strong>Later deletion requests</strong>: after your tab closes
              we can no longer match you to a conversation ourselves (there
              are no accounts). If you submitted a follow-up request, email{" "}
              <a
                className="underline underline-offset-2"
                href="mailto:hello@gocadre.ai"
              >
                hello@gocadre.ai
              </a>{" "}
              with your reference number and we will delete it.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="font-semibold">Who processes the data</h2>
          <p className="mt-2">
            Service providers acting on our behalf: Vercel (hosting), OpenRouter
            and its model providers (generating replies), Supabase (database),
            and Upstash (rate limiting). Messages are processed by these
            providers to operate the service; none of them are authorized to
            use your data for their own purposes beyond what their service
            terms describe.
          </p>
        </section>

        <section>
          <h2 className="font-semibold">Do Not Track</h2>
          <p className="mt-2">
            This site does not track visitors across other sites, so there is
            nothing for a Do Not Track or Global Privacy Control signal to
            switch off &mdash; the behavior they request is already the
            default.
          </p>
        </section>

        <section>
          <h2 className="font-semibold">Changes and contact</h2>
          <p className="mt-2">
            Material changes to this policy will appear on this page with an
            updated effective date. Questions:{" "}
            <a
              className="underline underline-offset-2"
              href="mailto:hello@gocadre.ai"
            >
              hello@gocadre.ai
            </a>{" "}
            or (619) 324-3223.
          </p>
        </section>
      </div>
    </main>
  );
}
