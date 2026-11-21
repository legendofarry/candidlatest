import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { queryOptions, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Building2,
  Check,
  ChevronRight,
  FileText,
  Flag,
  Loader2,
  LockKeyhole,
  MessageCircle,
  MoreHorizontal,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { CompanyLogo } from "@/components/site/company-logo";
import { StoryCard } from "@/components/site/story-card";
import { useAuth } from "@/hooks/useAuth";
import { getCompany } from "@/lib/public.functions";
import { listCompanyScores } from "@/lib/public.functions";
import {
  applyCompanyGroupModeratorAction,
  createCompanyGroupPostAction,
  decideCompanyGroupJoinAction,
  decideCompanyGroupModeratorAction,
  decideCompanyTagCorrectionAction,
  endorseCompanyGroupModeratorAction,
  getCompanyGroup,
  getCompanyGroupModerationQueue,
  getCompanyTagCorrections,
  leaveCompanyGroupAction,
  moderateCompanyGroupPostAction,
  removeCompanyGroupMemberAction,
  requestCompanyGroupJoinAction,
  suggestCompanyTagCorrectionAction,
  updateCompanyGroupRulesAction,
} from "@/lib/company-groups.functions";
import { notify as toast } from "@/lib/notifications-store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/company-groups/$slug")({
  loader: async ({ context, params }) => {
    const data = await context.queryClient.ensureQueryData(companyQuery(params.slug));
    if (!data) throw notFound();
    return { name: data.company.name };
  },
  head: ({ loaderData }) => ({
    meta: [{ title: loaderData ? `#${loaderData.name} community | Candid` : "Company community | Candid" }],
  }),
  component: CompanyGroupPage,
});

const companyQuery = (slug: string) => queryOptions({
  queryKey: ["company", slug],
  queryFn: () => getCompany({ data: { slug } }),
});

type GroupTab = "stories" | "discussion" | "members" | "rules" | "manage" | "tag-review";

function CompanyGroupPage() {
  const { slug } = Route.useParams();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: companyData } = useSuspenseQuery(companyQuery(slug));
  const company = companyData.company;
  const loadGroup = useServerFn(getCompanyGroup);
  const requestJoin = useServerFn(requestCompanyGroupJoinAction);
  const leaveGroup = useServerFn(leaveCompanyGroupAction);
  const postToGroup = useServerFn(createCompanyGroupPostAction);
  const loadQueue = useServerFn(getCompanyGroupModerationQueue);
  const decideJoin = useServerFn(decideCompanyGroupJoinAction);
  const decideModerator = useServerFn(decideCompanyGroupModeratorAction);
  const applyModerator = useServerFn(applyCompanyGroupModeratorAction);
  const endorseModerator = useServerFn(endorseCompanyGroupModeratorAction);
  const updateRules = useServerFn(updateCompanyGroupRulesAction);
  const moderatePost = useServerFn(moderateCompanyGroupPostAction);
  const removeMember = useServerFn(removeCompanyGroupMemberAction);
  const loadCorrections = useServerFn(getCompanyTagCorrections);
  const suggestTag = useServerFn(suggestCompanyTagCorrectionAction);
  const decideCorrection = useServerFn(decideCompanyTagCorrectionAction);
  const [tab, setTab] = useState<GroupTab>("stories");
  const [body, setBody] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [applicationNote, setApplicationNote] = useState("");
  const [rulesDraft, setRulesDraft] = useState<string[]>([]);
  const [storyForCorrection, setStoryForCorrection] = useState("");
  const [correctionCompanyId, setCorrectionCompanyId] = useState("");
  const [correctionReason, setCorrectionReason] = useState("");

  const group = useQuery({
    queryKey: ["company-group", company.id, user?.uid ?? null],
    queryFn: () => loadGroup({ data: { company_id: company.id } }),
  });
  const groupView = group.data;
  const viewer = groupView?.viewer;
  const moderationQueue = useQuery({
    queryKey: ["company-group-moderation", company.id],
    queryFn: () => loadQueue({ data: { company_id: company.id } }),
    enabled: Boolean(viewer?.is_moderator),
  });
  const corrections = useQuery({
    queryKey: ["company-tag-corrections", company.id, user?.uid ?? null],
    queryFn: () => loadCorrections({ data: { company_id: company.id } }),
    enabled: Boolean(user),
  });
  const directory = useQuery({
    queryKey: ["company-scores"],
    queryFn: () => listCompanyScores(),
    enabled: Boolean(viewer?.is_moderator),
    staleTime: 60_000,
  });

  useEffect(() => {
    if (groupView?.group.rules) setRulesDraft(groupView.group.rules);
  }, [groupView?.group.rules]);

  const tabs: Array<{ id: GroupTab; label: string; icon: typeof FileText; count?: number }> = [
    { id: "stories", label: "Stories", icon: FileText, count: companyData.stories.length },
    { id: "discussion", label: "Discussion", icon: MessageCircle, count: groupView?.posts.length ?? 0 },
    { id: "members", label: "Members", icon: Users, count: groupView?.member_count ?? 0 },
    { id: "rules", label: "Rules", icon: ShieldCheck },
    ...(viewer?.is_moderator ? [{ id: "manage" as const, label: "Manage", icon: LockKeyhole }] : []),
    { id: "tag-review", label: "Tag review", icon: Flag, count: corrections.data?.length ?? 0 },
  ];

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["company-group", company.id] }),
      queryClient.invalidateQueries({ queryKey: ["company-group-moderation", company.id] }),
      queryClient.invalidateQueries({ queryKey: ["company-tag-corrections", company.id] }),
      queryClient.invalidateQueries({ queryKey: ["company", slug] }),
    ]);
  }

  async function run(action: () => Promise<unknown>, successMessage?: string) {
    setBusy(true);
    setError("");
    try {
      await action();
      if (successMessage) toast.success(successMessage);
      await refresh();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Could not complete that action.";
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  async function submitGroupPost(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await run(async () => {
      await postToGroup({ data: { company_id: company.id, body, anonymous: anonymous && viewer?.post_mode !== "official_company" } });
      setBody("");
      setAnonymous(false);
    }, "Posted to the company community");
  }

  async function saveRules(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await run(async () => {
      await updateRules({ data: { company_id: company.id, rules: rulesDraft } });
    }, "Group rules updated");
  }

  async function suggestCorrection(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await run(async () => {
      await suggestTag({ data: { story_id: storyForCorrection, from_company_id: company.id, to_company_id: correctionCompanyId, reason: correctionReason } });
      setStoryForCorrection("");
      setCorrectionCompanyId("");
      setCorrectionReason("");
    }, "Tag suggestion sent to the other group");
  }

  const visibleCorrections = useMemo(() => corrections.data ?? [], [corrections.data]);

  if (group.isLoading) {
    return <div className="flex min-h-[60dvh] items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 size-4 animate-spin" />Opening #{company.slug}…</div>;
  }
  if (!groupView) return <section className="mx-auto max-w-xl py-16 text-center"><h1 className="text-2xl font-semibold">Community unavailable</h1><p className="mt-2 text-sm text-muted-foreground">This company page is not available for group access.</p><Button asChild variant="outline" className="mt-5 rounded-full"><Link to="/companies/$slug" params={{ slug }}>Back to company</Link></Button></section>;

  const joinStatus = viewer?.join_request_status;
  const applicationStatus = viewer?.moderator_application_status;
  const isCompanyAccount = viewer?.account_type === "company";

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto w-full max-w-[1500px] px-4 pb-12 pt-4 sm:px-6 lg:px-10 lg:pt-8">
        <Link to="/companies/$slug" params={{ slug }} className="inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"><ArrowLeft className="size-4" />Company profile</Link>
        <header className="mt-4 grid gap-5 border-b border-border pb-6 sm:mt-6 sm:pb-8 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
          <div className="flex min-w-0 items-center gap-4 sm:gap-5">
            <CompanyLogo name={company.name} sizeClassName="size-16 rounded-2xl sm:size-20 sm:rounded-[1.6rem]" />
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">Company community</p>
              <h1 className="mt-1 truncate font-display text-3xl font-semibold tracking-tight sm:text-4xl">{company.name}</h1>
              <p className="mt-1 truncate text-sm text-muted-foreground">{company.industry ?? "Company"} · <span className="text-primary">#{company.slug}</span></p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 md:justify-end">
            <span className="inline-flex h-10 items-center gap-2 rounded-full border border-border px-4 text-sm text-muted-foreground"><Users className="size-4" />{groupView.member_count} members</span>
            {!user ? <Button asChild className="h-10 rounded-full px-5"><Link to="/auth">Sign in to join</Link></Button> : user.emailVerified ? viewer.is_member ? (
              <Button variant="outline" disabled={busy} onClick={() => void run(() => leaveGroup({ data: { company_id: company.id } }), "You left this group")} className="h-10 rounded-full px-5">Leave group</Button>
            ) : isCompanyAccount ? (
              <span className="inline-flex h-10 items-center rounded-full border border-border px-4 text-xs text-muted-foreground">Company accounts don’t join worker groups</span>
            ) : joinStatus === "pending" ? (
              <Button variant="outline" disabled className="h-10 rounded-full px-5">Request sent</Button>
            ) : (
              <Button disabled={busy} onClick={() => void run(() => requestJoin({ data: { company_id: company.id } }), "Join request sent")} className="h-10 rounded-full px-5">Request to join <ArrowRight className="size-4" /></Button>
            ) : <Button asChild className="h-10 rounded-full px-5"><Link to="/verify-email">Verify email to join</Link></Button>}
          </div>
        </header>

        <div className="mt-5 flex items-center gap-1 overflow-x-auto border-b border-border [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="tablist" aria-label="Company group sections">
          {tabs.map(({ id, label, icon: Icon, count }) => (
            <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={cn("flex min-h-12 shrink-0 items-center gap-2 border-b-2 px-3 text-sm transition-colors sm:px-4", tab === id ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
              <Icon className="size-4" />{label}{count !== undefined ? <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px]">{count}</span> : null}
            </button>
          ))}
        </div>

        <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_19rem] lg:gap-10">
          <section className="min-w-0">
            {tab === "stories" ? (
              <div>
                <div className="mb-5 flex items-end justify-between gap-4">
                  <div><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">Tagged #{company.slug}</p><h2 className="mt-1 font-display text-2xl font-semibold">Workplace stories</h2></div>
                  <Button asChild variant="outline" className="h-10 shrink-0 rounded-full"><Link to="/post">Share a story</Link></Button>
                </div>
                {companyData.stories.length ? <div className="space-y-4">{companyData.stories.map((story) => <StoryCard key={story.id} story={story} />)}</div> : <EmptyState icon={FileText} title="No stories here yet" description="The first story tagged to this company will start the conversation." />}
              </div>
            ) : null}

            {tab === "discussion" ? (
              <div>
                <div className="mb-5"><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">Member space</p><h2 className="mt-1 font-display text-2xl font-semibold">Group discussion</h2><p className="mt-1 text-sm text-muted-foreground">A place for members to compare experiences and support each other.</p></div>
                {viewer.can_post ? (
                  <form onSubmit={submitGroupPost} className="mb-7 border-y border-border py-5">
                    {viewer.post_mode === "official_company" ? <p className="mb-3 inline-flex items-center gap-2 text-xs font-medium text-primary"><BadgeCheck className="size-4" />Posting as verified company</p> : null}
                    <Label htmlFor="group-post" className="sr-only">Write to the company group</Label>
                    <Textarea id="group-post" value={body} onChange={(event) => setBody(event.target.value)} minLength={12} maxLength={3000} placeholder="Share something useful with this company community…" className="min-h-32 resize-y border-0 bg-transparent px-0 text-base shadow-none focus-visible:ring-0" />
                    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
                      {viewer.post_mode !== "official_company" ? <label className="inline-flex items-center gap-2 text-xs text-muted-foreground"><input type="checkbox" checked={anonymous} onChange={(event) => setAnonymous(event.target.checked)} className="size-4 accent-primary" />Post anonymously</label> : <span className="text-xs text-muted-foreground">Official company updates are labeled.</span>}
                      <div className="flex items-center gap-3"><span className="text-xs text-muted-foreground">{body.length}/3000</span><Button type="submit" disabled={busy || body.trim().length < 12} className="h-10 rounded-full px-5">Post <ArrowRight className="size-4" /></Button></div>
                    </div>
                    {error ? <p role="alert" className="mt-3 text-sm text-danger">{error}</p> : null}
                  </form>
                ) : (
                  <div className="mb-7 flex items-start gap-3 border-y border-border py-5"><LockKeyhole className="mt-0.5 size-5 shrink-0 text-primary" /><div><p className="text-sm font-medium">{isCompanyAccount ? "Read-only company access" : "Join the group to take part"}</p><p className="mt-1 text-sm leading-6 text-muted-foreground">{isCompanyAccount ? "Verified company accounts with Premium can publish a clearly labeled official update." : "Anyone can read public stories. Members can start group discussions after their request is approved."}</p></div></div>
                )}
                {groupView.posts.length ? <div className="divide-y divide-border">{groupView.posts.map((post) => <article key={post.id} className="py-5"><div className="flex items-start gap-3"><span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-secondary text-xs font-semibold text-muted-foreground">{post.author_photo_url ? <img src={post.author_photo_url} alt="" className="size-full object-cover" /> : (post.author_username?.[0] ?? "M").toUpperCase()}</span><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className="text-sm font-semibold">{post.author_kind === "official_company" ? `${company.name} · Official` : post.author_username}</span>{post.author_kind === "official_company" ? <BadgeCheck className="size-4 text-primary" /> : null}<time className="ml-auto shrink-0 text-xs text-muted-foreground">{formatDate(post.created_at)}</time></div><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-foreground/90">{post.body}</p></div>{viewer.is_moderator && post.author_kind !== "official_company" ? <button type="button" aria-label="Hide discussion post" onClick={() => { const reason = window.prompt("Why does this post break the group rules?"); if (reason?.trim()) void run(() => moderatePost({ data: { company_id: company.id, post_id: post.id, reason } }), "Post hidden from this group"); }} className="flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"><MoreHorizontal className="size-5" /></button> : null}</div></article>)}</div> : <EmptyState icon={MessageCircle} title="A thoughtful conversation starts here" description="Members can share questions, context, and support. Workplace stories remain in the public story stream." />}
              </div>
            ) : null}

            {tab === "members" ? (
              <div><div className="mb-5"><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">People</p><h2 className="mt-1 font-display text-2xl font-semibold">Group members</h2></div>{viewer.is_member ? groupView.members.length ? <div className="divide-y divide-border">{groupView.members.map((member) => <div key={member.user_id} className="flex items-center gap-3 py-3"><span className="flex size-10 items-center justify-center overflow-hidden rounded-full bg-secondary text-xs font-semibold">{member.photo_url ? <img src={member.photo_url} alt="" className="size-full object-cover" /> : member.username[0]?.toUpperCase()}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">@{member.username}</p><p className="text-xs text-muted-foreground">{member.role === "lead_moderator" ? "Lead moderator" : member.role === "moderator" ? "Moderator" : "Member"}</p></div>{viewer.is_moderator && member.role === "member" ? <Button size="sm" variant="ghost" onClick={() => { const reason = window.prompt("Reason for removing this member?"); if (reason?.trim()) void run(() => removeMember({ data: { company_id: company.id, user_id: member.user_id, reason } }), "Member removed"); }}>Remove</Button> : null}</div>)}</div> : <EmptyState icon={Users} title="The member list is private to members" description="Join this group to see other members." /> : <div className="border-y border-border py-7"><p className="text-sm font-medium">Members choose to be here</p><p className="mt-1 text-sm text-muted-foreground">Join to see the member list. Your work history doesn’t automatically make your membership public.</p></div>}</div>
            ) : null}

            {tab === "rules" ? (
              <div><div className="mb-5"><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">Group norms</p><h2 className="mt-1 font-display text-2xl font-semibold">Rules for #{company.slug}</h2></div>{viewer.is_moderator ? <form onSubmit={saveRules} className="space-y-4">{rulesDraft.map((rule, index) => <div key={index} className="flex items-start gap-3"><span className="mt-3 text-xs font-semibold text-primary">{String(index + 1).padStart(2, "0")}</span><Input value={rule} maxLength={240} onChange={(event) => setRulesDraft((current) => current.map((item, row) => row === index ? event.target.value : item))} className="h-12" /><button type="button" aria-label="Remove rule" onClick={() => setRulesDraft((current) => current.filter((_, row) => row !== index))} className="flex size-11 shrink-0 items-center justify-center text-muted-foreground hover:text-danger">×</button></div>)}{rulesDraft.length < 10 ? <Button type="button" variant="outline" onClick={() => setRulesDraft((current) => [...current, ""])} className="rounded-full">Add rule</Button> : null}<Button type="submit" disabled={busy} className="ml-2 rounded-full">Save rules</Button></form> : <ol className="divide-y divide-border">{groupView.group.rules.map((rule, index) => <li key={`${index}-${rule}`} className="flex gap-4 py-5"><span className="text-xs font-semibold text-primary">{String(index + 1).padStart(2, "0")}</span><p className="text-sm leading-6">{rule}</p></li>)}</ol>}<p className="mt-6 border-l-2 border-primary/50 pl-4 text-xs leading-5 text-muted-foreground">Moderators apply group rules consistently. Decisions are recorded, and you can ask Candid to review a removal or hidden discussion.</p></div>
            ) : null}

            {tab === "manage" && viewer.is_moderator ? (
              <div className="space-y-10">
                <section><div className="mb-4"><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">Access</p><h2 className="mt-1 font-display text-2xl font-semibold">Join requests</h2></div>{moderationQueue.data?.joins.length ? <div className="divide-y divide-border">{moderationQueue.data.joins.map((entry) => <div key={entry.user_id} className="flex flex-wrap items-center gap-3 py-4"><div className="min-w-0 flex-1"><p className="text-sm font-medium">@{entry.username}</p><p className="text-xs text-muted-foreground">Requested {formatDate(entry.created_at)}</p></div><Button size="sm" variant="outline" disabled={busy} onClick={() => void run(() => decideJoin({ data: { company_id: company.id, user_id: entry.user_id, decision: "decline" } }))}>Decline</Button><Button size="sm" disabled={busy} onClick={() => void run(() => decideJoin({ data: { company_id: company.id, user_id: entry.user_id, decision: "approve" } }), "Member approved")}>Approve</Button></div>)}</div> : <p className="border-y border-border py-5 text-sm text-muted-foreground">No requests waiting.</p>}</section>
                <section><div className="mb-4"><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">Community choice</p><h2 className="mt-1 font-display text-2xl font-semibold">Moderator candidates</h2><p className="mt-1 text-sm text-muted-foreground">Member vouches and useful contributions inform the recommendation; Candid or a current moderator makes the appointment.</p></div>{moderationQueue.data?.applications.length ? <div className="divide-y divide-border">{moderationQueue.data.applications.map((candidate) => <div key={candidate.user_id} className="py-4"><div className="flex flex-wrap items-start gap-3"><div className="min-w-0 flex-1"><p className="flex items-center gap-2 text-sm font-medium">{candidate.username}{candidate.recommended ? <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] text-primary">Recommended</span> : null}</p><p className="mt-1 text-xs text-muted-foreground">{candidate.endorsements} vouches · {candidate.contributions} contributions</p></div><div className="flex gap-2"><Button size="sm" variant="outline" disabled={busy} onClick={() => void run(() => decideModerator({ data: { company_id: company.id, candidate_id: candidate.user_id, decision: "decline" } }))}>Decline</Button><Button size="sm" disabled={busy} onClick={() => void run(() => decideModerator({ data: { company_id: company.id, candidate_id: candidate.user_id, decision: "approve" } }), "Moderator selected")}>Select</Button></div></div>{candidate.note ? <p className="mt-3 text-sm leading-6 text-muted-foreground">{candidate.note}</p> : null}</div>)}</div> : <p className="border-y border-border py-5 text-sm text-muted-foreground">No moderator applications are waiting.</p>}<Button asChild variant="outline" className="mt-4 rounded-full"><Link to="/moderator-forum">Open moderator forum <ArrowRight className="size-4" /></Link></Button></section>
                <section><div className="mb-4"><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">Tag accuracy</p><h2 className="mt-1 font-display text-2xl font-semibold">Suggest a story tag correction</h2><p className="mt-1 text-sm text-muted-foreground">The other group reviews first; the story author makes the final choice.</p></div><form onSubmit={suggestCorrection} className="grid gap-3 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="correction-story">Story</Label><select id="correction-story" value={storyForCorrection} onChange={(event) => setStoryForCorrection(event.target.value)} className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"><option value="">Choose a story</option>{companyData.stories.map((story) => <option key={story.id} value={story.id}>{story.title.slice(0, 70)}</option>)}</select></div><div className="space-y-2"><Label htmlFor="correction-company">Belongs under</Label><select id="correction-company" value={correctionCompanyId} onChange={(event) => setCorrectionCompanyId(event.target.value)} className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"><option value="">Choose company</option>{(directory.data?.companies ?? []).filter((item) => item.company_id && item.company_id !== company.id).map((item) => <option key={item.company_id} value={item.company_id!}>{item.name}</option>)}</select></div><div className="space-y-2 sm:col-span-2"><Label htmlFor="correction-reason">Why this tag may be wrong</Label><Textarea id="correction-reason" value={correctionReason} onChange={(event) => setCorrectionReason(event.target.value)} maxLength={700} className="min-h-20" /></div><div className="sm:col-span-2"><Button disabled={busy || !storyForCorrection || !correctionCompanyId || correctionReason.trim().length < 5} className="rounded-full">Send suggestion <ArrowRight className="size-4" /></Button></div></form></section>
              </div>
            ) : null}

            {tab === "tag-review" ? (
              <div><div className="mb-5"><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">Two-step review</p><h2 className="mt-1 font-display text-2xl font-semibold">Story tag requests</h2><p className="mt-1 text-sm text-muted-foreground">A second group moderator reviews a suggestion. The story author decides whether the company tag changes.</p></div>{visibleCorrections.length ? <div className="divide-y divide-border">{visibleCorrections.map((correction) => { const isTargetModerator = correction.to_company_id === company.id && viewer.is_moderator && correction.status === "pending_target_moderator"; const isAuthorDecision = correction.author_id === user?.uid && correction.status === "pending_author"; return <article key={correction.id} className="py-5"><p className="text-sm font-semibold">{String(correction.from_company_name)} → {String(correction.to_company_name)}</p><p className="mt-2 text-sm leading-6 text-muted-foreground">{String(correction.reason)}</p><p className="mt-2 text-xs text-muted-foreground">{String(correction.status).replaceAll("_", " ")}</p>{isTargetModerator || isAuthorDecision ? <div className="mt-3 flex gap-2"><Button size="sm" variant="outline" onClick={() => void run(() => decideCorrection({ data: { correction_id: String(correction.id), decision: "decline" } }))}>Decline</Button><Button size="sm" onClick={() => void run(() => decideCorrection({ data: { correction_id: String(correction.id), decision: "approve" } }))}>{isAuthorDecision ? "Accept new company tag" : "Send to author"}</Button></div> : null}</article>; })}</div> : <EmptyState icon={Flag} title="No open tag requests" description="If a story is tagged to the wrong company, moderators can suggest a correction here." />}</div>
            ) : null}
            {error && tab !== "discussion" ? <p role="alert" className="mt-4 text-sm text-danger">{error}</p> : null}
          </section>

          <aside className="space-y-7 lg:sticky lg:top-6 lg:self-start">
            <section className="border-y border-border py-5 lg:border-t-0 lg:pt-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">About this community</p>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">A place for people connected to {company.name} to share experiences, ask questions, and compare notes.</p>
              <div className="mt-4 flex items-center gap-3 text-sm"><Users className="size-4 text-primary" />{groupView.member_count} members</div>
              <Link to="/companies/$slug" params={{ slug }} className="mt-4 inline-flex min-h-10 items-center gap-2 text-sm font-medium text-primary hover:underline">View company profile <ChevronRight className="size-4" /></Link>
            </section>
            <section>
              <div className="flex items-center justify-between"><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Group rules</p><button type="button" onClick={() => setTab("rules")} className="text-xs text-primary hover:underline">View all</button></div>
              <ol className="mt-3 space-y-3">{groupView.group.rules.slice(0, 3).map((rule, index) => <li key={rule} className="flex gap-3 text-xs leading-5 text-muted-foreground"><span className="font-semibold text-primary">0{index + 1}</span><span>{rule}</span></li>)}</ol>
            </section>
            {viewer.is_member && !viewer.is_moderator && applicationStatus !== "pending" && applicationStatus !== "approved" ? (
              <section className="border-t border-border pt-5"><p className="text-sm font-semibold">Help keep the space useful</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Apply to moderate. Members can vouch for candidates; Candid or a moderator confirms the selection.</p><Textarea value={applicationNote} onChange={(event) => setApplicationNote(event.target.value)} maxLength={1000} placeholder="Why would you be a fair moderator?" className="mt-3 min-h-20 text-xs" /><Button disabled={busy} onClick={() => void run(() => applyModerator({ data: { company_id: company.id, note: applicationNote } }), "Moderator application submitted")} variant="outline" className="mt-3 w-full rounded-full">Apply to moderate</Button></section>
            ) : applicationStatus === "pending" ? <p className="border-t border-border pt-4 text-xs leading-5 text-muted-foreground">You’re in the moderator candidate forum. Your application is under review.</p> : null}
            {viewer.is_moderator ? <Button asChild variant="outline" className="w-full rounded-full"><Link to="/moderator-forum"><Sparkles className="size-4" />Moderator forum</Link></Button> : null}
            <p className="flex items-start gap-2 text-[11px] leading-5 text-muted-foreground"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />Group moderators can manage membership and discussion. They cannot edit or remove independent workplace stories.</p>
          </aside>
        </div>

        {groupView.moderator_candidates.length && viewer.is_member ? (
          <section className="mt-10 border-t border-border pt-6"><div className="flex items-center gap-2"><Users className="size-4 text-primary" /><h2 className="text-sm font-semibold">Vouch for a moderator</h2></div><p className="mt-1 text-xs text-muted-foreground">The community’s endorsements are one factor in moderator selection.</p><div className="mt-3 flex gap-3 overflow-x-auto pb-2">{groupView.moderator_candidates.map((candidate) => <div key={candidate.user_id} className="min-w-64 border border-border p-4"><p className="text-sm font-medium">@{candidate.username}</p><p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{candidate.note || "Member candidate"}</p><div className="mt-3 flex items-center justify-between"><span className="text-xs text-muted-foreground">{candidate.endorsements} vouches</span><Button size="sm" variant={candidate.endorsed_by_viewer ? "outline" : "default"} disabled={candidate.endorsed_by_viewer || busy} onClick={() => void run(() => endorseModerator({ data: { company_id: company.id, candidate_id: candidate.user_id } }), "Your vouch was recorded")}>{candidate.endorsed_by_viewer ? "Vouched" : "Vouch"}</Button></div></div>)}</div></section>
        ) : null}
      </div>
    </main>
  );
}

function EmptyState({ icon: Icon, title, description }: { icon: typeof FileText; title: string; description: string }) {
  return <div className="border-y border-dashed border-border px-5 py-12 text-center sm:py-16"><Icon className="mx-auto size-8 text-muted-foreground/70" /><h3 className="mt-4 text-base font-semibold">{title}</h3><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">{description}</p></div>;
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Recently" : new Intl.DateTimeFormat("en-KE", { dateStyle: "medium" }).format(date);
}

