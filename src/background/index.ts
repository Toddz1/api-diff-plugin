import { RequestData } from '../utils/types';
import { storageManager } from '../utils/storage';

let isCapturing = false;
let currentSessionId: string | null = null;

// 用于存储请求数据的临时 Map
const requestMap = new Map<string, RequestData>();

// 生成唯一的请求 ID
function generateRequestId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `${timestamp}_${random}`;
}

// 保存请求到存储
async function saveRequest(requestId: string) {
  const request = requestMap.get(requestId);
  if (!request || !currentSessionId) return;

  try {
    await storageManager.saveRequest(currentSessionId, request);
  } catch (error: any) {
    console.error('Failed to save request:', error);
  }
}

// 初始化
chrome.runtime.onInstalled.addListener(() => {
  storageManager.initialize().catch((error: Error) => {
    console.error('Failed to initialize storage:', error);
  });
});

// 监听网络请求
chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    if (!isCapturing || !currentSessionId) return;
    // 只捕获 XHR 和 Fetch 请求
    if (details.type === 'xmlhttprequest') {
      const customRequestId = generateRequestId();
      const requestData: RequestData = {
        id: customRequestId,
        url: details.url,
        method: details.method,
        timestamp: Date.now(),
        requestHeaders: {},
        requestBody: details.requestBody ? details.requestBody.raw?.[0]?.bytes : undefined
      };
      
      // 存储请求数据到临时 Map
      requestMap.set(details.requestId, requestData);
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
      // 使用 Fetch API 重新发送请求以获取响应体
      const response = await fetch(request.url, {
        method: request.method,
        headers: request.requestHeaders,
        body: request.requestBody
      });
      
      // 保存响应体
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        request.response = await response.json();
      } else {
        request.response = await response.text();
      }
      
      // 保存完整的请求数据
      await saveRequest(details.requestId);
    } catch (error: any) {
      console.error('Failed to capture response:', error);
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
    // 清理临时存储的请求数据
    requestMap.delete(details.requestId);
  },
  { urls: ["<all_urls>"] }
);

// 监听来自 popup 的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Received message:', message);
  
  switch (message.type) {
    case 'GET_CAPTURE_STATUS':
      sendResponse({ isCapturing });
      break;
    
    case 'START_CAPTURE':
      storageManager.createSession().then(session => {
        isCapturing = true;
        currentSessionId = session.id;
        sendResponse({ success: true });
      }).catch((error: Error) => {
        console.error('Failed to start capture:', error);
        sendResponse({ success: false, error: error.message });
      });
      break;
    
    case 'STOP_CAPTURE':
      if (currentSessionId) {
        storageManager.updateSession({
          id: currentSessionId,
          timestamp: Date.now(),
          status: 'completed',
          requestCount: requestMap.size
        }).then(() => {
          isCapturing = false;
          currentSessionId = null;
          // 清理所有临时存储的请求数据
          requestMap.clear();
          sendResponse({ success: true });
        }).catch((error: Error) => {
          console.error('Failed to stop capture:', error);
          sendResponse({ success: false, error: error.message });
        });
      } else {
        sendResponse({ success: false, error: 'No active session' });
      }
      break;
    
    default:
      sendResponse({ error: 'Unknown message type' });
  }
  
  return true;
});

console.log('Background script loaded'); 