import { RequestData, CaptureSession, StorageData, PaginationOptions, SearchOptions } from './types';

// 存储配置
const STORAGE_CONFIG = {
  // 每个批次的最大存储项目数
  BATCH_SET_SIZE: 20,
  // 会话请求的缓存过期时间（毫秒）
  CACHE_EXPIRY: 60 * 1000, // 1分钟
  // 最大缓存会话数
  MAX_CACHED_SESSIONS: 3
};

class StorageManager {
  private static instance: StorageManager;
  private initialized: boolean = false;
  
  // 会话元数据缓存
  private sessionCache: Map<string, { data: CaptureSession, timestamp: number }> = new Map();
  // 请求数据缓存
  private requestsCache: Map<string, { data: RequestData[], timestamp: number }> = new Map();
  // 挂起的存储操作
  private pendingStorageOps: Promise<unknown> = Promise.resolve();

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

    try {
      console.log('StorageManager: Initializing...');
      const data = await this.getStorageData();
      if (!data.settings) {
        console.log('StorageManager: Creating default settings');
        data.settings = {
          pagination: {
            pageSize: 50,
            page: 0
          }
        };
        await this.setStorageData(data);
      }

      this.initialized = true;
      console.log('StorageManager: Initialization complete');
      
      // 启动定期缓存清理
      setInterval(() => this.cleanExpiredCache(), 60 * 1000);
    } catch (error) {
      console.error('StorageManager: Initialization failed', error);
      throw new Error(`Storage initialization failed: ${error}`);
    }
  }

  // 清理过期缓存
  private cleanExpiredCache(): void {
    try {
      const now = Date.now();
      let cleanedSessions = 0;
      let cleanedRequests = 0;
      
      // 清理会话缓存
      for (const [key, cache] of this.sessionCache.entries()) {
        if (now - cache.timestamp > STORAGE_CONFIG.CACHE_EXPIRY) {
          this.sessionCache.delete(key);
          cleanedSessions++;
        }
      }
      
      // 清理请求缓存
      for (const [key, cache] of this.requestsCache.entries()) {
        if (now - cache.timestamp > STORAGE_CONFIG.CACHE_EXPIRY) {
          this.requestsCache.delete(key);
          cleanedRequests++;
        }
      }
      
      // 如果缓存会话太多，删除最旧的
      if (this.sessionCache.size > STORAGE_CONFIG.MAX_CACHED_SESSIONS) {
        const entries = Array.from(this.sessionCache.entries())
          .sort((a, b) => a[1].timestamp - b[1].timestamp);
        
        const toRemove = this.sessionCache.size - STORAGE_CONFIG.MAX_CACHED_SESSIONS;
        for (let i = 0; i < toRemove; i++) {
          this.sessionCache.delete(entries[i][0]);
          cleanedSessions++;
        }
      }
      
      if (cleanedSessions > 0 || cleanedRequests > 0) {
        console.log(`StorageManager: Cleaned ${cleanedSessions} session caches and ${cleanedRequests} request caches`);
      }
    } catch (error) {
      console.error('StorageManager: Error cleaning cache:', error);
    }
  }

  private async getStorageData(): Promise<StorageData> {
    try {
      console.log('StorageManager: Getting storage data...');
      return new Promise((resolve, reject) => {
        chrome.storage.local.get('data', result => {
          if (chrome.runtime.lastError) {
            console.error('StorageManager: Chrome storage error', chrome.runtime.lastError);
            reject(chrome.runtime.lastError);
            return;
          }
          
          console.log('StorageManager: Got storage data', result ? 'exists' : 'empty');
          resolve(result.data || { sessions: [], settings: {} });
        });
      });
    } catch (error) {
      console.error('StorageManager: Failed to get storage data', error);
      return { sessions: [], settings: {} };
    }
  }

  private async setStorageData(data: StorageData): Promise<void> {
    try {
      console.log('StorageManager: Setting storage data...');
      return new Promise((resolve, reject) => {
        chrome.storage.local.set({ data }, () => {
          if (chrome.runtime.lastError) {
            console.error('StorageManager: Chrome storage error', chrome.runtime.lastError);
            reject(chrome.runtime.lastError);
            return;
          }
          
          console.log('StorageManager: Storage data set successfully');
          resolve();
        });
      });
    } catch (error) {
      console.error('StorageManager: Failed to set storage data', error);
      throw error;
    }
  }

  // 批量存储操作，使用队列确保不同时进行太多存储操作
  private async batchStorageOperation<T>(operation: () => Promise<T>): Promise<T> {
    // 将存储操作添加到队列
    this.pendingStorageOps = this.pendingStorageOps
      .then(() => operation())
      .catch(error => {
        console.error('StorageManager: Batch storage operation failed:', error);
        throw error;
      });
      
    return this.pendingStorageOps as Promise<T>;
  }
  
  async getSessions(): Promise<CaptureSession[]> {
    return this.ensureInitialized(async () => {
      const data = await this.getStorageData();
      
      // 更新会话缓存
      data.sessions.forEach(session => {
        this.sessionCache.set(session.id, {
          data: session,
          timestamp: Date.now()
        });
      });
      
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
      
      // 添加到缓存
      this.sessionCache.set(session.id, {
        data: session,
        timestamp: Date.now()
      });
      
      // 添加到存储
      data.sessions.push(session);
      await this.setStorageData(data);
      return session;
    });
  }

  async updateSession(session: CaptureSession): Promise<void> {
    return this.ensureInitialized(async () => {
      // 更新缓存
      this.sessionCache.set(session.id, {
        data: session,
        timestamp: Date.now()
      });
      
      // 更新存储
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
      try {
        // 检查缓存
        const cacheKey = `requests_${sessionId}`;
        const cached = this.requestsCache.get(cacheKey);
        
        let requests: RequestData[];
        
        // 如果缓存存在且未过期，使用缓存
        if (cached && Date.now() - cached.timestamp < STORAGE_CONFIG.CACHE_EXPIRY) {
          console.log(`StorageManager: Using cached requests for session ${sessionId}`);
          requests = cached.data;
        } else {
          console.log(`StorageManager: Getting requests for session ${sessionId} from storage...`);
          const sessionKey = `session_${sessionId}`;
          
          // 使用回调形式的 chrome.storage.local.get
          const result = await new Promise<{[key: string]: RequestData[]}>((resolve, reject) => {
            chrome.storage.local.get(sessionKey, (result) => {
              if (chrome.runtime.lastError) {
                console.error('StorageManager: Error getting session requests', chrome.runtime.lastError);
                reject(chrome.runtime.lastError);
                return;
              }
              resolve(result);
            });
          });
          
          requests = result[sessionKey] || [];
          console.log(`StorageManager: Got ${requests.length} requests for session ${sessionId}`);
          
          // 更新缓存
          this.requestsCache.set(cacheKey, {
            data: requests,
            timestamp: Date.now()
          });
        }
        
        // 默认按时间戳降序排序，最新的请求在前面
        requests = requests.sort((a, b) => b.timestamp - a.timestamp);
        
        // 应用搜索过滤
        if (searchOptions?.query) {
          const query = searchOptions.query.toLowerCase();
          const fields = searchOptions.fields;
          
          // 使用更高效的过滤
          requests = requests.filter(request => {
            // 先检查最简单的路径
            if (fields.url && request.url.toLowerCase().includes(query)) return true;
            
            // 然后检查其他字段
            try {
              if (fields.requestHeaders && JSON.stringify(request.requestHeaders || {}).toLowerCase().includes(query)) return true;
              if (fields.requestBody && request.requestBody && JSON.stringify(request.requestBody).toLowerCase().includes(query)) return true;
              if (fields.responseHeaders && request.responseHeaders && JSON.stringify(request.responseHeaders).toLowerCase().includes(query)) return true;
              if (fields.responseBody && request.response && JSON.stringify(request.response).toLowerCase().includes(query)) return true;
            } catch (e) {
              // 忽略序列化错误
              console.error('StorageManager: Error during search filtering', e);
            }
            return false;
          });
          
          console.log(`StorageManager: After search filter, ${requests.length} requests remain`);
        }

        // 应用分页
        if (pagination) {
          // 确保分页参数有效
          const pageSize = Math.max(1, pagination.pageSize);
          const page = Math.max(0, pagination.page);
          
          const start = page * pageSize;
          const end = start + pageSize;
          
          // 优化内存使用，仅返回需要的子集
          const pagedRequests = (start < requests.length) ? 
            requests.slice(start, Math.min(end, requests.length)) : 
            [];
            
          console.log(`StorageManager: After pagination, returning ${pagedRequests.length} requests (page ${page}, pageSize ${pageSize})`);
          return pagedRequests;
        }

        return requests;
      } catch (error) {
        console.error('StorageManager: Error in getSessionRequests:', error);
        return [];
      }
    });
  }

  async saveRequest(sessionId: string, request: RequestData): Promise<void> {
    return this.ensureInitialized(async () => {
      return this.batchStorageOperation(async () => {
        try {
          // 验证请求对象
          if (!request.id || !request.url || !request.method) {
            console.error('Invalid request data:', request);
            return;
          }
          
          // 确保所有字段都可以被序列化
          const safeRequest: RequestData = {
            id: String(request.id),
            timestamp: Number(request.timestamp) || Date.now(),
            method: String(request.method),
            url: String(request.url),
            requestHeaders: request.requestHeaders || {},
            requestBody: request.requestBody,
            responseHeaders: request.responseHeaders || {},
            response: request.response
          };
          
          // 确保 JSON 可以序列化
          try {
            JSON.stringify(safeRequest);
          } catch (error) {
            console.error('Request cannot be serialized:', error);
            // 尝试移除可能导致问题的字段
            safeRequest.requestBody = typeof safeRequest.requestBody === 'string' ? 
                                      safeRequest.requestBody : 
                                      JSON.stringify(safeRequest.requestBody);
            safeRequest.response = typeof safeRequest.response === 'string' ? 
                                   safeRequest.response : 
                                   JSON.stringify(safeRequest.response);
          }
          
          const sessionKey = `session_${sessionId}`;
          
          // 获取当前会话的请求列表
          const result = await new Promise<{[key: string]: RequestData[]}>((resolve, reject) => {
            chrome.storage.local.get(sessionKey, (result) => {
              if (chrome.runtime.lastError) {
                console.error('StorageManager: Error getting session requests', chrome.runtime.lastError);
                reject(chrome.runtime.lastError);
                return;
              }
              resolve(result);
            });
          });
          
          const requests = result[sessionKey] || [];
          
          // 添加新请求
          requests.push(safeRequest);
          
          // 更新缓存
          const cacheKey = `requests_${sessionId}`;
          this.requestsCache.set(cacheKey, {
            data: requests,
            timestamp: Date.now()
          });
          
          // 保存到存储
          await new Promise<void>((resolve, reject) => {
            chrome.storage.local.set({ [sessionKey]: requests }, () => {
              if (chrome.runtime.lastError) {
                console.error('StorageManager: Error saving request', chrome.runtime.lastError);
                reject(chrome.runtime.lastError);
                return;
              }
              resolve();
            });
          });
          
          // 更新会话中的请求计数
          const cachedSession = this.sessionCache.get(sessionId);
          if (cachedSession) {
            cachedSession.data.requestCount = requests.length;
            this.sessionCache.set(sessionId, {
              data: cachedSession.data,
              timestamp: Date.now()
            });
            
            // 更新存储中的会话信息
            const data = await this.getStorageData();
            const sessionIndex = data.sessions.findIndex(s => s.id === sessionId);
            if (sessionIndex !== -1) {
              data.sessions[sessionIndex].requestCount = requests.length;
              await this.setStorageData(data);
            }
          }
        } catch (error) {
          console.error('Error in saveRequest:', error);
          throw new Error(`Failed to save request: ${error}`);
        }
      });
    });
  }
  
  // 删除会话
  async deleteSession(sessionId: string): Promise<void> {
    return this.ensureInitialized(async () => {
      try {
        console.log(`StorageManager: Deleting session ${sessionId}...`);
        
        // 删除会话的请求数据
        const sessionKey = `session_${sessionId}`;
        await new Promise<void>((resolve, reject) => {
          chrome.storage.local.remove(sessionKey, () => {
            if (chrome.runtime.lastError) {
              console.error('StorageManager: Error removing session data', chrome.runtime.lastError);
              reject(chrome.runtime.lastError);
              return;
            }
            resolve();
          });
        });
        
        // 从缓存中删除
        this.sessionCache.delete(sessionId);
        this.requestsCache.delete(`requests_${sessionId}`);
        
        // 从会话列表中删除
        const data = await this.getStorageData();
        const updatedSessions = data.sessions.filter(s => s.id !== sessionId);
        data.sessions = updatedSessions;
        await this.setStorageData(data);
        
        console.log(`StorageManager: Session ${sessionId} deleted successfully`);
      } catch (error) {
        console.error(`StorageManager: Failed to delete session ${sessionId}:`, error);
        throw new Error(`Failed to delete session: ${error}`);
      }
    });
  }
  
  // 清理所有会话数据
  async clearAllData(): Promise<void> {
    return this.ensureInitialized(async () => {
      try {
        console.log('StorageManager: Clearing all data...');
        
        // 获取所有会话
        const data = await this.getStorageData();
        
        // 删除每个会话的请求数据
        for (const session of data.sessions) {
          const sessionKey = `session_${session.id}`;
          await new Promise<void>((resolve, reject) => {
            chrome.storage.local.remove(sessionKey, () => {
              if (chrome.runtime.lastError) {
                console.error(`StorageManager: Error removing session ${session.id} data`, chrome.runtime.lastError);
                // 继续删除其他会话
                resolve();
                return;
              }
              resolve();
            });
          });
        }
        
        // 重置存储数据
        await this.setStorageData({ sessions: [], settings: data.settings || {} });
        
        // 清空缓存
        this.sessionCache.clear();
        this.requestsCache.clear();
        
        console.log('StorageManager: All data cleared successfully');
      } catch (error) {
        console.error('StorageManager: Failed to clear all data:', error);
        throw new Error(`Failed to clear all data: ${error}`);
      }
    });
  }
}

export const storageManager = StorageManager.getInstance();
export const initializeStorage = () => storageManager.initialize(); 