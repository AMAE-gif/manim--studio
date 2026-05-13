export interface Health {
  status: string;
  llm_configured: boolean;
  manim_cli: boolean;
  supabase_service_configured?: boolean;
  supabase_jwt_configured?: boolean;
  uptime_seconds?: number;
}

export interface ProjectRow {
  id?: string;
  job_id: string;
  prompt: string | null;
  status: string;
  created_at?: string;
  video_url?: string;
}

export interface GenerateResponse {
  code: string;
  job_id: string;
}
