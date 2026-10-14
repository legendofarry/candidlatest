import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { motion } from "motion/react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Headset, Mail, MessageCircle, Send, ShieldCheck } from "lucide-react";
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
      "Yes. Employers can claim their company profile and request a right of reply. They cannot see a contributor's account email or legal name.",
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
    <div className="min-h-dvh w-full bg-background md:h-dvh md:overflow-hidden">
      <div className="relative min-h-dvh w-full overflow-hidden bg-background md:h-dvh md:min-h-0 md:bg-card/85 md:shadow-2xl md:backdrop-blur-xl">
        <div className="grid min-h-dvh md:h-dvh md:min-h-0 md:grid-cols-[1.05fr_1.2fr]">
          <div className="relative hidden overflow-hidden border-r border-border/80 bg-[linear-gradient(140deg,#182c31_0%,#20272d_55%,#29251f_100%)] md:flex md:h-dvh md:items-center md:justify-center md:p-12">
            <motion.div
              initial={{ opacity: 0, x: -18 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              className="relative w-full max-w-xl space-y-6"
            >
              <div className="inline-flex items-center gap-2 rounded-full border border-sky-400/30 bg-sky-500/10 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-sky-200">
                <Headset className="size-3.5" />
                Help desk
              </div>
              <h2 className="max-w-md text-4xl font-semibold tracking-tight text-white">
                Questions, concerns, and support — all in one place.
              </h2>
              <p className="max-w-md text-base text-slate-200/80">
                We can help with your account, a story, privacy, or an employer reply.
              </p>
              <div className="relative mt-12 h-56">
                <motion.div
                  className="absolute left-3 top-3 flex w-64 items-center gap-3 rounded-xl border border-white/15 bg-white/[0.06] p-4 text-sky-200 shadow-xl backdrop-blur"
                  animate={{ x: [0, 12, 0], y: [0, -3, 0] }}
                  transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
                >
                  <span className="flex size-10 items-center justify-center rounded-lg bg-sky-300/15">
                    <MessageCircle className="size-5" />
                  </span>
                  <span className="space-y-2">
                    <i className="block h-2 w-24 rounded-full bg-white/70" />
                    <i className="block h-1.5 w-16 rounded-full bg-white/30" />
                  </span>
                </motion.div>
                <motion.div
                  className="absolute bottom-2 right-2 flex w-56 items-center gap-3 rounded-xl border border-white/15 bg-[#232b2d] p-4 text-emerald-200 shadow-xl"
                  animate={{ x: [0, -9, 0], y: [0, 4, 0] }}
                  transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut", delay: 0.3 }}
                >
                  <ShieldCheck className="size-5" />
                </motion.div>
              </div>
            </motion.div>
          </div>

          <div className="overflow-y-auto px-4 py-4 md:h-dvh md:min-h-0 md:p-8">
            <div className="mx-auto max-w-3xl py-1 md:py-4">
              <header className="flex items-center gap-3 rounded-2xl bg-secondary/60 p-4 sm:p-5 md:rounded-3xl md:p-10">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                  <Headset className="size-5 text-primary" />
                </span>
                <div>
                  <h1 className="font-display text-xl font-semibold tracking-tight md:text-4xl">
                    Help & support
                  </h1>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Questions about your account, a story, or privacy? We’re here.
                  </p>
                </div>
              </header>
              <section className="mt-5 md:mt-8">
                <h2 className="font-display text-lg font-semibold md:text-2xl">Common questions</h2>
                <Accordion
                  type="single"
                  collapsible
                  className="mt-2 rounded-2xl border border-border px-3 sm:px-4"
                >
                  {faqs.map(({ question, answer }) => (
                    <AccordionItem value={question} key={question}>
                      <AccordionTrigger>{question}</AccordionTrigger>
                      <AccordionContent className="text-muted-foreground">
                        {answer}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </section>
              <section className="mt-4 grid grid-cols-2 gap-2 md:mt-8 md:gap-3">
                <a
                  href="mailto:moderation.mails.go@gmail.com"
                  className="flex items-center gap-2 rounded-xl border border-border bg-card p-3 transition-colors hover:border-primary/50 md:rounded-2xl md:p-5"
                >
                  <Mail className="size-4 shrink-0 text-primary" />
                  <h2 className="text-sm font-semibold">Email us</h2>
                </a>
                <a
                  href="https://wa.me/254715938110?text=Hi%20Candid%20team%2C%20I%20need%20help%20with%20…"
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 rounded-xl border border-border bg-card p-3 transition-colors hover:border-primary/50 md:rounded-2xl md:p-5"
                >
                  <MessageCircle className="size-4 shrink-0 text-primary" />
                  <h2 className="text-sm font-semibold">WhatsApp</h2>
                </a>
              </section>
              <section className="mt-4 rounded-2xl border border-border bg-card p-4 md:mt-8 md:rounded-3xl md:p-7">
                <h2 className="font-display text-lg font-semibold md:text-2xl">Send a support ticket</h2>
                {mutation.isSuccess ? (
                  <p className="mt-5 rounded-xl bg-primary/10 p-4 text-sm text-foreground">
                    Thanks — your ticket is with the team. We’ll get back to you as soon as we can.
                  </p>
                ) : (
                  <form
                    className="mt-3 grid gap-3 md:mt-5 md:gap-4"
                    onSubmit={(event) => {
                      event.preventDefault();
                      mutation.mutate();
                    }}
                  >
                    <div className="grid grid-cols-2 gap-2 sm:gap-4">
                      <label>
                        <Label htmlFor="support-name">Full name</Label>
                        <Input
                          id="support-name"
                          className="mt-1 h-10"
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
                          className="mt-1 h-10"
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
                        className="mt-1 flex h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm"
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
                        className="mt-1 min-h-24"
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
              <p className="mt-4 pb-2 text-center text-xs text-muted-foreground md:mt-6 md:text-sm">
                Prefer a conversation? Open the chat bubble — we usually reply within a day.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
