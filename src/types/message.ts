export type MessageRole = "user" | "assistant" | "system" | "tool";

export interface Message {
  id?: number;
  session_id: number;
  role: MessageRole;
  content: string;
  created_at?: string;
}

export interface Session {
  id: number;
  chat_id: string;
  created_at?: string;
}
