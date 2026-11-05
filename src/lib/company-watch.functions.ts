import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  requireFirebaseAuth,
  requireVerifiedFirebaseAuth,
} from "@/integrations/firebase/auth-middleware";
import { getCompanyView } from "./firebase-data.server";
import { getCompanyWatch, listCompanyWatches, setCompanyWatch } from "./company-watch.server";

export const getMyCompanyWatches = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .handler(async ({ context }) => listCompanyWatches(context.userId));

export const getCompanyWatchStatus = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ company_id: z.string().min(1).max(180) }).parse(input),
  )
  .handler(async ({ context, data }) => getCompanyWatch(context.userId, data.company_id));

export const updateCompanyWatch = createServerFn({ method: "POST" })
  .middleware([requireVerifiedFirebaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        company_id: z.string().min(1).max(180),
        company_slug: z.string().min(1).max(180).optional(),
        watching: z.boolean(),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    if (!data.watching) {
      return setCompanyWatch({
        userId: context.userId,
        companyId: data.company_id,
        companyName: "",
        companySlug: "",
        watching: false,
      });
    }
    if (!data.company_slug) throw new Error("This company is not available to watch.");
    const companyView = await getCompanyView(data.company_slug);
    if (!companyView || companyView.company.id !== data.company_id) {
      throw new Error("This company is not available to watch.");
    }
    return setCompanyWatch({
      userId: context.userId,
      companyId: companyView.company.id,
      companyName: companyView.company.name,
      companySlug: companyView.company.slug,
      watching: data.watching,
    });
  });
