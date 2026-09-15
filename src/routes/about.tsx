import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { Mail, MessageCircle, Phone } from "lucide-react";
import { ProsePage } from "@/components/site/prose-page";
import { getSiteContact } from "@/lib/public.functions";

const contactQuery = queryOptions({
  queryKey: ["site-contact"],
  queryFn: () => getSiteContact(),
});

export const Route = createFileRoute("/about")({
  loader: ({ context }) => context.queryClient.ensureQueryData(contactQuery),
  head: () => ({
    meta: [
      { title: "About Candid — why we publish exit stories" },
      {
        name: "description",
        content:
          "Candid lets employees say why they really left, anonymously. Learn how stories are screened, how company scores work, how employers can reply, and how to reach the team.",
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
  component: AboutPage,
});

function AboutPage() {
  const { data: contact } = useSuspenseQuery(contactQuery);
  const hasContact = Boolean(
    contact &&
    (contact.email || contact.phone || contact.whatsapp || contact.x || contact.instagram),
  );

  return (
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
        <h2>What you can do here</h2>
        <ul className="mt-2">
          <li>Read exit stories by employer, industry or county.</li>
          <li>
            Check a company&apos;s red flags, ratings and whether people would work there again.
          </li>
          <li>See what roles actually pay, contributed by people who held them.</li>
          <li>Follow a company or a story and get told when something new lands.</li>
          <li>Message other members privately, on your own privacy terms.</li>
        </ul>
      </section>
      <section>
        <h2>How anonymity works</h2>
        <ul className="mt-2">
          <li>You need an account so votes and stories cannot be spammed.</li>
          <li>Your email and name are never published. You appear as a random handle.</li>
          <li>Employers cannot see who wrote a story, and neither can other readers.</li>
          <li>
            Never include your own full name, ID number, or a colleague&apos;s name in a story.
          </li>
        </ul>
      </section>
      <section>
        <h2>Staying signed in safely</h2>
        <p className="mt-2">
          So you are not typing a password every time, Candid keeps you signed in on your own device
          and instead hides the app behind your fingerprint or face after a period of inactivity.
          You choose how long that is in your profile settings.
        </p>
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
      <section>
        <h2>How to reach us</h2>
        {hasContact && contact ? (
          <div className="mt-2 space-y-2 rounded-2xl border border-border bg-card p-4">
            {contact.note ? <p className="text-muted-foreground">{contact.note}</p> : null}
            <ul className="space-y-2">
              {contact.email ? (
                <li className="flex items-center gap-2">
                  <Mail className="size-4 text-primary" />
                  <a className="hover:text-primary" href={`mailto:${contact.email}`}>
                    {contact.email}
                  </a>
                </li>
              ) : null}
              {contact.phone ? (
                <li className="flex items-center gap-2">
                  <Phone className="size-4 text-primary" />
                  <a className="hover:text-primary" href={`tel:${contact.phone}`}>
                    {contact.phone}
                  </a>
                </li>
              ) : null}
              {contact.whatsapp ? (
                <li className="flex items-center gap-2">
                  <MessageCircle className="size-4 text-primary" />
                  <a
                    className="hover:text-primary"
                    href={`https://wa.me/${contact.whatsapp.replace(/[^0-9]/g, "")}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    WhatsApp {contact.whatsapp}
                  </a>
                </li>
              ) : null}
              {contact.x ? (
                <li>
                  <a
                    className="hover:text-primary"
                    href={contact.x}
                    target="_blank"
                    rel="noreferrer"
                  >
                    X / Twitter
                  </a>
                </li>
              ) : null}
              {contact.instagram ? (
                <li>
                  <a
                    className="hover:text-primary"
                    href={contact.instagram}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Instagram
                  </a>
                </li>
              ) : null}
            </ul>
          </div>
        ) : (
          <p className="mt-2 text-muted-foreground">
            Contact details have not been published yet. In the meantime, report anything urgent
            straight from the story it concerns — reports reach the team immediately.
          </p>
        )}
      </section>
    </ProsePage>
  );
}
