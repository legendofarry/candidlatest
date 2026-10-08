type StoryDraftInputs = {
  company: string;
  industry: string;
  county: string;
  reasons: string[];
  position: string;
  tenure: string;
  roleLevel: string;
  wouldReturn: boolean | null;
};

function clean(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function sentenceCase(value: string) {
  const text = clean(value);
  return text ? text[0]!.toLocaleUpperCase() + text.slice(1) : text;
}

function joinReasons(reasons: string[]) {
  const items = reasons.map(sentenceCase).filter(Boolean);
  if (items.length < 2) return items[0] ?? "the reason I selected";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
}

/** Builds a factual story starter locally from the member's earlier form answers. */
export function buildStoryDraft(input: StoryDraftInputs) {
  const company = clean(input.company) || "this workplace";
  const reasons = input.reasons.length ? input.reasons : ["my selected reasons"];
  const reasonText = joinReasons(reasons);
  const headline = `Leaving ${company}: ${sentenceCase(reasons[0] ?? "My experience")}`.slice(0, 120);

  const role = clean(input.position);
  const duration = clean(input.tenure);
  const county = clean(input.county);
  const industry = clean(input.industry);
  const roleDescription = role
    ? ` as ${role}`
    : input.roleLevel
      ? ` in a ${input.roleLevel.toLowerCase()} role`
      : "";
  const workplaceDetails = [county, industry].filter(Boolean).join(", ");
  const location = workplaceDetails ? ` (${workplaceDetails})` : "";
  const time = duration ? ` for ${duration}` : "";
  const reasonsSentence = `The reason${reasons.length === 1 ? "" : "s"} I selected for leaving ${company} ${reasons.length === 1 ? "was" : "were"} ${reasonText}.`;
  const returnSentence =
    input.wouldReturn === null
      ? ""
      : input.wouldReturn
        ? "I would consider working there again."
        : "I would not choose to work there again.";

  const body = [
    `I worked${roleDescription} at ${company}${location}${time}.`,
    reasonsSentence,
    returnSentence,
    "That is why I decided to leave. This summary sticks to the details I selected in the earlier steps.",
  ]
    .filter(Boolean)
    .join(" ");

  return { title: headline, body };
}
