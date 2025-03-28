import { RequestData } from '../utils/types';
import { storageManager } from '../utils/storage';

// 配置
const CONFIG = {
  // 内存中最大请求数量
  MAX_REQUESTS_IN_MEMORY: 100,
  // 批量保存的请求数量
  BATCH_SAVE_SIZE: 20,
  // 某个URL的最大捕获次数 - 不限制
  MAX_CAPTURES_PER_URL: Infinity,
  // 某个会话的最大请求数量
  MAX_REQUESTS_PER_SESSION: 1000,
  // 会话最长运行时间 (毫秒)
  MAX_SESSION_DURATION: 30 * 60 * 1000 // 30分钟
};

let isCapturing = false;
let currentSessionId: string | null = null;
let sessionStartTime = 0;
let requestCounter = 0;

// 用于存储请求数据的临时 Map
const requestMap = new Map<string, RequestData>();
// URL 捕获计数器
const urlCaptureCount = new Map<string, number>();
// 批量存储队列
const saveBatchQueue: RequestData[] = [];
// 正在保存批次
let isSavingBatch = false;

// 生成唯一的请求 ID
function generateRequestId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `${timestamp}_${random}`;
}

// 安全地序列化数据，避免无法序列化的值
function safeSerialize(obj: any): any {
  if (obj === null || obj === undefined) {
    return null;
  }
  
  if (typeof obj !== 'object') {
    return obj;
  }
  
  // 处理数组
  if (Array.isArray(obj)) {
    return obj.map(item => safeSerialize(item));
  }
  
  // 处理对象
  const result: Record<string, any> = {};
  
  for (const key in obj) {
    try {
      const value = obj[key];
      // 跳过函数和特殊对象
      if (typeof value === 'function') {
        continue;
      }
      // 尝试 JSON 序列化测试
      JSON.stringify(value);
      result[key] = safeSerialize(value);
    } catch (e) {
      // 如果无法序列化，则将其转换为字符串
      try {
        result[key] = String(obj[key]);
      } catch (err) {
        result[key] = '[Unserializable data]';
      }
    }
  }
  
  return result;
}

// 检查并结束过长的会话
function checkSessionDuration() {
  if (!isCapturing || !currentSessionId || !sessionStartTime) return;
  
  const now = Date.now();
  const sessionDuration = now - sessionStartTime;
  
  if (sessionDuration > CONFIG.MAX_SESSION_DURATION) {
    console.log(`Background: Session duration exceeded ${CONFIG.MAX_SESSION_DURATION / 60000} minutes, stopping capture automatically`);
    stopCapture('timeout');
  }
}

// 获取URL的域名部分
function getDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch (e) {
    return url;
  }
}

// 限制特定URL的捕获次数
function shouldCaptureUrl(url: string): boolean {
  // 不再限制URL捕获次数，始终返回true
  return true;
}

// 管理内存中的请求数量
function manageRequestsInMemory() {
  if (requestMap.size > CONFIG.MAX_REQUESTS_IN_MEMORY) {
    console.log(`Background: Request map size (${requestMap.size}) exceeded limit, cleaning up oldest entries`);
    // 转换为数组，按时间戳排序
    const entries = Array.from(requestMap.entries());
    entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
    
    // 删除最老的 20% 请求
    const deleteCount = Math.floor(entries.length * 0.2);
    for (let i = 0; i < deleteCount; i++) {
      requestMap.delete(entries[i][0]);
    }
    
    console.log(`Background: Cleaned up ${deleteCount} old requests`);
  }
}

// 处理并批量保存请求
async function processSaveBatchQueue() {
  if (isSavingBatch || saveBatchQueue.length === 0 || !currentSessionId) return;
  
  isSavingBatch = true;
  try {
    const batchSize = Math.min(saveBatchQueue.length, CONFIG.BATCH_SAVE_SIZE);
    const batch = saveBatchQueue.splice(0, batchSize);
    
    console.log(`Background: Saving batch of ${batch.length} requests`);
    
    // 分批保存请求
    for (const request of batch) {
      try {
        const safeRequest = safeSerialize(request);
        await storageManager.saveRequest(currentSessionId, safeRequest);
      } catch (error) {
        console.error('Failed to save request:', error);
      }
    }
    
    // 更新会话信息
    if (currentSessionId) {
      try {
        await storageManager.updateSession({
          id: currentSessionId,
          timestamp: Date.now(),
          status: 'capturing',
          requestCount: requestCounter
        });
      } catch (error) {
        console.error('Failed to update session:', error);
      }
    }
  } catch (error) {
    console.error('Error in processSaveBatchQueue:', error);
  } finally {
    isSavingBatch = false;
    
    // 如果队列中还有请求，继续处理
    if (saveBatchQueue.length > 0) {
      setTimeout(processSaveBatchQueue, 100);
    }
  }
}

// 将请求添加到保存队列
function queueRequestForSaving(request: RequestData) {
  if (!isCapturing || !currentSessionId) return;
  
  saveBatchQueue.push(request);
  requestCounter++;
  
  // 批量处理请求
  if (saveBatchQueue.length >= CONFIG.BATCH_SAVE_SIZE && !isSavingBatch) {
    processSaveBatchQueue();
  }
  
  // 检查是否达到会话请求限制
  if (requestCounter >= CONFIG.MAX_REQUESTS_PER_SESSION) {
    console.log(`Background: Reached maximum requests per session (${CONFIG.MAX_REQUESTS_PER_SESSION}), stopping capture`);
    stopCapture('limit');
  }
}

// 停止捕获
async function stopCapture(reason: 'manual' | 'timeout' | 'limit' = 'manual') {
  if (!isCapturing || !currentSessionId) return;
  
  console.log(`Background: Stopping capture (reason: ${reason})...`);
  
  // 先停止捕获以避免新请求
  isCapturing = false;
  const sessionIdToUpdate = currentSessionId;
  currentSessionId = null;
  sessionStartTime = 0;
  
  // 处理剩余的请求队列
  if (saveBatchQueue.length > 0) {
    console.log(`Background: Processing remaining ${saveBatchQueue.length} requests in queue`);
    
    while (saveBatchQueue.length > 0) {
      const batch = saveBatchQueue.splice(0, CONFIG.BATCH_SAVE_SIZE);
      for (const request of batch) {
        try {
          const safeRequest = safeSerialize(request);
          await storageManager.saveRequest(sessionIdToUpdate, safeRequest);
        } catch (error) {
          console.error('Failed to save request during cleanup:', error);
        }
      }
    }
  }
  
  // 清理所有临时存储的请求数据
  requestMap.clear();
  urlCaptureCount.clear();
  
  // 更新会话状态
  try {
    await storageManager.updateSession({
      id: sessionIdToUpdate,
      timestamp: Date.now(),
      status: 'completed',
      requestCount: requestCounter
    });
    
    console.log('Background: Capture stopped and session updated');
    return { success: true };
  } catch (error) {
    console.error('Background: Failed to update session:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to update session' };
  }
}

// 初始化
chrome.runtime.onInstalled.addListener(() => {
  console.log('Extension installed');
  storageManager.initialize().catch((error: Error) => {
    console.error('Failed to initialize storage:', error);
  });
});

// 定期检查会话时长和处理保存队列
setInterval(() => {
  checkSessionDuration();
  if (!isSavingBatch && saveBatchQueue.length > 0) {
    processSaveBatchQueue();
  }
}, 5000);

// 监听网络请求
chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    if (!isCapturing || !currentSessionId) return;
    
    // 避免捕获扩展自身的请求
    if (details.initiator && details.initiator.includes('chrome-extension://')) {
      return;
    }
    
    // 只捕获 XHR 和 Fetch 请求
    if (details.type === 'xmlhttprequest') {
      // 检查是否应该捕获此URL
      if (!shouldCaptureUrl(details.url)) {
        return;
      }
      
      const customRequestId = generateRequestId();
      const requestData: RequestData = {
        id: customRequestId,
        url: details.url,
        method: details.method,
        timestamp: Date.now(),
        requestHeaders: {},
        requestBody: undefined // 稍后安全处理
      };
      
      // 尝试安全地处理请求体
      try {
        if (details.requestBody && details.requestBody.raw && details.requestBody.raw.length > 0) {
          const rawBytes = details.requestBody.raw[0].bytes;
          if (rawBytes) {
            // 尝试将二进制数据转换为字符串
            const decoder = new TextDecoder("utf-8");
            const bodyText = decoder.decode(rawBytes);
            try {
              // 尝试作为 JSON 解析
              requestData.requestBody = JSON.parse(bodyText);
            } catch (e) {
              // 如果不是 JSON，则作为字符串保存
              requestData.requestBody = bodyText;
            }
          }
        }
      } catch (e) {
        console.error('Failed to process request body:', e);
      }
      
      // 存储请求数据到临时 Map
      requestMap.set(details.requestId, requestData);
      
      // 管理内存中的请求数量
      manageRequestsInMemory();
    }
  },
  { urls: ["<all_urls>"] },
  ["requestBody"]
);

// 监听请求头
chrome.webRequest.onBeforeSendHeaders.addListener(
  (details) => {
    if (!isCapturing || !currentSessionId) return;
    
    const request = requestMap.get(details.requestId);
    if (!request) return;

    // 将 HttpHeader[] 转换为 Record<string, string>
    const headers: Record<string, string> = {};
    details.requestHeaders?.forEach(header => {
      if (header.name && header.value) {
        headers[header.name] = header.value;
      }
    });

    request.requestHeaders = headers;
  },
  { urls: ["<all_urls>"] },
  ["requestHeaders", "extraHeaders"]
);

// 监听响应头
chrome.webRequest.onHeadersReceived.addListener(
  (details) => {
    if (!isCapturing || !currentSessionId) return;
    
    const request = requestMap.get(details.requestId);
    if (!request) return;

    // 将 HttpHeader[] 转换为 Record<string, string>
    const headers: Record<string, string> = {};
    details.responseHeaders?.forEach(header => {
      if (header.name && header.value) {
        headers[header.name] = header.value;
      }
    });

    request.responseHeaders = headers;
  },
  { urls: ["<all_urls>"] },
  ["responseHeaders", "extraHeaders"]
);

// 监听响应完成
chrome.webRequest.onCompleted.addListener(
  async (details) => {
    if (!isCapturing || !currentSessionId) return;

    const request = requestMap.get(details.requestId);
    if (!request) return;

    try {
      // 计算请求完成时间
      const completionTime = Date.now() - request.timestamp;
      
      // 对于长时间运行的请求，更新时间戳
      if (completionTime > 10000) { // 10秒以上的请求
        request.timestamp = Date.now();
      }
      
      // 记录请求耗时
      request.duration = completionTime;

      // 检查是否为Diff请求
      const isDiffRequest = request.requestHeaders && 
                           (request.requestHeaders['X-API-Diff-Request'] === '1' ||
                            request.requestHeaders['x-api-diff-request'] === '1');
      
      if (isDiffRequest) {
        console.log('Background: Detected Diff request, capturing full response');
      }
      
      // 获取响应内容
      try {
        const response = await fetch(request.url, {
          method: request.method,
          headers: request.requestHeaders,
          body: typeof request.requestBody === 'string' ? request.requestBody : 
                request.requestBody ? JSON.stringify(request.requestBody) : undefined,
          // 设置超时
          signal: AbortSignal.timeout(isDiffRequest ? 10000 : 5000) // 根据请求类型设置不同的超时时间
        });
        
        // 安全地保存响应体
        const contentType = response.headers.get('content-type');
        
        // 获取响应文本
        const responseText = await response.text();
        
        // 处理响应
        request.response = {
          status: response.status,
          statusText: response.statusText,
          headers: Object.fromEntries(response.headers.entries())
        };
        
        // 处理响应体
        if (contentType && contentType.includes('application/json')) {
          try {
            // 尝试解析JSON，只保存body部分
            const jsonBody = JSON.parse(responseText);
            request.response.body = jsonBody;
          } catch (e) {
            // 如果解析失败，保存文本
            request.response.body = responseText;
          }
        } else {
          // 非JSON响应直接保存文本作为body
          request.response.body = responseText;
        }
        
        // 如果这是一个Diff请求，不要保存到存储
        if (isDiffRequest) {
          console.log('Background: Diff request completed, not saving to storage');
          // 仅通知但不持久化
          chrome.runtime.sendMessage({
            type: 'DIFF_REQUEST_COMPLETED',
            requestId: request.id
          });
        } else {
          // 普通请求添加到保存队列
          queueRequestForSaving(request);
        }
      } catch (error: any) {
        console.error('Failed to fetch response:', error);
        
        // 如果获取响应失败，使用原始状态码
        request.response = {
          status: details.statusCode,
          statusText: details.statusLine?.split(' ').slice(1).join(' ') || '',
          error: `Failed to capture: ${error.message || 'Unknown error'}`
        };
        
        // 如果不是Diff请求，仍然保存
        if (!isDiffRequest) {
          queueRequestForSaving(request);
        }
      }
    } catch (error: any) {
      console.error('Failed to capture response:', error);
      
      // 保存错误信息
      request.response = {
        error: `Failed to capture: ${error.message || 'Unknown error'}`
      };
      
      // 如果不是Diff请求，仍然保存
      if (!(request.requestHeaders && 
           (request.requestHeaders['X-API-Diff-Request'] === '1' ||
            request.requestHeaders['x-api-diff-request'] === '1'))) {
        queueRequestForSaving(request);
      }
    } finally {
      // 清理临时存储的请求数据
      requestMap.delete(details.requestId);
    }
  },
  { urls: ["<all_urls>"] }
);

// 监听请求错误
chrome.webRequest.onErrorOccurred.addListener(
  (details) => {
    if (!isCapturing || !currentSessionId) return;
    
    const request = requestMap.get(details.requestId);
    if (!request) return;
    
    // 记录错误信息
    request.response = {
      error: details.error || 'Unknown error',
      status: 0,
      statusText: 'Error'
    };
    
    // 添加到保存队列
    queueRequestForSaving(request);
    
    // 清理临时存储的请求数据
    requestMap.delete(details.requestId);
  },
  { urls: ["<all_urls>"] }
);

// 监听来自 popup 的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Background: Received message:', message);
  
  try {
    switch (message.type) {
      case 'GET_CAPTURE_STATUS':
        sendResponse({ 
          isCapturing, 
          sessionId: currentSessionId,
          requestCount: requestCounter,
          queueLength: saveBatchQueue.length
        });
        break;
      
      case 'START_CAPTURE':
        console.log('Background: Starting capture...');
        // 使用 Promise.resolve().then() 确保这个函数完成后才发送响应
        Promise.resolve().then(async () => {
          try {
            // 重置计数器和集合
            requestCounter = 0;
            requestMap.clear();
            urlCaptureCount.clear();
            saveBatchQueue.length = 0;
            
            const session = await storageManager.createSession();
            isCapturing = true;
            currentSessionId = session.id;
            sessionStartTime = Date.now();
            
            console.log('Background: Capture started with session ID:', session.id);
            sendResponse({ success: true, sessionId: session.id });
          } catch (error: any) {
            console.error('Background: Failed to start capture:', error);
            sendResponse({ success: false, error: error.message || 'Failed to create session' });
          }
        });
        // 返回 true 告诉 Chrome 我们将异步发送响应
        return true;
      
      case 'STOP_CAPTURE':
        console.log('Background: Stopping capture...');
        Promise.resolve().then(async () => {
          try {
            const result = await stopCapture('manual');
            sendResponse(result || { success: true });
          } catch (error: any) {
            console.error('Background: Failed to stop capture:', error);
            sendResponse({ success: false, error: error.message || 'Failed to stop capture' });
          }
        });
        // 返回 true 告诉 Chrome 我们将异步发送响应
        return true;
      
      default:
        console.error('Background: Unknown message type:', message.type);
        sendResponse({ success: false, error: 'Unknown message type' });
    }
  } catch (error: any) {
    console.error('Background: Error processing message:', error);
    sendResponse({ success: false, error: error.message || 'Error processing message' });
  }
  
  // 如果我们没有异步发送响应，就不需要返回 true
  return false;
});

console.log('Background script loaded'); 