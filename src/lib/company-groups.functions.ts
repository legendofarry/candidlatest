import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  requireFirebaseAuth,
  requireVerifiedFirebaseAuth,
  optionalFirebaseAuth,
} from "@/integrations/firebase/auth-middleware";
import {
  applyToModerateCompanyGroup,
  appointExecutiveModerator,
  createCompanyGroupPost,
  createModeratorForumPost,
  decideCompanyGroupJoin,
  decideCompanyModeratorApplication,
  decideCompanyTagCorrection,
  endorseCompanyModerator,
  getCompanyGroupView,
  getModeratorCouncilMessages,
  getMyCompanyAccountApplication,
  leaveCompanyGroup,
  listCompanyAccountApplications,
  listExecutiveModeratorCandidates,
  listCompanyGroupModerationQueue,
  listCompanyTagCorrections,
  listModeratorForumPosts,
  moderateCompanyGroupPost,
  readMyCompanyWorkHistory,
  recordCompanyCommunityActivity,
  removeCompanyGroupMember,
  requestCompanyGroupJoin,
  reviewCompanyAccountApplication,
  saveMyCompanyWorkHistory,
  sendModeratorCouncilMessage,
  submitCompanyAccountApplication,
  suggestCompanyTagCorrection,
  updateCompanyGroupRules,
} from "./company-groups.server";

const CompanyId = z.string().trim().min(1).max(120);

export const recordCompanyCommunityActivityAction = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .handler(({ context }) => recordCompanyCommunityActivity(context.userId));

export const getCompanyGroup = createServerFn({ method: "GET" })
  .middleware([optionalFirebaseAuth])
  .inputValidator((input: unknown) => z.object({ company_id: CompanyId }).parse(input))
  .handler(({ data, context }) => getCompanyGroupView(data.company_id, context.userId));

export const getMyCompanyWorkHistory = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .handler(({ context }) => readMyCompanyWorkHistory(context.userId));

export const saveMyCompanyWorkHistoryAction = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      company_ids: z.array(CompanyId).max(20).default([]),
      join_group_ids: z.array(CompanyId).max(20).default([]),
    }).parse(input),
  )
  .handler(({ data, context }) =>
    saveMyCompanyWorkHistory(context.userId, data.company_ids, data.join_group_ids),
  );

export const requestCompanyGroupJoinAction = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((input: unknown) => z.object({ company_id: CompanyId }).parse(input))
  .handler(({ data, context }) => requestCompanyGroupJoin(data.company_id, context.userId));

export const leaveCompanyGroupAction = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((input: unknown) => z.object({ company_id: CompanyId }).parse(input))
  .handler(({ data, context }) => leaveCompanyGroup(data.company_id, context.userId));

export const decideCompanyGroupJoinAction = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ company_id: CompanyId, user_id: z.string().min(1).max(160), decision: z.enum(["approve", "decline"]) }).parse(input),
  )
  .handler(({ data, context }) => decideCompanyGroupJoin(data.company_id, data.user_id, context.userId, data.decision));

export const createCompanyGroupPostAction = createServerFn({ method: "POST" })
  .middleware([requireVerifiedFirebaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ company_id: CompanyId, body: z.string().trim().min(12).max(3000), anonymous: z.boolean().default(false) }).parse(input),
  )
  .handler(({ data, context }) => createCompanyGroupPost({ companyId: data.company_id, userId: context.userId, body: data.body, anonymous: data.anonymous }));

export const moderateCompanyGroupPostAction = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ company_id: CompanyId, post_id: z.string().uuid(), reason: z.string().trim().min(5).max(500) }).parse(input),
  )
  .handler(({ data, context }) => moderateCompanyGroupPost({ companyId: data.company_id, postId: data.post_id, actorId: context.userId, reason: data.reason }));

export const removeCompanyGroupMemberAction = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ company_id: CompanyId, user_id: z.string().min(1).max(160), reason: z.string().trim().min(5).max(500) }).parse(input),
  )
  .handler(({ data, context }) => removeCompanyGroupMember({ companyId: data.company_id, targetUserId: data.user_id, actorId: context.userId, reason: data.reason }));

export const updateCompanyGroupRulesAction = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ company_id: CompanyId, rules: z.array(z.string().trim().min(1).max(240)).min(1).max(10) }).parse(input),
  )
  .handler(({ data, context }) => updateCompanyGroupRules(data.company_id, context.userId, data.rules));

export const applyCompanyGroupModeratorAction = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ company_id: CompanyId, note: z.string().trim().max(1000).default("") }).parse(input),
  )
  .handler(({ data, context }) => applyToModerateCompanyGroup(data.company_id, context.userId, data.note));

export const endorseCompanyGroupModeratorAction = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((input: unknown) => z.object({ company_id: CompanyId, candidate_id: z.string().min(1).max(160) }).parse(input))
  .handler(({ data, context }) => endorseCompanyModerator(data.company_id, data.candidate_id, context.userId));

export const getCompanyGroupModerationQueue = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((input: unknown) => z.object({ company_id: CompanyId }).parse(input))
  .handler(({ data, context }) => listCompanyGroupModerationQueue(data.company_id, context.userId));

export const decideCompanyGroupModeratorAction = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ company_id: CompanyId, candidate_id: z.string().min(1).max(160), decision: z.enum(["approve", "decline"]) }).parse(input),
  )
  .handler(({ data, context }) => decideCompanyModeratorApplication({ companyId: data.company_id, candidateId: data.candidate_id, actorId: context.userId, decision: data.decision }));

export const suggestCompanyTagCorrectionAction = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ story_id: z.string().uuid(), from_company_id: CompanyId, to_company_id: CompanyId, reason: z.string().trim().min(5).max(700) }).parse(input),
  )
  .handler(({ data, context }) => suggestCompanyTagCorrection({ storyId: data.story_id, fromCompanyId: data.from_company_id, toCompanyId: data.to_company_id, actorId: context.userId, reason: data.reason }));

export const getCompanyTagCorrections = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((input: unknown) => z.object({ company_id: CompanyId }).parse(input))
  .handler(({ data, context }) => listCompanyTagCorrections(data.company_id, context.userId));

export const decideCompanyTagCorrectionAction = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((input: unknown) => z.object({ correction_id: z.string().uuid(), decision: z.enum(["approve", "decline"]) }).parse(input))
  .handler(({ data, context }) => decideCompanyTagCorrection({ correctionId: data.correction_id, actorId: context.userId, decision: data.decision }));

export const getModeratorForum = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .handler(({ context }) => listModeratorForumPosts(context.userId));

export const createModeratorForumPostAction = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((input: unknown) => z.object({ body: z.string().trim().min(3).max(3000) }).parse(input))
  .handler(({ data, context }) => createModeratorForumPost(context.userId, data.body));

export const getModeratorCouncilChannel = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .handler(({ context }) => getModeratorCouncilMessages(context.userId));

export const sendModeratorCouncilMessageAction = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((input: unknown) => z.object({ body: z.string().trim().min(2).max(4000), action_type: z.enum(["report", "policy", "safety", "question", "update"]) }).parse(input))
  .handler(({ data, context }) => sendModeratorCouncilMessage({ userId: context.userId, body: data.body, actionType: data.action_type }));

export const appointExecutiveModeratorAction = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((input: unknown) => z.object({ user_id: z.string().min(1).max(160).nullable() }).parse(input))
  .handler(({ data, context }) => appointExecutiveModerator(context.userId, data.user_id));

export const getExecutiveModeratorCandidates = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .handler(({ context }) => listExecutiveModeratorCandidates(context.userId));

export const getMyCompanyAccountApplicationAction = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .handler(({ context }) => getMyCompanyAccountApplication(context.userId));

export const submitCompanyAccountApplicationAction = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((input: unknown) => z.object({
    company_id: CompanyId,
    role_title: z.string().trim().min(2).max(120),
    website: z.string().url().max(500),
    registration_number: z.string().max(80).default(""),
  }).parse(input))
  .handler(({ data, context }) => {
    const email = String(context.claims.email ?? "");
    return submitCompanyAccountApplication({
      userId: context.userId,
      companyId: data.company_id,
      roleTitle: data.role_title,
      website: data.website,
      registrationNumber: data.registration_number,
      emailDomain: email.includes("@") ? email.split("@").at(-1)?.toLowerCase() ?? null : null,
    });
  });

export const listCompanyAccountApplicationsAction = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .handler(({ context }) => listCompanyAccountApplications(context.userId));

export const reviewCompanyAccountApplicationAction = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((input: unknown) => z.object({ application_id: z.string().min(1).max(180), decision: z.enum(["approve", "decline"]), note: z.string().max(1000).default("") }).parse(input))
  .handler(({ data, context }) => reviewCompanyAccountApplication({ actorId: context.userId, applicationId: data.application_id, decision: data.decision, note: data.note }));

