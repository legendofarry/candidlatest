import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  optionalFirebaseAuth,
  requireFirebaseAuth,
} from "@/integrations/firebase/auth-middleware";
import {
  readLensStories,
  readMyNearMe,
  readNearMeFeed,
  readNearbyPeople,
  writeMyNearMe,
} from "./near-me.server";

const positionSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  radiusKm: z.number().min(1).max(100).default(10),
});

/** Stories and employers around a position. Open to signed-out visitors, like the main feed. */
export const getNearMeFeed = createServerFn({ method: "POST" })
  .middleware([optionalFirebaseAuth])
  .inputValidator((input: unknown) => positionSchema.parse(input))
  .handler(async ({ context, data }) =>
    readNearMeFeed({ ...data, viewerId: context.userId }),
  );

/** "Following" and "Saved" chips on the feed. */
export const getLensStories = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ lens: z.enum(["following", "saved"]) }).parse(input),
  )
  .handler(async ({ context, data }) => ({
    stories: await readLensStories(context.userId, data.lens),
  }));

export const getMyNearMe = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .handler(async ({ context }) => readMyNearMe(context.userId));

/** Turn "people nearby" on or off. Turning it on stores only a coarse area, never exact coordinates. */
export const setMyNearMePeople = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        enabled: z.boolean(),
        lat: z.number().min(-90).max(90).optional(),
        lng: z.number().min(-180).max(180).optional(),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => writeMyNearMe(context.userId, data));

export const getNearbyPeople = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((input: unknown) => positionSchema.parse(input))
  .handler(async ({ context, data }) => readNearbyPeople(context.userId, data));
