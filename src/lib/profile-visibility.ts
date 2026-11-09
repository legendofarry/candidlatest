export function canViewerSeeProfileContributions(
  profileVisibility: string | null | undefined,
  ownerId: string | null | undefined,
  viewerId: string | null | undefined,
) {
  return profileVisibility !== "private" || Boolean(ownerId && viewerId === ownerId);
}
