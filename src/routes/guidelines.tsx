import { createFileRoute } from "@tanstack/react-router";
import { ProsePage } from "@/components/site/prose-page";

export const Route = createFileRoute("/guidelines")({
  head: () => ({
    meta: [
      { title: "Community guidelines — Candid" },
      {
        name: "description",
        content:
          "How to share a workplace exit story safely: no names, no threats, facts you lived through. Read the Candid rules before posting.",
      },
      { property: "og:title", content: "Community guidelines — Candid" },
      {
        property: "og:description",
        content: "The rules for posting anonymous exit stories about Kenyan employers.",
      },
    ],
  }),
  component: GuidelinesPage,
});

function GuidelinesPage() {
  return (
    <ProsePage
      title="Community guidelines"
      intro="Candid only works if the stories are honest and the people telling them stay safe. These rules are enforced by automated screening and by our moderators."
    >
      <section>
        <h2>Do</h2>
        <ul>
          <li>
            Write about your own experience — what happened to you, at a company you worked for.
          </li>
          <li>
            Be specific about practices: late salary, no contract, unpaid overtime, no NSSF/SHIF
            remittance.
          </li>
          <li>Keep dates and amounts approximate if exact details would identify you.</li>
          <li>Say what went well too. A fair exit is useful information.</li>
        </ul>
      </section>
      <section>
        <h2>Don't</h2>
        <ul>
          <li>Name individuals — no managers, HR officers, colleagues, phone numbers or emails.</li>
          <li>Post accusations you cannot personally stand behind, or repeat rumours.</li>
          <li>Use slurs, tribal insults, threats, or calls for anyone to be harmed.</li>
          <li>Share confidential documents, client data, or anything covered by an NDA.</li>
          <li>
            Post the same story repeatedly, or run a coordinated campaign against one employer.
          </li>
        </ul>
      </section>
      <section>
        <h2>What happens after you post</h2>
        <ul>
          <li>
            Every story passes an automated screen. Borderline posts are held for review rather than
            published.
          </li>
          <li>
            Anyone can report a story or comment. Reported content is re-reviewed by moderators.
          </li>
          <li>Stories that break these rules are hidden. Repeat offenders lose posting access.</li>
        </ul>
      </section>
      <section>
        <h2>Employers</h2>
        <p>
          If a story about your company is inaccurate, you have a right of reply. Contact us and we
          will attach a verified employer response to the story instead of quietly deleting the
          criticism.
        </p>
      </section>
    </ProsePage>
  );
}
