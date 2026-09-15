import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { readSiteContact, writeSiteContact } from "@/lib/site.server";
import { getAdmin, json, verifyOwnerKey } from "@/lib/owner-api.server";

const ContactInput = z.object({
  email: z.string().max(160).nullable().optional(),
  phone: z.string().max(60).nullable().optional(),
  whatsapp: z.string().max(60).nullable().optional(),
  x: z.string().max(160).nullable().optional(),
  instagram: z.string().max(160).nullable().optional(),
  note: z.string().max(600).nullable().optional(),
});

export const Route = createFileRoute("/api/public/owner/contact")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const denied = verifyOwnerKey(request);
        if (denied) return denied;
        await getAdmin();
        return json(await readSiteContact());
      },
      POST: async ({ request }) => {
        const denied = verifyOwnerKey(request);
        if (denied) return denied;
        await getAdmin();
        const parsed = ContactInput.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return json({ error: "Invalid contact payload" }, 400);
        const patch = Object.fromEntries(
          Object.entries(parsed.data).filter(([, value]) => value !== undefined),
        );
        return json(await writeSiteContact(patch));
      },
    },
  },
});
