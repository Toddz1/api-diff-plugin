export interface RequestData {
  id: string;
  url: string;
  method: string;
  timestamp: number;
  requestBody?: {
    raw?: Array<{
      bytes: ArrayBuffer;
    }>;
  };
  headers: Record<string, string>;
  response: any;
  groupId?: string;
}

export interface Group {
  id: string;
  name: string;
  description?: string;
  createdAt: number;
}

export interface StorageData {
  requests: RequestData[];
  groups: Group[];
}

export interface DiffResult {
  requestDiff: {
    url?: { before: string; after: string };
    method?: { before: string; after: string };
    headers?: { before: Record<string, string>; after: Record<string, string> };
    body?: { before: any; after: any };
  };
  responseDiff: {
    before: any;
    after: any;
    differences: Array<{
      path: string;
      type: 'type_mismatch' | 'value_mismatch';
      before: any;
      after: any;
    }>;
  };
} 