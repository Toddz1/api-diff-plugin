import { StorageData, RequestData, Group, CaptureSession, PaginationOptions, SearchOptions } from './types';

const STORAGE_KEY = 'apiDiffData';

export class StorageManager {
  private static instance: StorageManager;
  private currentSession: CaptureSession | null = null;
  private initialized: boolean = false;

  private constructor() {}

  static getInstance(): StorageManager {
    if (!StorageManager.instance) {
      StorageManager.instance = new StorageManager();
    }
    return StorageManager.instance;
  }

  // 初始化存储
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      const data = await this.getStorageData();
      if (!data) {
        await this.setStorageData({
          requests: [],
          groups: [],
          sessions: [],
          currentSession: null,
          settings: {
            pagination: {
              page: 0,
              pageSize: 50
            },
            search: {
              query: '',
              fields: {
                url: true,
                requestHeaders: true,
                requestBody: true,
                responseHeaders: true,
                responseBody: true
              }
            }
          }
        });
      }
      this.initialized = true;
    } catch (err) {
      console.error('Failed to initialize storage:', err);
      throw err;
    }
  }

  // 获取存储数据，确保已初始化
  private async ensureInitialized<T>(operation: () => Promise<T>): Promise<T> {
    if (!this.initialized) {
      await this.initialize();
    }
    return operation();
  }

  // 创建新的捕获会话
  async createSession(): Promise<CaptureSession> {
    return this.ensureInitialized(async () => {
      const now = new Date();
      const session: CaptureSession = {
        id: this.formatSessionId(now),
        timestamp: now.getTime(),
        requestCount: 0,
        status: 'capturing'
      };

      const data = await this.getStorageData();
      data.sessions.push(session);
      data.currentSession = session.id;
      await this.setStorageData(data);
      this.currentSession = session;

      return session;
    });
  }

  // 结束当前会话
  async endCurrentSession(): Promise<void> {
    return this.ensureInitialized(async () => {
      if (!this.currentSession) return;

      const data = await this.getStorageData();
      const session = data.sessions.find(s => s.id === this.currentSession?.id);
      if (session) {
        session.status = 'completed';
        data.currentSession = null;
        await this.setStorageData(data);
        this.currentSession = null;
      }
    });
  }

  // 保存请求到当前会话
  async saveRequest(request: RequestData): Promise<void> {
    return this.ensureInitialized(async () => {
      if (!this.currentSession) return;

      const sessionKey = `session_${this.currentSession.id}`;
      const requests = await this.getSessionRequests(this.currentSession.id);
      requests.push(request);

      await chrome.storage.local.set({ [sessionKey]: requests });

      // 更新会话请求计数
      const data = await this.getStorageData();
      const session = data.sessions.find(s => s.id === this.currentSession?.id);
      if (session) {
        session.requestCount = requests.length;
        await this.setStorageData(data);
      }
    });
  }

  // 获取会话列表
  async getSessions(): Promise<CaptureSession[]> {
    return this.ensureInitialized(async () => {
      const data = await this.getStorageData();
      return data.sessions || [];
    });
  }

  // 获取会话的请求列表（带分页和搜索）
  async getSessionRequests(
    sessionId: string,
    pagination?: PaginationOptions,
    search?: SearchOptions
  ): Promise<RequestData[]> {
    return this.ensureInitialized(async () => {
      const sessionKey = `session_${sessionId}`;
      const result = await chrome.storage.local.get(sessionKey);
      let requests: RequestData[] = result[sessionKey] || [];

      // 应用搜索
      if (search && search.query) {
        requests = this.filterRequests(requests, search);
      }

      // 应用分页
      if (pagination) {
        const start = pagination.page * pagination.pageSize;
        requests = requests.slice(start, start + pagination.pageSize);
      }

      return requests;
    });
  }

  // 获取存储设置
  async getSettings(): Promise<StorageData['settings']> {
    return this.ensureInitialized(async () => {
      const data = await this.getStorageData();
      return data.settings;
    });
  }

  // 更新存储设置
  async updateSettings(settings: Partial<StorageData['settings']>): Promise<void> {
    return this.ensureInitialized(async () => {
      const data = await this.getStorageData();
      data.settings = { ...data.settings, ...settings };
      await this.setStorageData(data);
    });
  }

  // 私有辅助方法
  private formatSessionId(date: Date): string {
    const pad = (n: number, width: number = 2) => String(n).padStart(width, '0');
    
    return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_` +
           `${pad(date.getHours())}_${pad(date.getMinutes())}_${pad(date.getSeconds())}_` +
           `${pad(date.getMilliseconds(), 3)}`;
  }

  private async getStorageData(): Promise<StorageData> {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    return result[STORAGE_KEY] || {
      requests: [],
      groups: [],
      sessions: [],
      currentSession: null,
      settings: {
        pagination: {
          page: 0,
          pageSize: 50
        },
        search: {
          query: '',
          fields: {
            url: true,
            requestHeaders: true,
            requestBody: true,
            responseHeaders: true,
            responseBody: true
          }
        }
      }
    };
  }

  private async setStorageData(data: StorageData): Promise<void> {
    await chrome.storage.local.set({ [STORAGE_KEY]: data });
  }

  private filterRequests(requests: RequestData[], search: SearchOptions): RequestData[] {
    const searchText = search.query.toLowerCase();
    
    return requests.filter(request => {
      if (search.fields.url && request.url.toLowerCase().includes(searchText)) {
        return true;
      }
      
      if (search.fields.requestHeaders && 
          Object.entries(request.requestHeaders).some(([k, v]) => 
            k.toLowerCase().includes(searchText) || v.toLowerCase().includes(searchText))) {
        return true;
      }
      
      if (search.fields.requestBody && request.requestBody &&
          JSON.stringify(request.requestBody).toLowerCase().includes(searchText)) {
        return true;
      }
      
      if (search.fields.responseHeaders && request.responseHeaders &&
          Object.entries(request.responseHeaders).some(([k, v]) => 
            k.toLowerCase().includes(searchText) || v.toLowerCase().includes(searchText))) {
        return true;
      }
      
      if (search.fields.responseBody && request.response &&
          JSON.stringify(request.response).toLowerCase().includes(searchText)) {
        return true;
      }
      
      return false;
    });
  }

  // 请求管理方法
  async addRequest(request: RequestData): Promise<void> {
    const data = await this.getStorageData();
    data.requests.push(request);
    await this.setStorageData(data);
  }

  async updateRequest(request: RequestData): Promise<void> {
    const data = await this.getStorageData();
    const index = data.requests.findIndex((r: RequestData) => r.id === request.id);
    if (index !== -1) {
      data.requests[index] = request;
      await this.setStorageData(data);
    }
  }

  async deleteRequest(requestId: string): Promise<void> {
    const data = await this.getStorageData();
    data.requests = data.requests.filter((r: RequestData) => r.id !== requestId);
    await this.setStorageData(data);
  }

  // 分组管理方法
  async addGroup(group: Group): Promise<void> {
    const data = await this.getStorageData();
    data.groups.push(group);
    await this.setStorageData(data);
  }

  async updateGroup(group: Group): Promise<void> {
    const data = await this.getStorageData();
    const index = data.groups.findIndex((g: Group) => g.id === group.id);
    if (index !== -1) {
      data.groups[index] = group;
      await this.setStorageData(data);
    }
  }

  async deleteGroup(groupId: string): Promise<void> {
    const data = await this.getStorageData();
    data.groups = data.groups.filter((g: Group) => g.id !== groupId);
    // 移除该分组下的所有请求
    data.requests = data.requests.filter((r: RequestData) => r.groupId !== groupId);
    await this.setStorageData(data);
  }

  async moveRequestToGroup(requestId: string, groupId: string): Promise<void> {
    const data = await this.getStorageData();
    const request = data.requests.find((r: RequestData) => r.id === requestId);
    if (request) {
      request.groupId = groupId;
      await this.setStorageData(data);
    }
  }
}

// 创建 storageManager 实例
const storageManager = StorageManager.getInstance();

// 导出 storageManager 和初始化函数
export { storageManager };
export const initializeStorage = () => storageManager.initialize().catch(console.error); 