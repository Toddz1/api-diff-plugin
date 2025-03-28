export interface RequestData {
  id: string;
  url: string;
  method: string;
  timestamp: number;
  requestBody?: {
    raw?: { bytes: ArrayBuffer }[];
  };
  requestHeaders: Record<string, string>;
  responseHeaders?: Record<string, string>;
  response: any;
  groupId?: string;
}

export interface CaptureSession {
  id: string;           // 格式：YYYYMMDD_HH_mm_ss_SSS
  timestamp: number;    // 创建时间戳
  requestCount: number; // 请求数量
  status: 'capturing' | 'completed'; // 会话状态
}

export interface PaginationOptions {
  page: number;
  pageSize: number;
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
  requests: RequestData[];
  groups: Group[];
  sessions: CaptureSession[];
  currentSession: string | null;
  settings: {
    pagination: PaginationOptions;
    search: SearchOptions;
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