import { createFileRoute } from "@tanstack/react-router";
import { ProsePage } from "@/components/site/prose-page";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy & disclaimer — Candid" },
      {
        name: "description",
        content:
          "What Candid stores, what appears publicly, and the limits of user-submitted stories.",
      },
      { property: "og:title", content: "Privacy & disclaimer — Candid" },
      {
        property: "og:description",
        content:
          "What account information we store, what appears publicly, and how to read stories on this site.",
      },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <ProsePage
      title="Privacy & disclaimer"
      intro="This page explains what information we store, what appears publicly, and how to read the stories on this site."
    >
      <section>
        <h2>What we store</h2>
        <ul>
          <li>
            Your email address and password hash, handled by our authentication provider — used only
            to stop spam and duplicate voting.
          </li>
          <li>Your Candid handle, chosen during signup.</li>
          <li>
            Your stories, votes, comments, reports and salary submissions, linked internally to your
            account ID.
          </li>
          <li>
            Optional employment proof is stored as a private Cloudinary file. When you attach proof,
            our automated moderation service receives it to check for relevance and exposed
            sensitive details; it does not authenticate documents or determine whether a story is
            true.
          </li>
        </ul>
      </section>
      <section>
        <h2>What stays private</h2>
        <ul>
          <li>
            Your email, legal name, or account ID — not on public pages or in public API responses.
          </li>
          <li>Who voted on what. Votes are only ever published as totals.</li>
          <li>
            Attached proof is not published and is not shown to employers. It is accessible to the
            moderation system and authorized Candid moderators for review.
          </li>
          <li>
            Individual salary entries. Bands appear only once several people have reported the same
            role.
          </li>
        </ul>
      </section>
      <section>
        <h2>How your account information is protected</h2>
        <ul>
          <li>
            Public story pages do not display your email, legal name, or account ID. Your Candid
            handle may appear with your contributions.
          </li>
          <li>
            Database access rules restrict every write to the signed-in account and every read to
            published content.
          </li>
          <li>
            Automated screening may publish clear, low-risk stories or hold uncertain cases for
            moderator review. Automated assessments can be wrong, so moderators can review and
            change the result.
          </li>
        </ul>
      </section>
      <section>
        <h2>Deleting your data</h2>
        <p>
          You can ask us to delete your account. Stories can be removed with it or retained without
          your account details — tell us which you prefer when you write in.
        </p>
      </section>
      <section>
        <h2>Disclaimer</h2>
        <ul>
          <li>
            Stories are the personal opinions and recollections shared by members. They are
            not findings of fact and we do not independently verify them.
          </li>
          <li>
            Automated screening reviews submissions for safety and privacy. It does not verify the
            truth of a story or prove that an attached document is authentic.
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
