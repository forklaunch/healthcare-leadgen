export const IdeaStatusEnum = {
  SUBMITTED: 'submitted',
  UNDER_REVIEW: 'under_review',
  ACCEPTED: 'accepted',
  DECLINED: 'declined'
} as const;
export type IdeaStatusEnum = (typeof IdeaStatusEnum)[keyof typeof IdeaStatusEnum];
