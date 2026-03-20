export const PLAN_LIMITS: Record<string, number> = {
  free: 3,
  Starter: 10,
  Growth: 50,
  Pro: 100,
};

export const PLAN_NAMES: Record<string, string> = {
  free: "Free",
  Starter: "Starter",
  Growth: "Growth",
  Pro: "Pro",
};

export function getPlanLimit(plan: string): number {
  return PLAN_LIMITS[plan] ?? 3;
}
