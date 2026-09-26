/** Actor id used for automated actions (scheduler, AI, CLI). It is not a user id. */
export const SYSTEM_ACTOR_ID = 'system';

/** Audit/activity actorId references users; automated actions are recorded without one. */
export function toActorUserId(actorId: string | undefined): string | undefined {
  return actorId === SYSTEM_ACTOR_ID ? undefined : actorId;
}
