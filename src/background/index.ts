import { RequestData } from '../utils/types';
import { StorageManager } from '../utils/storage';

const storageManager = StorageManager.getInstance();
let isCapturing = false;

// 生成唯一的请求 ID
function generateRequestId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `${timestamp}_${random}`;
}

// 初始化
chrome.runtime.onInstalled.addListener(() => {
  storageManager.initialize().catch(error => {
    console.error('Failed to initialize storage:', error);
  });
});

// 监听网络请求
chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    if (!isCapturing) return;
    // 只捕获 XHR 和 Fetch 请求
    if (details.type === 'xmlhttprequest') {
      const requestData: RequestData = {
        id: generateRequestId(),
        url: details.url,
        method: details.method,
        timestamp: Date.now(),
        requestBody: details.requestBody ? {
          raw: details.requestBody.raw?.map(data => ({
            bytes: data.bytes || new ArrayBuffer(0)
          }))
        } : undefined,
        requestHeaders: {},
        responseHeaders: {},
        response: null
      };
      
      // 存储 requestId 映射关系
      requestIdMap.set(details.requestId, requestData.id);
      
      storageManager.saveRequest(requestData).catch(error => {
        console.error('Failed to save request:', error);
      });
    }
  },
  { urls: ["<all_urls>"] },
  ["requestBody"]
);

// 用于存储 Chrome requestId 到自定义 requestId 的映射
const requestIdMap = new Map<string, string>();

// 监听请求头
chrome.webRequest.onBeforeSendHeaders.addListener(
  (details) => {
    if (!isCapturing) return;
    console.log('Captured request headers:', details.requestHeaders);
    
    // 将 HttpHeader[] 转换为 Record<string, string>
    const headers: Record<string, string> = {};
    details.requestHeaders?.forEach(header => {
      if (header.name && header.value) {
        headers[header.name] = header.value;
      }
    });

    const customRequestId = requestIdMap.get(details.requestId);
    if (!customRequestId) return;

    storageManager.getSessions().then(sessions => {
      const currentSession = sessions.find(s => s.status === 'capturing');
      if (currentSession) {
        return storageManager.getSessionRequests(currentSession.id);
      }
      return [];
    }).then(requests => {
      const request = requests.find(r => r.id === customRequestId);
      if (request) {
        request.requestHeaders = headers;
        return storageManager.saveRequest(request);
      }
    }).catch(error => {
      console.error('Failed to update request headers:', error);
    });
  },
  { urls: ["<all_urls>"] },
  ["requestHeaders", "extraHeaders"]
);

// 监听响应头
chrome.webRequest.onHeadersReceived.addListener(
  (details) => {
    if (!isCapturing) return;
    
    // 将 HttpHeader[] 转换为 Record<string, string>
    const headers: Record<string, string> = {};
    details.responseHeaders?.forEach(header => {
      if (header.name && header.value) {
        headers[header.name] = header.value;
      }
    });

    const customRequestId = requestIdMap.get(details.requestId);
    if (!customRequestId) return;

    storageManager.getSessions().then(sessions => {
      const currentSession = sessions.find(s => s.status === 'capturing');
      if (currentSession) {
        return storageManager.getSessionRequests(currentSession.id);
      }
      return [];
    }).then(requests => {
      const request = requests.find(r => r.id === customRequestId);
      if (request) {
        request.responseHeaders = headers;
        return storageManager.saveRequest(request);
      }
    }).catch(error => {
      console.error('Failed to update response headers:', error);
    });
  },
  { urls: ["<all_urls>"] },
  ["responseHeaders", "extraHeaders"]
);

// 监听响应体
chrome.webRequest.onResponseStarted.addListener(
  (details) => {
    if (!isCapturing) return;

    const customRequestId = requestIdMap.get(details.requestId);
    if (!customRequestId) return;

    storageManager.getSessions().then(sessions => {
      const currentSession = sessions.find(s => s.status === 'capturing');
      if (currentSession) {
        return storageManager.getSessionRequests(currentSession.id);
      }
      return [];
    }).then(async requests => {
      const request = requests.find(r => r.id === customRequestId);
      if (request) {
        try {
          // 使用 Fetch API 重新发送请求以获取响应体
          const response = await fetch(request.url, {
            method: request.method,
            headers: request.requestHeaders,
            body: request.requestBody?.raw?.[0]?.bytes
          });
          
          // 保存响应体
          const contentType = response.headers.get('content-type');
          if (contentType && contentType.includes('application/json')) {
            request.response = await response.json();
          } else {
            request.response = await response.text();
          }
          
          await storageManager.saveRequest(request);
          
          // 清理 requestId 映射
          requestIdMap.delete(details.requestId);
        } catch (error) {
          console.error('Failed to capture response:', error);
        }
      }
    }).catch(error => {
      console.error('Failed to update request with response:', error);
    });
  },
  { urls: ["<all_urls>"] },
  ["responseHeaders"]
);

// 监听来自 popup 的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Received message:', message);
  
  switch (message.type) {
    case 'GET_CAPTURE_STATUS':
      sendResponse({ isCapturing });
      break;
    
    case 'START_CAPTURE':
      storageManager.createSession().then(() => {
        isCapturing = true;
        sendResponse({ success: true });
      }).catch(error => {
        console.error('Failed to start capture:', error);
        sendResponse({ success: false, error: error.message });
      });
      break;
    
    case 'STOP_CAPTURE':
      storageManager.endCurrentSession().then(() => {
        isCapturing = false;
        sendResponse({ success: true });
      }).catch(error => {
        console.error('Failed to stop capture:', error);
        sendResponse({ success: false, error: error.message });
      });
      break;
    
    default:
      sendResponse({ error: 'Unknown message type' });
  }
  
  return true;
});

console.log('Background script loaded'); 