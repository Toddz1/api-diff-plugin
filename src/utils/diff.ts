import { RequestData, DiffResult } from './types';

export function compareRequests(request1: RequestData, request2: RequestData): DiffResult {
  const result: DiffResult = {
    requestDiff: {},
    responseDiff: {
      before: request1.response,
      after: request2.response,
      differences: []
    }
  };

  // 比较 URL
  if (request1.url !== request2.url) {
    result.requestDiff.url = {
      before: request1.url,
      after: request2.url
    };
  }

  // 比较方法
  if (request1.method !== request2.method) {
    result.requestDiff.method = {
      before: request1.method,
      after: request2.method
    };
  }

  // 比较请求头
  const headerDiff = compareHeaders(request1.headers, request2.headers);
  if (Object.keys(headerDiff.before).length > 0 || Object.keys(headerDiff.after).length > 0) {
    result.requestDiff.headers = headerDiff;
  }

  // 比较请求体
  const body1 = request1.requestBody?.raw?.[0]?.bytes;
  const body2 = request2.requestBody?.raw?.[0]?.bytes;
  if (body1 || body2) {
    const bodyDiff = compareBodies(body1, body2);
    if (bodyDiff) {
      result.requestDiff.body = bodyDiff;
    }
  }

  // 比较响应
  result.responseDiff.differences = compareResponses(
    request1.response,
    request2.response
  );

  return result;
}

function compareHeaders(headers1: Record<string, string>, headers2: Record<string, string>) {
  const before: Record<string, string> = {};
  const after: Record<string, string> = {};
  
  const allKeys = new Set([...Object.keys(headers1), ...Object.keys(headers2)]);
  
  for (const key of allKeys) {
    if (headers1[key] !== headers2[key]) {
      if (headers1[key]) before[key] = headers1[key];
      if (headers2[key]) after[key] = headers2[key];
    }
  }
  
  return { before, after };
}

function compareBodies(body1: ArrayBuffer | undefined, body2: ArrayBuffer | undefined) {
  try {
    const str1 = body1 ? new TextDecoder().decode(body1) : '';
    const str2 = body2 ? new TextDecoder().decode(body2) : '';
    
    if (str1 !== str2) {
      return {
        before: str1 ? JSON.parse(str1) : null,
        after: str2 ? JSON.parse(str2) : null
      };
    }
  } catch (error) {
    console.error('Failed to compare bodies:', error);
  }
  return null;
}

function compareResponses(response1: any, response2: any): Array<{
  path: string;
  type: 'type_mismatch' | 'value_mismatch';
  before: any;
  after: any;
}> {
  const differences: Array<{
    path: string;
    type: 'type_mismatch' | 'value_mismatch';
    before: any;
    after: any;
  }> = [];
  
  if (typeof response1 !== typeof response2) {
    differences.push({
      type: 'type_mismatch',
      path: '',
      before: response1,
      after: response2
    });
    return differences;
  }

  if (typeof response1 === 'object' && response1 !== null) {
    compareObjects(response1, response2, '', differences);
  } else if (response1 !== response2) {
    differences.push({
      type: 'value_mismatch',
      path: '',
      before: response1,
      after: response2
    });
  }

  return differences;
}

function compareObjects(obj1: any, obj2: any, path: string, differences: Array<{
  path: string;
  type: 'type_mismatch' | 'value_mismatch';
  before: any;
  after: any;
}>) {
  const allKeys = new Set([...Object.keys(obj1), ...Object.keys(obj2)]);
  
  for (const key of allKeys) {
    const currentPath = path ? `${path}.${key}` : key;
    const val1 = obj1[key];
    const val2 = obj2[key];
    
    if (typeof val1 !== typeof val2) {
      differences.push({
        type: 'type_mismatch',
        path: currentPath,
        before: val1,
        after: val2
      });
      continue;
    }
    
    if (typeof val1 === 'object' && val1 !== null) {
      compareObjects(val1, val2, currentPath, differences);
    } else if (val1 !== val2) {
      differences.push({
        type: 'value_mismatch',
        path: currentPath,
        before: val1,
        after: val2
      });
    }
  }
} 