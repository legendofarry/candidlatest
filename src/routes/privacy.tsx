import { createFileRoute } from "@tanstack/react-router";
import { ProsePage } from "@/components/site/prose-page";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy & disclaimer — Candid" },
      {
        name: "description",
        content:
          "What Candid stores, what it never shows, how anonymity is protected, and the legal disclaimer covering user-submitted stories.",
      },
      { property: "og:title", content: "Privacy & disclaimer — Candid" },
      {
        property: "og:description",
        content:
          "How we protect anonymity, what we store, and the limits of what stories on this site represent.",
      },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <ProsePage
      title="Privacy & disclaimer"
      intro="Anonymity is the product. This page explains exactly what we keep, what we never publish, and how to read the stories on this site."
    >
      <section>
        <h2>What we store</h2>
        <ul>
          <li>
            Your email address and password hash, handled by our authentication provider — used only
            to stop spam and duplicate voting.
          </li>
          <li>An anonymous handle generated for you at signup, e.g. "Anon Analyst, Nairobi".</li>
          <li>
            Your stories, votes, comments, reports and salary submissions, linked internally to your
            account ID.
          </li>
        </ul>
      </section>
      <section>
        <h2>What we never show</h2>
        <ul>
          <li>
            Your email, name, or account ID — not on any page and not in any public API response.
          </li>
          <li>Who voted on what. Votes are only ever published as totals.</li>
          <li>
            Individual salary entries. Bands appear only once several people have reported the same
            role.
          </li>
        </ul>
      </section>
      <section>
        <h2>How anonymity is enforced</h2>
        <ul>
          <li>
            Public pages read from database views that simply do not contain author identity
            columns.
          </li>
          <li>
            Database access rules restrict every write to the signed-in account and every read to
            published content.
          </li>
          <li>Moderation happens in a separate internal tool, not in this app.</li>
        </ul>
      </section>
      <section>
        <h2>Deleting your data</h2>
        <p>
          You can ask us to delete your account. Stories can be removed with it, or kept anonymously
          detached — tell us which you prefer when you write in.
        </p>
      </section>
      <section>
        <h2>Disclaimer</h2>
        <ul>
          <li>
            Stories are the personal opinions and recollections of anonymous individuals. They are
            not findings of fact and we do not independently verify them.
          </li>
          <li>Scores are averages of user-submitted ratings, not audits.</li>
          <li>
            Sections marked "AI-researched — unverified" are machine-generated summaries of public
            information and may be wrong or out of date.
          </li>
          <li>
            Employers have a right of reply, and we will attach a verified response to any story on
            request.
          </li>
          <li>
            Content that names individuals, threatens anyone, or is reported as false is removed.
          </li>
        </ul>
      </section>
    </ProsePage>
  );
}
