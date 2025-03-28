import { RequestData, StorageData } from '../utils/types';

// 存储捕获的请求
let capturedRequests: RequestData[] = [];
let isCapturing = false;

// 初始化时从存储中恢复状态
chrome.storage.local.get(['isCapturing'], (result) => {
  if (result.isCapturing !== undefined) {
    isCapturing = result.isCapturing;
  }
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
        headers: {},
        response: null
      };
      
      capturedRequests.push(requestData);
      saveToStorage();
    }
  },
  { urls: ["<all_urls>"] },
  ["requestBody"]
);

// 监听请求头
chrome.webRequest.onSendHeaders.addListener(
  (details) => {
    const request = capturedRequests.find(r => r.id === details.requestId);
    if (request) {
      // 将 HttpHeader[] 转换为 Record<string, string>
      const headers: Record<string, string> = {};
      details.requestHeaders?.forEach(header => {
        if (header.name && header.value) {
          headers[header.name] = header.value;
        }
      });
      request.headers = headers;
      saveToStorage();
    }
  },
  { urls: ["<all_urls>"] },
  ["requestHeaders"]
);

// 监听响应
chrome.webRequest.onCompleted.addListener(
  async (details) => {
    const request = capturedRequests.find(r => r.id === details.requestId);
    if (request) {
      try {
        const response = await fetch(request.url, {
          method: request.method,
          headers: request.headers,
          body: request.requestBody?.raw?.[0]?.bytes
        });
        const responseData = await response.json();
        request.response = responseData;
        saveToStorage();
      } catch (error) {
        console.error('Failed to capture response:', error);
      }
    }
  },
  { urls: ["<all_urls>"] }
);

// 保存到 Chrome 存储
function saveToStorage() {
  const storageData: StorageData = {
    requests: capturedRequests,
    groups: []
  };
  chrome.storage.local.set({ apiDiffData: storageData });
}

// 监听来自 popup 的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Received message:', message);
  
  switch (message.type) {
    case 'GET_CAPTURE_STATUS':
      sendResponse({ isCapturing });
      break;
    
    case 'GET_CAPTURED_REQUESTS':
      sendResponse({ requests: capturedRequests });
      break;
    
    case 'START_CAPTURE':
      isCapturing = true;
      capturedRequests = []; // 清空之前的请求
      chrome.storage.local.set({ isCapturing: true }); // 保存状态
      sendResponse({ success: true });
      break;
    
    case 'STOP_CAPTURE':
      isCapturing = false;
      saveToStorage(); // 保存最终结果
      chrome.storage.local.set({ isCapturing: false }); // 保存状态
      sendResponse({ success: true });
      break;
    
    default:
      sendResponse({ error: 'Unknown message type' });
  }
  
  return true; // 保持消息通道开放
});

console.log('Background script loaded'); 