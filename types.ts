
export interface ChatPart {
  text?: string;
  inlineData?: {
    mimeType: string;
    data: string;
  };
}

export interface ChatMessage {
  role: 'user' | 'model';
  parts: ChatPart[];
}

export interface AttachedFile {
  name: string;
  type: string;
  size: number;
  content: string; // base64 data URL
}
