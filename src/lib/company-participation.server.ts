import { createHash } from "node:crypto";
import { getFirestoreDb } from "./firebase.server";
import { assessWorkExperienceComments } from "./ai.server";

const ASSESSMENT_VERSION = 1;

function bodyHash(body: string) {
  return createHash("sha256").update(body).digest("hex");
}

export async function getUserParticipatingCompanyIds(
  userId: string,
  onlyCompanyId?: string,
): Promise<string[]> {
  const db = getFirestoreDb();
  const [stories, comments] = await Promise.all([
    db.collection("stories").where("author_id", "==", userId).get(),
    db.collection("comments").where("author_id", "==", userId).get(),
  ]);
  const companyIds = new Set<string>();

  // A published workplace story is an explicit contribution under its company.
  for (const doc of stories.docs) {
    const story = doc.data();
    if (
      (story["status"] === "published" || story["status"] === "pending") &&
      story["post_type"] !== "announcement" &&
      typeof story["company_id"] === "string" &&
      (!onlyCompanyId || story["company_id"] === onlyCompanyId)
    ) {
      companyIds.add(story["company_id"]);
    }
  }
  if (onlyCompanyId && companyIds.has(onlyCompanyId)) return [onlyCompanyId];

  const eligibleComments = comments.docs.filter(
    (doc) => doc.get("status") === "published" && doc.get("is_deleted") !== true,
  );
  const storyIds = [
    ...new Set(
      eligibleComments
        .map((doc) => doc.get("story_id"))
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  ];
  const storyDocs = await Promise.all(storyIds.map((id) => db.collection("stories").doc(id).get()));
  const storyById = new Map(storyDocs.map((doc) => [doc.id, doc]));
  const candidates = eligibleComments.flatMap((doc) => {
    const storyId = doc.get("story_id");
    const story = typeof storyId === "string" ? storyById.get(storyId) : undefined;
    const companyId = story?.get("company_id");
    if (
      !story?.exists ||
      story.get("status") !== "published" ||
      story.get("post_type") === "announcement" ||
      typeof companyId !== "string" ||
      (onlyCompanyId !== undefined && companyId !== onlyCompanyId)
    ) {
      return [];
    }
    const body = typeof doc.get("body") === "string" ? doc.get("body") : "";
    if (!body.trim()) return [];
    return [{ doc, body, companyId, hash: bodyHash(body) }];
  });

  const needsAssessment = candidates.filter(({ doc, companyId, hash }) => {
    const assessment = doc.get("company_participation_assessment") as
      | { company_id?: unknown; body_hash?: unknown; version?: unknown; qualifies?: unknown }
      | undefined;
    return !(
      assessment?.company_id === companyId &&
      assessment.body_hash === hash &&
      assessment.version === ASSESSMENT_VERSION &&
      typeof assessment.qualifies === "boolean"
    );
  });
  const assessed = await assessWorkExperienceComments(
    needsAssessment.map(({ doc, body }) => ({ id: doc.id, body })),
  );
  const assessmentWrites: Promise<unknown>[] = [];
  for (const candidate of needsAssessment) {
    const qualifies = assessed.get(candidate.doc.id);
    // If the AI service is unavailable or uncertain, do not grant eligibility.
    if (qualifies === undefined) continue;
    assessmentWrites.push(
      candidate.doc.ref.update({
        company_participation_assessment: {
          company_id: candidate.companyId,
          body_hash: candidate.hash,
          version: ASSESSMENT_VERSION,
          qualifies,
          assessed_at: new Date().toISOString(),
        },
      }),
    );
    if (qualifies) companyIds.add(candidate.companyId);
  }
  await Promise.allSettled(assessmentWrites);

  for (const { doc, companyId } of candidates) {
    const assessment = doc.get("company_participation_assessment") as
      | { company_id?: unknown; body_hash?: unknown; version?: unknown; qualifies?: unknown }
      | undefined;
    const isFresh =
      assessment?.company_id === companyId &&
      assessment.body_hash === bodyHash(String(doc.get("body") ?? "")) &&
      assessment.version === ASSESSMENT_VERSION;
    if (isFresh && assessment.qualifies === true) companyIds.add(companyId);
  }

  return [...companyIds];
}

export async function userParticipatedWithCompany(userId: string, companyId: string) {
  const participatingCompanyIds = await getUserParticipatingCompanyIds(userId, companyId);
  return participatingCompanyIds.includes(companyId);
}
