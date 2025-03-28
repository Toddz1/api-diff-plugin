import { RequestData } from './types';

export function modifyRequest(request: RequestData, modifications: {
  url?: string;
  method?: string;
  headers?: Record<string, string>;
  body?: any;
}): RequestData {
  const modifiedRequest: RequestData = {
    ...request,
    url: modifications.url || request.url,
    method: modifications.method || request.method,
    requestHeaders: modifications.headers || request.requestHeaders
  };

  if (modifications.body) {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(JSON.stringify(modifications.body));
    modifiedRequest.requestBody = {
      raw: [{
        bytes: bytes.buffer as ArrayBuffer
      }]
    };
  }

  return modifiedRequest;
}

export function replayRequest(request: RequestData): Promise<RequestData> {
  return new Promise(async (resolve, reject) => {
    try {
      const modifiedRequest: RequestData = {
        ...request,
        id: `${request.id}_replay_${Date.now()}`,
        timestamp: Date.now()
      };

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
      modifiedRequest.responseHeaders = responseHeaders;

      // 保存响应体
      modifiedRequest.response = await response.json();

      resolve(modifiedRequest);
    } catch (error) {
      reject(error);
    }
  });
}

export async function modifyAndReplayRequest(
  originalRequest: RequestData,
  modifications: {
    url?: string;
    method?: string;
    headers?: Record<string, string>;
    body?: any;
  }
): Promise<RequestData> {
  const modifiedRequest = { ...originalRequest };
  
  if (modifications.url) {
    modifiedRequest.url = modifications.url;
  }
  
  if (modifications.method) {
    modifiedRequest.method = modifications.method;
  }
  
  if (modifications.headers) {
    modifiedRequest.requestHeaders = {
      ...modifiedRequest.requestHeaders,
      ...modifications.headers
    };
  }
  
  if (modifications.body) {
    const bodyStr = JSON.stringify(modifications.body);
    const encoder = new TextEncoder();
    const bytes = encoder.encode(bodyStr);
    modifiedRequest.requestBody = {
      raw: [{
        bytes: new ArrayBuffer(bytes.buffer.byteLength)
      }]
    };
    if (modifiedRequest.requestBody?.raw?.[0]?.bytes) {
      new Uint8Array(modifiedRequest.requestBody.raw[0].bytes).set(bytes);
    }
  }
  
  return await replayRequest(modifiedRequest);
}

export function parseRequestBody(request: RequestData): any {
  if (!request.requestBody?.raw?.[0]?.bytes) {
    return null;
  }
  
  try {
    const decoder = new TextDecoder();
    const bodyStr = decoder.decode(request.requestBody.raw[0].bytes);
    return JSON.parse(bodyStr);
  } catch (error) {
    console.error('Failed to parse request body:', error);
    return null;
  }
}

export function formatRequestForDisplay(request: RequestData): {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: any;
} {
  return {
    url: request.url,
    method: request.method,
    headers: request.requestHeaders,
    body: parseRequestBody(request)
  };
} 