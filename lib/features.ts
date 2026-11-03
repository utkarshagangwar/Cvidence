// What the home page may claim as live. Flip `live` when a phase ships,
// so marketing never promises a feature that isn't in the app yet.

export type FeatureKey = "tailor" | "jobs" | "tracker" | "letters" | "agent" | "privacy";

export const FEATURES: Record<FeatureKey, { live: boolean }> = {
  tailor: { live: true },
  jobs: { live: true },
  tracker: { live: true },
  letters: { live: true },
  agent: { live: true },
  privacy: { live: true },
};
