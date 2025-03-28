export interface RequestData {
  id: string;
  timestamp: number;
  method: string;
  url: string;
  requestHeaders: Record<string, string>;
  requestBody?: any;
  responseHeaders?: Record<string, string>;
  response?: any;
  duration?: number;
  selected?: boolean;
}

export interface ModifiedRequestData extends Partial<RequestData> {
  shouldResend?: boolean;
  shouldSaveRequest?: boolean;
}

export interface CaptureSession {
  id: string;
  timestamp: number;
  status: 'capturing' | 'completed';
  requestCount: number;
}

export interface PaginationOptions {
  pageSize: number;
  page: number;
}

export interface SearchOptions {
  query: string;
  fields: {
    url: boolean;
    requestHeaders: boolean;
    requestBody: boolean;
    responseHeaders: boolean;
    responseBody: boolean;
  };
}

export interface StorageData {
  sessions: CaptureSession[];
  settings: {
    pagination?: PaginationOptions;
  };
}

export interface Group {
  id: string;
  name: string;
  description?: string;
  createdAt: number;
  updatedAt: number;
}

export interface DiffResult {
  requestDiff: {
    url?: { old: string; new: string };
    method?: { old: string; new: string };
    headers?: { old: Record<string, string>; new: Record<string, string> };
    body?: { old: any; new: any };
  };
  responseDiff: {
    status?: { old: number; new: number };
    headers?: { old: Record<string, string>; new: Record<string, string> };
    body?: { old: any; new: any };
  };
} 