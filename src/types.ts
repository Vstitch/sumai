export type MeetingPlatform = 'zoom' | 'google-meet' | 'teams' | 'slack' | 'discord' | 'recording';

export type ReportTemplate = 'scrum' | 'client' | 'interview' | 'sales' | 'investor';

export interface TranscriptChunk {
  speaker: string;
  start: number; // in seconds
  end: number; // in seconds
  text: string;
}

export interface ActionItem {
  id: string;
  meetingId: string;
  owner: string;
  task: string;
  deadline: string;
  status: 'pending' | 'completed';
}

export interface Report {
  summary: string; // Markdown summary
  decisions: string[];
  risks: string[];
  nextMeeting?: string;
  templateSpecific: Record<string, string | string[]>; // Context specific fields
}

export interface FollowUpData {
  email: string;
  slack: string;
  recap: string;
}

export interface Meeting {
  id: string;
  userId?: string;
  title: string;
  date: string;
  duration: number; // in seconds
  platform: MeetingPlatform;
  template: ReportTemplate;
  status: 'processing' | 'completed' | 'failed';
  error?: string;
  transcript: TranscriptChunk[];
  report?: Report;
  actionItems: ActionItem[];
  followUp?: FollowUpData;
  videoUrl?: string;
  audioUrl?: string;
  hasVideo?: boolean;
  hasAudio?: boolean;
  spokenLanguage?: string;
  translated?: boolean;
}

export interface SearchResult {
  meetings: Array<{
    id: string;
    title: string;
    date: string;
    platform: MeetingPlatform;
    relevance: string; // AI description of how it matches
  }>;
  aiAnswer: string; // Synthesized answer from meeting memory
  citations: Array<{
    meetingTitle: string;
    speaker: string;
    text: string;
  }>;
}
