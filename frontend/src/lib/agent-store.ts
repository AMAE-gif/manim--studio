/** Agent workflow state management via useReducer. */

export interface AnimationRules {
  maxDuration: number | null;
  colorPalette: string;
  fontSize: number | null;
  transitions: string[];
  background: string;
  customRules: string;
}

export interface AgentStep {
  step: string;
  message: string;
  startedAt: number;
  endedAt?: number;
  passed?: boolean;
  error?: string;
}

export type AgentStatus =
  | "idle"
  | "analyzing"
  | "planning"
  | "generating"
  | "validating"
  | "rendering"
  | "correcting"
  | "complete"
  | "error";

export interface AgentState {
  status: AgentStatus;
  steps: AgentStep[];
  currentStep: string | null;
  code: string;
  videoUrl: string | null;
  jobId: string | null;
  error: string | null;
  styleAnalysis: string;
  rules: AnimationRules;
}

export type AgentAction =
  | { type: "STEP_START"; step: string; message: string }
  | { type: "STEP_END"; passed?: boolean; error?: string }
  | { type: "CODE_GENERATED"; code: string }
  | { type: "VALIDATION_RESULT"; passed: boolean; error?: string }
  | { type: "RENDER_RESULT"; passed: boolean; videoUrl?: string; error?: string }
  | { type: "COMPLETE"; code: string; videoUrl?: string; jobId: string }
  | { type: "ERROR"; message: string }
  | { type: "SET_STYLE"; analysis: string }
  | { type: "SET_RULES"; rules: Partial<AnimationRules> }
  | { type: "RESET" };

export const initialRules: AnimationRules = {
  maxDuration: null,
  colorPalette: "",
  fontSize: null,
  transitions: [],
  background: "",
  customRules: "",
};

export const initialState: AgentState = {
  status: "idle",
  steps: [],
  currentStep: null,
  code: "",
  videoUrl: null,
  jobId: null,
  error: null,
  styleAnalysis: "",
  rules: initialRules,
};

export function agentReducer(state: AgentState, action: AgentAction): AgentState {
  switch (action.type) {
    case "STEP_START":
      return {
        ...state,
        currentStep: action.step,
        status: action.step === "plan" ? "planning"
          : action.step === "generate" ? "generating"
          : action.step === "validate" ? "validating"
          : action.step === "render_test" ? "rendering"
          : action.step === "correct" ? "correcting"
          : state.status,
        steps: [
          ...state.steps,
          { step: action.step, message: action.message, startedAt: Date.now() },
        ],
      };

    case "STEP_END": {
      const steps = [...state.steps];
      const last = steps[steps.length - 1];
      if (last) {
        last.endedAt = Date.now();
        if (action.passed !== undefined) last.passed = action.passed;
        if (action.error) last.error = action.error;
      }
      return { ...state, steps };
    }

    case "CODE_GENERATED":
      return { ...state, code: action.code };

    case "VALIDATION_RESULT": {
      const steps = [...state.steps];
      const last = steps[steps.length - 1];
      if (last) {
        last.endedAt = Date.now();
        last.passed = action.passed;
        if (action.error) last.error = action.error;
      }
      return { ...state, steps, code: action.passed !== false ? state.code : state.code };
    }

    case "RENDER_RESULT": {
      const steps = [...state.steps];
      const last = steps[steps.length - 1];
      if (last) {
        last.endedAt = Date.now();
        last.passed = action.passed;
        if (action.error) last.error = action.error;
      }
      return {
        ...state,
        steps,
        videoUrl: action.videoUrl ?? state.videoUrl,
      };
    }

    case "COMPLETE":
      return {
        ...state,
        status: "complete",
        code: action.code,
        videoUrl: action.videoUrl ?? state.videoUrl,
        jobId: action.jobId,
        currentStep: null,
      };

    case "ERROR":
      return {
        ...state,
        status: "error",
        error: action.message,
        currentStep: null,
      };

    case "SET_STYLE":
      return { ...state, styleAnalysis: action.analysis };

    case "SET_RULES":
      return { ...state, rules: { ...state.rules, ...action.rules } };

    case "RESET":
      return initialState;

    default:
      return state;
  }
}
