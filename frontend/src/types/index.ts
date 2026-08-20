export type EmailStatus = "SCHEDULED" | "PROCESSING" | "SENT" | "FAILED";

export interface EmailRow {
  id: string;
  recipient: string;
  subject: string;
  bodyPreview: string;
  sender: string;
  status: EmailStatus;
  scheduledAt: string;
  sentAt: string | null;
  error: string | null;
  previewUrl: string | null;
}

export interface EmailCounts {
  scheduled: number;
  sent: number;
}

export interface Sender {
  id: string;
  name: string;
  fromEmail: string;
  maxEmailsPerHour: number;
}

export interface ScheduleBatchInput {
  subject: string;
  body: string;
  senderId: string;
  startTime: string; // ISO
  delayMs: number;
  hourlyLimit?: number;
  recipients: string[];
  createdByEmail?: string;
}

export interface ScheduleBatchResponse {
  batch: {
    id: string;
    subject: string;
    recipientCount: number;
    startTime: string;
    delayMs: number;
  };
  deduped: boolean;
}
