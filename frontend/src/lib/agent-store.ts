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
  | "extracting"
  | "solving"
  | "refining"
  | "complete"
  | "error";

export interface AgentPlan {
  title: string;
  summary: string;
  shots: Array<{
    id: number;
    name: string;
    duration: number;
    description: string;
    visual: string;
    animation: string;
    narration?: string;
  }>;
  totalDuration: number;
  raw: string;
}

export interface AgentState {
  status: AgentStatus;
  steps: AgentStep[];
  currentStep: string | null;
  code: string;
  videoUrl: string | null;
  jobId: string | null;
  error: string | null;
  styleAnalysis: string;
  plan: AgentPlan | null;
  rules: AnimationRules;
  // Teacher mode
  problemText: string;
  problemType: string;
  expressions: string[];
  solutionSteps: SolutionStep[];
  solutionSummary: string;
  sessionId: string | null;
  refinementHistory: Array<{ instruction: string; stepIndex: number | null; timestamp: number }>;
  imageBase64: string | null;
  // Validation
  validationPassed: boolean;
  validationError: string | null;
}

export interface SolutionStep {
  index: number;
  title: string;
  description: string;
  math_expression: string | null;
  visual_description: string | null;
  animation_hint: string | null;
}

export type AgentAction =
  | { type: "STEP_START"; step: string; message: string }
  | { type: "STEP_END"; passed?: boolean; error?: string }
  | { type: "PLAN_READY"; plan: AgentPlan }
  | { type: "CODE_GENERATED"; code: string }
  | { type: "VALIDATION_RESULT"; passed: boolean; error?: string }
  | { type: "RENDER_RESULT"; passed: boolean; videoUrl?: string; error?: string }
  | { type: "COMPLETE"; code: string; videoUrl?: string; jobId: string }
  | { type: "ERROR"; message: string }
  | { type: "SET_STYLE"; analysis: string }
  | { type: "SET_RULES"; rules: Partial<AnimationRules> }
  | { type: "PROBLEM_EXTRACTED"; problemText: string; problemType: string; expressions: string[] }
  | { type: "SOLUTION_READY"; steps: SolutionStep[]; summary: string }
  | { type: "SOLUTION_REFINED"; steps: SolutionStep[]; instruction: string; stepIndex: number | null }
  | { type: "SET_SESSION_ID"; sessionId: string }
  | { type: "SET_IMAGE"; imageBase64: string }
  | { type: "RESET_TEACHER" }
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
  plan: null,
  rules: initialRules,
  problemText: "",
  problemType: "",
  expressions: [],
  solutionSteps: [],
  solutionSummary: "",
  sessionId: null,
  refinementHistory: [],
  imageBase64: null,
  validationPassed: false,
  validationError: null,
};

export function agentReducer(state: AgentState, action: AgentAction): AgentState {
  switch (action.type) {
    case "STEP_START": {
      // Heartbeat updates: update the last render_test step's message instead of adding a new entry
      if (action.step === "render_progress" && state.steps.length > 0) {
        const lastStep = state.steps[state.steps.length - 1];
        if (lastStep.step === "render_test" || lastStep.step === "render_progress") {
          const updated = [...state.steps];
          updated[updated.length - 1] = { ...lastStep, message: action.message };
          return { ...state, steps: updated };
        }
      }
      return {
        ...state,
        currentStep: action.step,
        status: action.step === "plan" ? "planning"
          : action.step === "generate" ? "generating"
          : action.step === "validate" ? "validating"
          : action.step === "render_test" ? "rendering"
          : action.step === "render_progress" ? "rendering"
          : action.step === "correct" ? "correcting"
          : action.step === "extract" ? "extracting"
          : action.step === "solve" ? "solving"
          : action.step === "refine" ? "refining"
          : action.step === "fix" ? "correcting"
          : state.status,
        steps: [
          ...state.steps,
          { step: action.step, message: action.message, startedAt: Date.now() },
        ],
      };
    }

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

    case "PLAN_READY":
      return { ...state, plan: action.plan };

    case "CODE_GENERATED":
      return { ...state, code: action.code, validationPassed: false, validationError: null };

    case "VALIDATION_RESULT": {
      const steps = [...state.steps];
      const last = steps[steps.length - 1];
      if (last) {
        last.endedAt = Date.now();
        last.passed = action.passed;
        if (action.error) last.error = action.error;
      }
      return { ...state, steps, validationPassed: action.passed, validationError: action.error || null };
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
        validationPassed: true,  // Backend only sends complete if validation passed
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

    case "PROBLEM_EXTRACTED":
      return {
        ...state,
        problemText: action.problemText,
        problemType: action.problemType,
        expressions: action.expressions,
      };

    case "SOLUTION_READY":
      return {
        ...state,
        solutionSteps: action.steps,
        solutionSummary: action.summary,
      };

    case "SOLUTION_REFINED":
      return {
        ...state,
        solutionSteps: action.steps,
        refinementHistory: [
          ...state.refinementHistory,
          { instruction: action.instruction, stepIndex: action.stepIndex, timestamp: Date.now() },
        ],
      };

    case "SET_SESSION_ID":
      return { ...state, sessionId: action.sessionId };

    case "SET_IMAGE":
      return { ...state, imageBase64: action.imageBase64 };

    case "RESET_TEACHER":
      return {
        ...initialState,
        styleAnalysis: state.styleAnalysis,
        rules: state.rules,
      };

    case "RESET":
      return { ...initialState, styleAnalysis: state.styleAnalysis, rules: state.rules };

    default:
      return state;
  }
}
