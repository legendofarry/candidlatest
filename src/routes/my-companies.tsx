import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Building2, Check, LockKeyhole, Search, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { listCompanyScores } from "@/lib/public.functions";
import { getMyCompanyWorkHistory, leaveCompanyGroupAction, requestCompanyGroupJoinAction, saveMyCompanyWorkHistoryAction } from "@/lib/company-groups.functions";
import { notify as toast } from "@/lib/notifications-store";

export const Route = createFileRoute("/my-companies")({
  head: () => ({ meta: [{ title: "My companies | Candid" }] }),
  component: MyCompaniesPage,
});

function MyCompaniesPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const client = useQueryClient();
  const getHistory = useServerFn(getMyCompanyWorkHistory);
  const saveHistory = useServerFn(saveMyCompanyWorkHistoryAction);
  const joinGroup = useServerFn(requestCompanyGroupJoinAction);
  const leaveGroup = useServerFn(leaveCompanyGroupAction);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[] | null>(null);
  const [saving, setSaving] = useState(false);
  const history = useQuery({ queryKey: ["my-company-work-history", user?.uid ?? null], queryFn: () => getHistory(), enabled: Boolean(user) });
  const directory = useQuery({ queryKey: ["company-scores"], queryFn: () => listCompanyScores(), staleTime: 60_000 });
  const selectedIds = useMemo(() => selected ?? history.data?.map((item) => item.company_id) ?? [], [selected, history.data]);
  const options = (directory.data?.companies ?? []).filter((company) => company.company_id && company.name && company.slug && company.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())).slice(0, 30);

  if (loading || (user && history.isLoading)) return <div className="flex min-h-[50dvh] items-center justify-center text-sm text-muted-foreground">Loading your companies…</div>;
  if (!user) return <main className="mx-auto max-w-xl px-5 py-16"><p className="text-sm text-muted-foreground">Sign in to manage your work history.</p><Button asChild className="mt-4 rounded-full"><Link to="/auth">Sign in</Link></Button></main>;

  async function save() {
    setSaving(true);
    try {
      await saveHistory({ data: { company_ids: selectedIds, join_group_ids: [] } });
      await client.invalidateQueries({ queryKey: ["my-company-work-history"] });
      setSelected(null);
      toast.success("Your company list is updated", { description: "Your work history stays private." });
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not save your companies."); }
    finally { setSaving(false); }
  }

  async function groupAction(companyId: string, active: boolean) {
    try {
      if (active) await leaveGroup({ data: { company_id: companyId } });
      else await joinGroup({ data: { company_id: companyId } });
      await client.invalidateQueries({ queryKey: ["my-company-work-history"] });
      await client.invalidateQueries({ queryKey: ["company-group"] });
      toast.success(active ? "You left the company group" : "Join request sent");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not update group membership."); }
  }

  return <main className="min-h-[calc(100dvh-5rem)] bg-background text-foreground">
    <div className="mx-auto w-full max-w-5xl px-4 pb-14 pt-5 sm:px-7 lg:px-10 lg:pt-10">
      <Button asChild variant="ghost" className="-ml-3 rounded-full text-muted-foreground"><Link to="/profile"><ArrowLeft className="size-4" />Profile</Link></Button>
      <header className="mt-5 border-b border-border pb-7 sm:mt-8 sm:pb-9"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Your work history</p><h1 className="mt-2 font-display text-3xl font-semibold tracking-tight sm:text-4xl">My companies</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">Keep the employers you’ve worked for in one private list. Joining a company group is a separate choice, and group membership is visible only to its members.</p></header>
      <div className="mt-7 grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,.8fr)]">
        <section>
          <div className="flex items-center justify-between gap-3"><h2 className="text-base font-semibold">Companies you’ve selected</h2><span className="text-xs text-muted-foreground">Private to you</span></div>
          {history.data?.length ? <div className="mt-3 divide-y divide-border border-y border-border">{history.data.map((company) => <div key={company.company_id} className="flex min-h-16 items-center gap-3 py-3"><span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground"><Building2 className="size-4" /></span><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{company.name}</p><p className="truncate text-xs text-muted-foreground">{company.industry ?? "Company"}</p></div><Link to="/companies/$slug" params={{ slug: company.slug }} className="hidden min-h-10 items-center px-2 text-xs text-primary hover:underline sm:inline-flex">Company page</Link><Button size="sm" variant="outline" className="shrink-0 rounded-full" disabled={!company.group_member && company.group_request_status === "pending"} onClick={() => void groupAction(company.company_id, company.group_member)}><Users className="size-3.5" />{company.group_member ? "Joined" : company.group_request_status === "pending" ? "Request sent" : "Request to join"}</Button></div>)}</div> : <p className="mt-3 border-y border-border py-6 text-sm text-muted-foreground">Your list is empty. Search for a company to add it.</p>}
          <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground"><LockKeyhole className="size-3.5" />Employers and other members can’t see this list.</p>
          <div className="mt-9"><h2 className="text-base font-semibold">Add a company</h2><label className="relative mt-3 block"><Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search company directory" className="h-12 rounded-full pl-11" /></label><div className="mt-2 max-h-72 divide-y divide-border overflow-y-auto border-y border-border">{options.map((company) => { const id = company.company_id!; const isSelected = selectedIds.includes(id); return <button key={id} type="button" aria-pressed={isSelected} onClick={() => setSelected((current) => { const baseline = current ?? (history.data ?? []).map((item) => item.company_id); return baseline.includes(id) ? baseline.filter((item) => item !== id) : baseline.length < 20 ? [...baseline, id] : baseline; })} className="flex min-h-14 w-full items-center gap-3 px-2 text-left hover:bg-secondary/40"><Building2 className="size-4 shrink-0 text-muted-foreground" /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{company.name}</span><span className="block truncate text-xs text-muted-foreground">{company.industry ?? "Company"}</span></span>{isSelected ? <Check className="size-4 text-primary" /> : null}</button>; })}{!options.length ? <p className="py-5 text-center text-sm text-muted-foreground">No companies match that search.</p> : null}</div><p className="mt-2 text-xs text-muted-foreground">Up to 20 companies. Categories are taken from the company directory.</p><p className="mt-4 border-y border-border py-4 text-xs leading-5 text-muted-foreground">Saving a newly selected company automatically adds you to its group. Group members can see that membership, but your work-history list stays private. For groups you had already linked, use Request to join above.</p><Button onClick={() => void save()} disabled={saving} className="mt-5 h-11 w-full rounded-full sm:w-auto sm:px-7">{saving ? "Saving…" : "Save private work history"}<ArrowRight className="size-4" /></Button></div>
        </section>
        <aside className="border-t border-border pt-6 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">How it works</p><ol className="mt-4 space-y-5">{[["Your history is yours", "The list is private and can be changed at any time."], ["New links join the group", "Newly selected companies add you to their group. You can leave at any time."], ["Join groups you skipped", "Request to join from the company community page or the company row above." ]].map(([title, detail], index) => <li key={title} className="flex gap-3"><span className="text-xs font-semibold text-primary">0{index + 1}</span><div><p className="text-sm font-medium">{title}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</p></div></li>)}</ol><Button asChild variant="outline" className="mt-6 rounded-full"><Link to="/companies">Explore companies <ArrowRight className="size-4" /></Link></Button></aside>
      </div>
    </div>
  </main>;
}
