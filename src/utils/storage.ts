import { RequestData, CaptureSession, StorageData, PaginationOptions, SearchOptions } from './types';

class StorageManager {
  private static instance: StorageManager;
  private initialized: boolean = false;

  private constructor() {}

  static getInstance(): StorageManager {
    if (!StorageManager.instance) {
      StorageManager.instance = new StorageManager();
    }
    return StorageManager.instance;
  }

  private async ensureInitialized<T>(callback: () => Promise<T>): Promise<T> {
    if (!this.initialized) {
      await this.initialize();
    }
    return callback();
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    const data = await this.getStorageData();
    if (!data.settings) {
      data.settings = {
        pagination: {
          pageSize: 50,
          page: 0
        }
      };
      await this.setStorageData(data);
    }

    this.initialized = true;
  }

  private async getStorageData(): Promise<StorageData> {
    const result = await chrome.storage.local.get('data');
    return result.data || { sessions: [], settings: {} };
  }

  private async setStorageData(data: StorageData): Promise<void> {
    await chrome.storage.local.set({ data });
  }

  async getSessions(): Promise<CaptureSession[]> {
    return this.ensureInitialized(async () => {
      const data = await this.getStorageData();
      return data.sessions;
    });
  }

  async getSettings(): Promise<StorageData['settings']> {
    return this.ensureInitialized(async () => {
      const data = await this.getStorageData();
      return data.settings;
    });
  }

  async updateSettings(settings: StorageData['settings']): Promise<void> {
    return this.ensureInitialized(async () => {
      const data = await this.getStorageData();
      data.settings = settings;
      await this.setStorageData(data);
    });
  }

  async createSession(): Promise<CaptureSession> {
    return this.ensureInitialized(async () => {
      const data = await this.getStorageData();
      const session: CaptureSession = {
        id: `${Date.now()}`,
        timestamp: Date.now(),
        status: 'capturing',
        requestCount: 0
      };
      data.sessions.push(session);
      await this.setStorageData(data);
      return session;
    });
  }

  async updateSession(session: CaptureSession): Promise<void> {
    return this.ensureInitialized(async () => {
      const data = await this.getStorageData();
      const index = data.sessions.findIndex(s => s.id === session.id);
      if (index !== -1) {
        data.sessions[index] = session;
        await this.setStorageData(data);
      }
    });
  }

  async getSessionRequests(
    sessionId: string,
    pagination?: PaginationOptions,
    searchOptions?: SearchOptions
  ): Promise<RequestData[]> {
    return this.ensureInitialized(async () => {
      const sessionKey = `session_${sessionId}`;
      const result = await chrome.storage.local.get(sessionKey);
      let requests: RequestData[] = result[sessionKey] || [];

      // 应用搜索过滤
      if (searchOptions?.query) {
        const query = searchOptions.query.toLowerCase();
        const fields = searchOptions.fields;
        requests = requests.filter(request => {
          if (fields.url && request.url.toLowerCase().includes(query)) return true;
          if (fields.requestHeaders && JSON.stringify(request.requestHeaders).toLowerCase().includes(query)) return true;
          if (fields.requestBody && request.requestBody && JSON.stringify(request.requestBody).toLowerCase().includes(query)) return true;
          if (fields.responseHeaders && request.responseHeaders && JSON.stringify(request.responseHeaders).toLowerCase().includes(query)) return true;
          if (fields.responseBody && request.response && JSON.stringify(request.response).toLowerCase().includes(query)) return true;
          return false;
        });
      }

      // 应用分页
      if (pagination) {
        const start = pagination.page * pagination.pageSize;
        const end = start + pagination.pageSize;
        requests = requests.slice(start, end);
      }

      return requests;
    });
  }

  async saveRequest(sessionId: string, request: RequestData): Promise<void> {
    return this.ensureInitialized(async () => {
      const sessionKey = `session_${sessionId}`;
      const requests = await this.getSessionRequests(sessionId) || [];
      requests.push(request);
      
      await chrome.storage.local.set({ [sessionKey]: requests });
      
      const data = await this.getStorageData();
      const sessionIndex = data.sessions.findIndex(s => s.id === sessionId);
      if (sessionIndex !== -1) {
        data.sessions[sessionIndex].requestCount = requests.length;
        await this.setStorageData(data);
      }
    });
  }
}

export const storageManager = StorageManager.getInstance();
export const initializeStorage = () => storageManager.initialize(); 