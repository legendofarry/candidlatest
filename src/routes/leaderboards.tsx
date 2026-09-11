import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { Flame, Star, Undo2 } from "lucide-react";
import { getLeaderboards } from "@/lib/public.functions";

const boardsQuery = queryOptions({
  queryKey: ["leaderboards"],
  queryFn: () => getLeaderboards(),
});

export const Route = createFileRoute("/leaderboards")({
  loader: ({ context }) => context.queryClient.ensureQueryData(boardsQuery),
  head: () => ({
    meta: [
      { title: "Kenya employer leaderboards — most reported & best rated | Candid" },
      {
        name: "description",
        content:
          "Live leaderboards of Kenyan employers: most reported workplaces, best rated for pay and respect, and the companies people would actually work for again.",
      },
      { property: "og:title", content: "Kenya employer leaderboards | Candid" },
      {
        property: "og:description",
        content:
          "Most reported, best rated, and would-work-again rankings from anonymous Kenyan workers.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LeaderboardsPage,
});

type Row = {
  company_id: string | null;
  slug: string | null;
  name: string | null;
  story_count: number | null;
  overall: number | null;
  rating_count: number | null;
  would_work_again_pct: number | null;
};

function Board({
  title,
  blurb,
  icon,
  rows,
  value,
}: {
  title: string;
  blurb: string;
  icon: React.ReactNode;
  rows: Row[];
  value: (row: Row) => string;
}) {
  return (
    <section className="glass-card animate-rise rounded-2xl border border-border p-5">
      <div className="flex items-center gap-2">
        <span className="text-primary">{icon}</span>
        <h2 className="font-display text-lg font-semibold">{title}</h2>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{blurb}</p>
      <ol className="mt-4 space-y-1">
        {rows.length === 0 ? (
          <li className="py-6 text-sm text-muted-foreground">Not enough data yet.</li>
        ) : (
          rows.map((row, index) => (
            <li key={row.company_id ?? index}>
              <Link
                to="/companies/$slug"
                params={{ slug: row.slug ?? "" }}
                className="flex items-center gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-secondary"
              >
                <span className="w-6 text-sm font-semibold text-muted-foreground">{index + 1}</span>
                <span className="flex-1 truncate text-sm font-medium">{row.name}</span>
                <span className="text-sm font-semibold text-primary">{value(row)}</span>
              </Link>
            </li>
          ))
        )}
      </ol>
    </section>
  );
}

function LeaderboardsPage() {
  const { data } = useSuspenseQuery(boardsQuery);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-semibold md:text-4xl">Leaderboards</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Rankings built from anonymous exit stories and culture ratings by Kenyan workers. Scores
          move as new reports come in.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-3 xl:gap-5">
        <Board
          title="Most reported"
          blurb="Employers with the highest number of published exit stories."
          icon={<Flame className="size-5" />}
          rows={data.mostReported as Row[]}
          value={(row) => `${Number(row.story_count ?? 0)} stories`}
        />
        <Board
          title="Best rated"
          blurb="Highest overall culture score across pay, compliance, respect, workload and growth."
          icon={<Star className="size-5" />}
          rows={data.bestRated as Row[]}
          value={(row) => `${Number(row.overall ?? 0).toFixed(1)}/5`}
        />
        <Board
          title="Would work again"
          blurb="Share of raters who said they would return to this employer."
          icon={<Undo2 className="size-5" />}
          rows={data.wouldReturn as Row[]}
          value={(row) => `${Math.round(Number(row.would_work_again_pct ?? 0))}%`}
        />
      </div>

      <p className="text-xs text-muted-foreground">
        Rankings reflect the opinions of contributors, not verified fact. Employers are welcome to
        reply.
      </p>
    </div>
  );
}
