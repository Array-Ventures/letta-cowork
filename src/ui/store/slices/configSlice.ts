import type { StateCreator } from "zustand";
import type { AppConfig, OrgInfo, IdentityInfo, ServerEvent } from "../../types";
import type { AppState } from "../useAppStore";

export type OnboardingData = {
  serverBaseUrl: string;
  serverApiKey: string;
  serverVersion: string;
  orgId: string;
  orgName: string;
  identityId: string;
  identityName: string;
  identityKey: string;
  daytonaApiKey: string;
  daytonaApiUrl: string;
};

export interface ConfigSlice {
  configStatus: "loading" | "unconfigured" | "configured";
  currentConfig: AppConfig | null;
  onboardingStep: number;
  onboardingData: OnboardingData;
  onboardingOrgs: OrgInfo[];
  onboardingIdentities: IdentityInfo[];
  onboardingTestResult: { type: string; success: boolean; version?: string; identityId?: string; error?: string } | null;
  setOnboardingStep: (step: number) => void;
  setOnboardingData: (data: Partial<OnboardingData>) => void;
}

export const defaultOnboardingData: OnboardingData = {
  serverBaseUrl: "https://api.letta.com",
  serverApiKey: "",
  serverVersion: "",
  orgId: "",
  orgName: "",
  identityId: "",
  identityName: "",
  identityKey: "",
  daytonaApiKey: "",
  daytonaApiUrl: "https://app.daytona.io/api",
};

export const createConfigSlice: StateCreator<AppState, [], [], ConfigSlice> = (set) => ({
  configStatus: "loading",
  currentConfig: null,
  onboardingStep: 0,
  onboardingData: { ...defaultOnboardingData },
  onboardingOrgs: [],
  onboardingIdentities: [],
  onboardingTestResult: null,
  setOnboardingStep: (step) => set({ onboardingStep: step, onboardingTestResult: null }),
  setOnboardingData: (data) => set((state) => ({ onboardingData: { ...state.onboardingData, ...data } })),
});

export function handleConfigEvent(event: ServerEvent, set: (partial: Partial<AppState> | ((state: AppState) => Partial<AppState>)) => void): boolean {
  switch (event.type) {
    case "config.status": {
      if (event.payload.configured) {
        set({ configStatus: "configured", currentConfig: event.payload.config ?? null });
      } else {
        set({ configStatus: "unconfigured", currentConfig: null, onboardingStep: 0, onboardingData: { ...defaultOnboardingData } });
      }
      return true;
    }
    case "config.testServer.result": {
      set({ onboardingTestResult: { type: "server", ...event.payload } });
      return true;
    }
    case "config.listOrgs.result": {
      if (event.payload.success && event.payload.orgs) {
        set({ onboardingOrgs: event.payload.orgs });
      }
      return true;
    }
    case "config.listIdentities.result": {
      if (event.payload.success && event.payload.identities) {
        set({ onboardingIdentities: event.payload.identities });
      }
      return true;
    }
    case "config.testDaytona.result": {
      set({ onboardingTestResult: { type: "daytona", ...event.payload } });
      return true;
    }
    case "config.createIdentity.result": {
      set({ onboardingTestResult: { type: "identity", ...event.payload } });
      return true;
    }
    case "config.saved": {
      if (event.payload.success) {
        set({ configStatus: "configured" });
      }
      return true;
    }
    case "config.reset.result": {
      set({ configStatus: "unconfigured", onboardingStep: 0, onboardingData: { ...defaultOnboardingData } });
      return true;
    }
    default:
      return false;
  }
}
