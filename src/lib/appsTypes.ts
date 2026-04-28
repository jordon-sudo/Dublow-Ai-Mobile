// src/lib/appsTypes.ts
// Shared types for the Apps/Workflows feature. Mirrors the Hatz
// /v1/app/list and /v1/workflows/* response shapes.

export type VariableType =
  | 'short_answer'
  | 'paragraph'
  | 'multiple_choice'
  | 'dropdown'
  | 'file_upload'
  | 'url';

export interface UserInput {
  variable_name: string;
  display_name: string;
  variable_type: VariableType;
  required?: boolean;
  description?: string;
  position?: number;
  object_id?: string;
  // multiple_choice / dropdown options. Hatz docs don't pin down the exact
  // shape; we accept either string[] or {label,value}[] and normalize.
  options?: Array<string | { label: string; value: string }>;
}

export interface PromptSection {
  body: string;
  position: number;
}

export interface WorkflowStep {
  id: string;
  config?: Record<string, unknown>;
  position: number;
  step_type: string;
  display_name?: string;
  prompt_sections?: PromptSection[];
}

export interface AppItemBase {
  id?: string;          // present on /v1/app/{id}; sometimes on list rows
  name: string;
  description?: string;
  files?: unknown[];
  constants?: unknown[];
  user_inputs: UserInput[];
}

export interface SinglePromptApp extends AppItemBase {
  default_model?: string;
  prompt_sections: PromptSection[];
  steps?: undefined;
}

export interface WorkflowApp extends AppItemBase {
  steps: WorkflowStep[];
  dependencies?: unknown[];
  prompt_sections?: undefined;
}

export type AppItem = SinglePromptApp | WorkflowApp;

export function isWorkflow(item: AppItem): item is WorkflowApp {
  return Array.isArray((item as WorkflowApp).steps);
}

/* -------- Workflow job responses -------- */

export type JobStatus = 'pending' | 'running' | 'complete' | 'failed';

export function isTerminalStatus(s: string | undefined | null): boolean {
  return s === 'complete' || s === 'failed';
}

export interface StepOutput {
  step_id: string;
  job_id: string;
  step_type: string;
  status: JobStatus | string;
  output_type?: string;
  created_at?: string;
  updated_at?: string;
  start_time?: number;
  end_time?: number;
  duration?: number;
  output_data?: unknown;
  payload?: Record<string, unknown>;
}

export interface WorkflowJob {
  job_id: string;
  app_id: string;
  tenant_id?: string;
  user_id?: string;
  created_at?: string;
  updated_at?: string;
  start_time?: number;
  end_time?: number;
  number_of_steps?: number;
  status: JobStatus | string;
  user_inputs?: Record<string, unknown>;
  app_data?: Record<string, unknown>;
  step_outputs?: StepOutput[];
}

export interface RunWorkflowResponse {
  status: string;
  job_id: string;
}

export interface PresignedUrlResponse {
  url: string;
  expires_in: number;
}