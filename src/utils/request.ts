import { RequestData } from './types';

export async function replayRequest(request: RequestData): Promise<any> {
  try {
    const response = await fetch(request.url, {
      method: request.method,
      headers: request.headers,
      body: request.requestBody?.raw?.[0]?.bytes
    });
    return await response.json();
  } catch (error) {
    console.error('Failed to replay request:', error);
    throw error;
  }
}

export async function modifyAndReplayRequest(
  originalRequest: RequestData,
  modifications: {
    url?: string;
    method?: string;
    headers?: Record<string, string>;
    body?: any;
  }
): Promise<any> {
  const modifiedRequest = { ...originalRequest };
  
  if (modifications.url) {
    modifiedRequest.url = modifications.url;
  }
  
  if (modifications.method) {
    modifiedRequest.method = modifications.method;
  }
  
  if (modifications.headers) {
    modifiedRequest.headers = {
      ...modifiedRequest.headers,
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
    headers: request.headers,
    body: parseRequestBody(request)
  };
} 