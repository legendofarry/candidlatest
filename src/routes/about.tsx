import { createFileRoute } from "@tanstack/react-router";
import { ProsePage } from "@/components/site/prose-page";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About Candid — why we publish exit stories" },
      {
        name: "description",
        content:
          "Candid lets employees say why they really left, anonymously. Learn how stories are screened, how company scores work, and how employers can reply.",
      },
      { property: "og:title", content: "About Candid" },
      {
        property: "og:description",
        content: "A Kenyan-built platform for honest, anonymous accounts of workplace culture.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <ProsePage
      title="About Candid"
      intro="Job adverts tell you what an employer wants you to hear. Candid tells you what the people who left would say if it were safe to say it."
    >
      <section>
        <h2>Why it exists</h2>
        <p className="mt-2">
          In Kenya, leaving a job quietly is often the safest option. Delayed salaries, missing NSSF
          and SHA deductions, contracts that never arrive, and management that treats staff as
          disposable rarely make it into public view. Candid collects those accounts in one place so
          the next candidate can walk into an interview informed.
        </p>
      </section>
      <section>
        <h2>How anonymity works</h2>
        <ul className="mt-2">
          <li>You need an account so votes and stories cannot be spammed.</li>
          <li>Your email and name are never published. You appear as a random handle.</li>
          <li>Employers cannot see who wrote a story, and neither can other readers.</li>
          <li>Never include your own full name, ID number, or a colleague's name in a story.</li>
        </ul>
      </section>
      <section>
        <h2>How stories are screened</h2>
        <p className="mt-2">
          Every submission passes an automated screening step that looks for personal identifying
          details, defamatory accusations of crime stated as fact, and abuse. Borderline stories are
          held for review rather than published. Anything can also be reported by readers.
        </p>
      </section>
      <section>
        <h2>How company scores work</h2>
        <p className="mt-2">
          Culture scores average anonymous ratings across five things Kenyan workers repeatedly
          raise: pay punctuality, statutory compliance, respect, workload, and growth. Company
          background summaries are AI-researched and clearly labelled — treat them as context, not
          verified fact.
        </p>
      </section>
      <section>
        <h2>Right of reply</h2>
        <p className="mt-2">
          Employers who believe a story is false can request a reply or a review. Stories are the
          personal opinions of contributors, and we correct or remove content that breaks the
          guidelines.
        </p>
      </section>
    </ProsePage>
  ),
});
