import type { StateCreator } from "zustand";
import type { AgentInfo, ModelInfo, ServerEvent } from "../../types";
import type { AppState } from "../useAppStore";

export interface AgentSlice {
  agents: AgentInfo[];
  selectedAgentId: string | null;
  agentsLoaded: boolean;
  models: ModelInfo[];

  setAgents: (agents: AgentInfo[]) => void;
  setSelectedAgent: (agentId: string | null) => void;
}

export const createAgentSlice: StateCreator<AppState, [], [], AgentSlice> = (set) => ({
  agents: [],
  selectedAgentId: null,
  agentsLoaded: false,
  models: [],

  setAgents: (agents) => set({ agents }),
  setSelectedAgent: (selectedAgentId) => set({ selectedAgentId }),
});

export function handleAgentEvent(event: ServerEvent, set: (partial: Partial<AppState> | ((state: AppState) => Partial<AppState>)) => void): boolean {
  switch (event.type) {
    case "agent.list": {
      set({ agents: event.payload.agents, agentsLoaded: true });
      return true;
    }

    case "agent.created": {
      set((state) => ({
        agents: [...state.agents, event.payload],
        selectedAgentId: event.payload.lettaAgentId,
      }));
      return true;
    }

    case "agent.deleted": {
      const { lettaAgentId } = event.payload;
      set((state) => ({
        agents: state.agents.filter((a) => a.lettaAgentId !== lettaAgentId),
        selectedAgentId: state.selectedAgentId === lettaAgentId ? null : state.selectedAgentId,
      }));
      return true;
    }

    case "agent.renamed": {
      const { lettaAgentId, name } = event.payload;
      set((state) => ({
        agents: state.agents.map((a) =>
          a.lettaAgentId === lettaAgentId ? { ...a, name } : a
        ),
      }));
      return true;
    }

    case "models.list": {
      set({ models: event.payload.models });
      return true;
    }

    default:
      return false;
  }
}
