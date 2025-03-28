import { RequestData } from '../utils/types';
import { StorageManager } from '../utils/storage';

const storageManager = StorageManager.getInstance();
let isCapturing = false;

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
        id: details.requestId,
        url: details.url,
        method: details.method,
        timestamp: Date.now(),
        requestBody: details.requestBody ? {
          raw: details.requestBody.raw?.map(data => ({
            bytes: data.bytes || new ArrayBuffer(0)
          }))
        } : undefined,
        requestHeaders: {},
        response: null
      };
      
      storageManager.saveRequest(requestData).catch(error => {
        console.error('Failed to save request:', error);
      });
    }
  },
  { urls: ["<all_urls>"] },
  ["requestBody"]
);

// 监听请求头
chrome.webRequest.onSendHeaders.addListener(
  (details) => {
    if (!isCapturing) return;
    
    // 将 HttpHeader[] 转换为 Record<string, string>
    const headers: Record<string, string> = {};
    details.requestHeaders?.forEach(header => {
      if (header.name && header.value) {
        headers[header.name] = header.value;
      }
    });

    storageManager.getSessions().then(sessions => {
      const currentSession = sessions.find(s => s.status === 'capturing');
      if (currentSession) {
        return storageManager.getSessionRequests(currentSession.id);
      }
      return [];
    }).then(requests => {
      const request = requests.find(r => r.id === details.requestId);
      if (request) {
        request.requestHeaders = headers;
        return storageManager.saveRequest(request);
      }
    }).catch(error => {
      console.error('Failed to update request headers:', error);
    });
  },
  { urls: ["<all_urls>"] },
  ["requestHeaders"]
);

// 监听响应
chrome.webRequest.onCompleted.addListener(
  (details) => {
    if (!isCapturing) return;

    storageManager.getSessions().then(sessions => {
      const currentSession = sessions.find(s => s.status === 'capturing');
      if (currentSession) {
        return storageManager.getSessionRequests(currentSession.id);
      }
      return [];
    }).then(async requests => {
      const request = requests.find(r => r.id === details.requestId);
      if (request) {
        try {
          const response = await fetch(request.url, {
            method: request.method,
            headers: request.requestHeaders,
            body: request.requestBody?.raw?.[0]?.bytes
          });
          
          // 保存响应头
          const responseHeaders: Record<string, string> = {};
          response.headers.forEach((value, key) => {
            responseHeaders[key] = value;
          });
          request.responseHeaders = responseHeaders;
          
          // 保存响应体
          request.response = await response.json();
          
          await storageManager.saveRequest(request);
        } catch (error) {
          console.error('Failed to capture response:', error);
        }
      }
    }).catch(error => {
      console.error('Failed to update request with response:', error);
    });
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