export interface RequestData {
  id: string;
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: any;
  timestamp: number;
  response?: {
    status: number;
    headers: Record<string, string>;
    body?: any;
  };
  groupId?: string;
}

export interface RequestGroup {
  id: string;
  name: string;
  createdAt: number;
}

export interface DiffResult {
  requestDiff: {
    [key: string]: {
      before: any;
      after: any;
    };
  };
  responseDiff: {
    differences: Array<{
      path: string;
      before: any;
      after: any;
    }>;
  };
} 