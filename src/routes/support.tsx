import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Mail, MessageCircle, Send, ShieldCheck } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createSupportTicket } from "@/lib/support.functions";

export const Route = createFileRoute("/support")({
  head: () => ({
    meta: [
      { title: "Help & support | Candid" },
      {
        name: "description",
        content: "Get help with Candid, privacy, stories, employer replies, or your account.",
      },
      { property: "og:title", content: "Help & support | Candid" },
      { property: "og:type", content: "website" },
    ],
  }),
  component: SupportPage,
});

const faqs = [
  {
    question: "Will my employer know I posted?",
    answer:
      "No. Candid does not publish your name, email, employment evidence, or account identity with a story. Avoid putting identifying details into the story itself.",
  },
  {
    question: "How are stories screened?",
    answer:
      "Submissions are automatically checked for personal information, abusive content, and risky allegations. Anything unclear can be held for moderator review before it goes live.",
  },
  {
    question: "What happens to employment evidence?",
    answer:
      "Evidence is private, never published, and never shared with an employer. It is only available to moderators reviewing a submission.",
  },
  {
    question: "Can an employer respond to a story?",
    answer:
      "Yes. Employers can claim their company profile and request a right of reply. They cannot see who submitted an anonymous story.",
  },
  {
    question: "Can I correct or delete my data?",
    answer:
      "Yes. Contact us with the details. We handle correction and deletion requests in line with your data-protection rights, including under Kenya's ODPC framework.",
  },
];

function SupportPage() {
  const submitTicket = useServerFn(createSupportTicket);
  const [form, setForm] = useState({ full_name: "", contact: "", category: "story", message: "" });
  const mutation = useMutation({
    mutationFn: () => submitTicket({ data: form }),
    onSuccess: () => setForm({ full_name: "", contact: "", category: "story", message: "" }),
  });
  const update = (key: keyof typeof form, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));
  return (
    <div className="mx-auto max-w-3xl pb-10">
      <header className="rounded-3xl bg-secondary/70 p-7 md:p-10">
        <ShieldCheck className="size-8 text-primary" />
        <h1 className="mt-4 font-display text-3xl font-semibold tracking-tight md:text-4xl">
          Help & support
        </h1>
        <p className="mt-2 max-w-xl text-muted-foreground">
          Questions, corrections, a concern about a story, or help with your account — we’re here.
        </p>
      </header>
      <section className="mt-8">
        <h2 className="font-display text-2xl font-semibold">Common questions</h2>
        <Accordion type="single" collapsible className="mt-3 rounded-2xl border border-border px-4">
          {faqs.map(({ question, answer }) => (
            <AccordionItem value={question} key={question}>
              <AccordionTrigger>{question}</AccordionTrigger>
              <AccordionContent className="text-muted-foreground">{answer}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>
      <section className="mt-8 grid gap-3 sm:grid-cols-2">
        <a
          href="mailto:moderation.mails.go@gmail.com"
          className="rounded-2xl border border-border bg-card p-5 transition-colors hover:border-primary/50"
        >
          <Mail className="size-5 text-primary" />
          <h2 className="mt-3 font-semibold">Email us</h2>
          <p className="mt-1 text-sm text-muted-foreground">moderation.mails.go@gmail.com</p>
        </a>
        <a
          href="https://wa.me/254715198636?text=Hi%20Candid%20team%2C%20I%20need%20help%20with%20…"
          target="_blank"
          rel="noreferrer"
          className="rounded-2xl border border-border bg-card p-5 transition-colors hover:border-primary/50"
        >
          <MessageCircle className="size-5 text-primary" />
          <h2 className="mt-3 font-semibold">WhatsApp</h2>
          <p className="mt-1 text-sm text-muted-foreground">+254 715 198636</p>
        </a>
      </section>
      <section className="mt-8 rounded-3xl border border-border bg-card p-5 md:p-7">
        <h2 className="font-display text-2xl font-semibold">Send a support ticket</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          No account needed. We’ll use your contact details only to respond to this request.
        </p>
        {mutation.isSuccess ? (
          <p className="mt-5 rounded-xl bg-primary/10 p-4 text-sm text-foreground">
            Thanks — your ticket is with the team. We’ll get back to you as soon as we can.
          </p>
        ) : (
          <form
            className="mt-5 grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              mutation.mutate();
            }}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <label>
                <Label htmlFor="support-name">Full name</Label>
                <Input
                  id="support-name"
                  className="mt-1.5"
                  required
                  minLength={2}
                  value={form.full_name}
                  onChange={(e) => update("full_name", e.target.value)}
                />
              </label>
              <label>
                <Label htmlFor="support-contact">Email or phone</Label>
                <Input
                  id="support-contact"
                  className="mt-1.5"
                  required
                  value={form.contact}
                  onChange={(e) => update("contact", e.target.value)}
                />
              </label>
            </div>
            <label>
              <Label htmlFor="support-category">What do you need help with?</Label>
              <select
                id="support-category"
                value={form.category}
                onChange={(e) => update("category", e.target.value)}
                className="mt-1.5 flex h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              >
                <option value="story">A story or report</option>
                <option value="account">My account</option>
                <option value="privacy">Privacy or my data</option>
                <option value="employer">Employer claim or reply</option>
                <option value="technical">Technical problem</option>
                <option value="other">Something else</option>
              </select>
            </label>
            <label>
              <Label htmlFor="support-message">Message</Label>
              <Textarea
                id="support-message"
                className="mt-1.5 min-h-32"
                required
                minLength={10}
                maxLength={4000}
                value={form.message}
                onChange={(e) => update("message", e.target.value)}
              />
            </label>
            {mutation.isError ? (
              <p className="text-sm text-destructive">
                We could not send that ticket. Please try again or email us directly.
              </p>
            ) : null}
            <Button type="submit" className="w-fit" disabled={mutation.isPending}>
              <Send className="size-4" />
              {mutation.isPending ? "Sending…" : "Send ticket"}
            </Button>
          </form>
        )}
      </section>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        Prefer a conversation? Open the chat bubble — we usually reply within a day.
      </p>
    </div>
  );
}
