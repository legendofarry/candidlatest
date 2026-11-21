import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, BadgeCheck, MessageCircle, Send, ShieldCheck, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { notify as toast } from "@/lib/notifications-store";
import { appointExecutiveModeratorAction, createModeratorForumPostAction, getExecutiveModeratorCandidates, getModeratorCouncilChannel, getModeratorForum, sendModeratorCouncilMessageAction } from "@/lib/company-groups.functions";

export const Route = createFileRoute("/moderator-forum")({
  head: () => ({ meta: [{ title: "Moderator forum | Candid" }] }),
  component: ModeratorForumPage,
});

function ModeratorForumPage() {
  const { user, loading } = useAuth();
  const client = useQueryClient();
  const [body, setBody] = useState("");
  const [councilBody, setCouncilBody] = useState("");
  const [actionType, setActionType] = useState("update");
  const [executiveId, setExecutiveId] = useState("");
  const [busy, setBusy] = useState(false);
  const listForum = useServerFn(getModeratorForum);
  const createPost = useServerFn(createModeratorForumPostAction);
  const getCouncil = useServerFn(getModeratorCouncilChannel);
  const sendCouncil = useServerFn(sendModeratorCouncilMessageAction);
  const appoint = useServerFn(appointExecutiveModeratorAction);
  const getCandidates = useServerFn(getExecutiveModeratorCandidates);
  const forum = useQuery({ queryKey: ["moderator-forum", user?.uid ?? null], queryFn: () => listForum(), enabled: Boolean(user) });
  const council = useQuery({ queryKey: ["moderator-council", user?.uid ?? null], queryFn: () => getCouncil(), enabled: Boolean(forum.data?.access.is_official || forum.data?.access.is_executive) });
  const candidates = useQuery({ queryKey: ["executive-moderator-candidates"], queryFn: () => getCandidates(), enabled: Boolean(forum.data?.access.is_official) });

  useEffect(() => {
    if (candidates.data) setExecutiveId(candidates.data.current_user_id ?? "");
  }, [candidates.data]);

  async function submitPost(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true);
    try { await createPost({ data: { body } }); setBody(""); await client.invalidateQueries({ queryKey: ["moderator-forum"] }); toast.success("Posted to the moderator forum"); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Could not publish your post."); }
    finally { setBusy(false); }
  }
  async function submitCouncil(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true);
    try { await sendCouncil({ data: { body: councilBody, action_type: actionType as "report" | "policy" | "safety" | "question" | "update" } }); setCouncilBody(""); await client.invalidateQueries({ queryKey: ["moderator-council"] }); toast.success("Sent to Candid"); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Could not send the message."); }
    finally { setBusy(false); }
  }
  async function setExecutive(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true);
    try { await appoint({ data: { user_id: executiveId.trim() || null } }); setExecutiveId(""); await client.invalidateQueries({ queryKey: ["moderator-forum"] }); toast.success(executiveId.trim() ? "Executive moderator appointed" : "Executive moderator cleared"); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Could not update the appointment."); }
    finally { setBusy(false); }
  }

  if (loading || (user && forum.isLoading)) return <div className="flex min-h-[55dvh] items-center justify-center text-sm text-muted-foreground">Opening moderator forum…</div>;
  if (!user) return <main className="mx-auto max-w-xl px-5 py-16"><p className="text-sm text-muted-foreground">Sign in to open the moderator forum.</p><Button asChild className="mt-4 rounded-full"><Link to="/auth">Sign in</Link></Button></main>;
  if (forum.isError) return <main className="mx-auto max-w-2xl px-5 py-16"><Button asChild variant="ghost" className="-ml-3 rounded-full"><Link to="/"><ArrowLeft className="size-4" />Back</Link></Button><ShieldCheck className="mt-8 size-8 text-primary" /><h1 className="mt-3 font-display text-3xl font-semibold">Moderator forum</h1><p className="mt-2 text-sm leading-6 text-muted-foreground">This space is for company-group moderators, moderator applicants, the executive moderator, and Candid staff.</p><Button asChild className="mt-5 rounded-full"><Link to="/companies">Explore company groups <ArrowRight className="size-4" /></Link></Button></main>;
  if (!forum.data) return null;
  const { access, posts } = forum.data;
  const canUseCouncil = access.is_official || access.is_executive;

  return <main className="min-h-[calc(100dvh-5rem)] bg-background text-foreground"><div className="mx-auto w-full max-w-6xl px-4 pb-14 pt-5 sm:px-7 lg:px-10 lg:pt-10">
    <Button asChild variant="ghost" className="-ml-3 rounded-full text-muted-foreground"><Link to="/"><ArrowLeft className="size-4" />Candid</Link></Button>
    <header className="mt-5 flex flex-col gap-5 border-b border-border pb-7 sm:flex-row sm:items-end sm:justify-between sm:pb-9"><div><p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary"><Users className="size-4" />Moderator network</p><h1 className="mt-2 font-display text-3xl font-semibold tracking-tight sm:text-4xl">The moderator forum</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">A shared place for group moderators and people who have applied. Coordinate practice, raise safety questions, and learn from other communities.</p></div><span className="inline-flex h-10 items-center gap-2 self-start rounded-full border border-border px-4 text-xs text-muted-foreground sm:self-auto"><BadgeCheck className="size-4 text-primary" />{access.role}</span></header>
    <div className="mt-7 grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-14">
      <section className="min-w-0"><div className="mb-5 flex items-center gap-2"><MessageCircle className="size-4 text-primary" /><h2 className="text-lg font-semibold">Network discussion</h2></div><form onSubmit={submitPost} className="border-y border-border py-4"><Label htmlFor="forum-post" className="sr-only">Write a forum post</Label><Textarea id="forum-post" value={body} onChange={(event) => setBody(event.target.value)} maxLength={3000} minLength={3} placeholder="Share a question, idea, or moderation lesson…" className="min-h-28 resize-y border-0 bg-transparent px-0 text-base shadow-none focus-visible:ring-0" /><div className="flex items-center justify-between gap-3 border-t border-border pt-3"><span className="text-xs text-muted-foreground">Your Candid profile privacy settings apply.</span><Button disabled={busy || body.trim().length < 3} className="rounded-full">Post <Send className="size-4" /></Button></div></form>
        {posts.length ? <div className="divide-y divide-border">{posts.map((post) => <article key={post.id} className="py-5"><div className="flex items-center justify-between gap-3"><p className="text-sm font-semibold">{post.author_username}</p><time className="shrink-0 text-xs text-muted-foreground">{new Date(post.created_at).toLocaleDateString()}</time></div><p className="mt-3 whitespace-pre-wrap text-sm leading-6">{post.body}</p></article>)}</div> : <div className="border-b border-border py-14 text-center"><MessageCircle className="mx-auto size-7 text-muted-foreground" /><p className="mt-3 text-sm font-medium">A new space to compare notes</p><p className="mt-1 text-xs text-muted-foreground">Start a discussion with the moderator network.</p></div>}
      </section>
      <aside className="space-y-8 border-t border-border pt-6 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0"><section><p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Access</p><p className="mt-3 text-sm leading-6 text-muted-foreground">Group moderators and current or past moderator applicants are added automatically. Membership does not expose your private work history.</p><p className="mt-4 text-xs text-muted-foreground">Your access: <span className="font-medium text-foreground">{access.role}</span>{access.moderator_count ? ` · ${access.moderator_count} group${access.moderator_count === 1 ? "" : "s"}` : ""}</p></section>
      {access.is_official ? <section className="border-t border-border pt-6"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Network leadership</p><h2 className="mt-2 text-base font-semibold">Executive moderator</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">Assign one moderator to coordinate the network and use the private Candid channel.</p><form onSubmit={setExecutive} className="mt-4 space-y-3"><div className="space-y-2"><Label htmlFor="executive-user" className="text-xs">Choose a moderator or applicant</Label><select id="executive-user" value={executiveId} onChange={(event) => setExecutiveId(event.target.value)} className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"><option value="">No executive moderator</option>{candidates.data?.candidates.map((candidate) => <option key={candidate.user_id} value={candidate.user_id}>{candidate.username}{candidate.is_active_moderator ? " · group moderator" : " · applicant"}{candidate.groups.length ? ` · ${candidate.groups.slice(0, 2).join(", ")}` : ""}</option>)}</select></div><Button disabled={busy} variant="outline" className="w-full rounded-full">{executiveId.trim() ? "Appoint executive moderator" : "Clear appointment"}</Button></form></section> : null}
      {canUseCouncil ? <section className="border-t border-border pt-6"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Private Candid channel</p><h2 className="mt-2 text-base font-semibold">Executive reports</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">Only the executive moderator and Candid staff can read this channel.</p><form onSubmit={submitCouncil} className="mt-4 space-y-3"><div className="space-y-2"><Label htmlFor="council-type" className="text-xs">Message type</Label><select id="council-type" value={actionType} onChange={(event) => setActionType(event.target.value)} className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm"><option value="report">Group report</option><option value="safety">Safety concern</option><option value="policy">Policy question</option><option value="question">Question</option><option value="update">Update</option></select></div><Textarea value={councilBody} onChange={(event) => setCouncilBody(event.target.value)} maxLength={4000} placeholder="Send a private note to Candid…" className="min-h-24 text-sm" /><Button disabled={busy || councilBody.trim().length < 2} className="w-full rounded-full">Send to Candid <ArrowRight className="size-4" /></Button></form><div className="mt-5 max-h-80 divide-y divide-border overflow-y-auto">{council.data?.map((message) => <article key={message.id} className="py-3"><div className="flex justify-between gap-2"><span className="text-xs font-semibold">{message.sender_label}</span><time className="text-[10px] text-muted-foreground">{new Date(message.created_at).toLocaleDateString()}</time></div><p className="mt-1 text-[10px] uppercase tracking-wide text-primary">{message.action_type}</p><p className="mt-2 whitespace-pre-wrap text-xs leading-5">{message.body}</p></article>)}</div></section> : null}
      <section className="border-t border-border pt-6"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Go to a group</p><p className="mt-2 text-xs leading-5 text-muted-foreground">Open a company community to review join requests, manage its rules, and respond to tag corrections.</p><Button asChild variant="outline" className="mt-4 w-full rounded-full"><Link to="/companies">Browse company directory <ArrowRight className="size-4" /></Link></Button></section></aside>
    </div>
  </div></main>;
}
