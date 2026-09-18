export { getMonetizationFlags, isMoneyEngineEnabled } from "@/lib/monetization/flags";
export { getMonetizationRecommendation } from "@/lib/monetization/decision-engine";
export { calculateMoneyScore } from "@/lib/monetization/money-score";
export { logMonetizationEvent } from "@/lib/monetization/observability";
export {
  opportunityToMonetizationInput,
  recommendFromOpportunity,
  stashOpportunityMoneySeed,
  takeOpportunityMoneySeed,
} from "@/lib/monetization/from-opportunity";
export { runAutopilotOnOpportunities } from "@/lib/monetization/autopilot";
export type {
  AutopilotAction,
  AutopilotCycleResult,
  AutopilotMode,
} from "@/lib/monetization/autopilot";
export type * from "@/lib/monetization/types";
