export interface Document {
  id: string;
  episode_no: number;
  title: string;
  content: string;
  created_at?: string;
  updated_at?: string;
}

export interface Character {
  id?: string;
  name: string;
  role?: string;
  age?: string;
  gender?: string;
  description?: string;
  traits?: string[];
}

export interface WorldSetting {
  content: string;
  summary?: string;
}

export interface StoryHistory {
  episode_no: number;
  title?: string;
  summary: string;
}

export interface Material {
  id: string;
  title: string;
  content: string;
  file_type?: string;
  created_at?: string;
}

export type Severity = "high" | "medium" | "low";
export type AnalysisType = "story_keeper" | "clio";

export interface AnalysisItem {
  title: string;
  description: string;
  severity: Severity;
  type?: string;
}

export interface AnalysisResult {
  items: AnalysisItem[];
  raw?: unknown;
}

export type SaveStatus = "idle" | "saving" | "saved" | "error";
