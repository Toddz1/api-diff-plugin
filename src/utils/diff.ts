import { RequestData, DiffResult } from './types';

export function diffRequests(before: RequestData, after: RequestData): DiffResult {
  const result: DiffResult = {
    requestDiff: {},
    responseDiff: {}
  };

  // Compare URLs
  if (before.url !== after.url) {
    result.requestDiff.url = {
      old: before.url,
      new: after.url
    };
  }

  // Compare methods
  if (before.method !== after.method) {
    result.requestDiff.method = {
      old: before.method,
      new: after.method
    };
  }

  // Compare headers
  if (JSON.stringify(before.requestHeaders) !== JSON.stringify(after.requestHeaders)) {
    result.requestDiff.headers = {
      old: before.requestHeaders,
      new: after.requestHeaders
    };
  }

  // Compare request bodies
  if (JSON.stringify(before.requestBody) !== JSON.stringify(after.requestBody)) {
    result.requestDiff.body = {
      old: before.requestBody,
      new: after.requestBody
    };
  }

  // Compare response data
  if (before.response && after.response) {
    const differences = findDifferences(before.response, after.response);
    if (differences.length > 0) {
      result.responseDiff.body = {
        old: before.response,
        new: after.response
      };
    }
  }

  return result;
}

function findDifferences(before: any, after: any, path: string = ''): Array<{
  path: string;
  type: 'type_mismatch' | 'value_mismatch';
  old: any;
  new: any;
}> {
  const differences: Array<{
    path: string;
    type: 'type_mismatch' | 'value_mismatch';
    old: any;
    new: any;
  }> = [];

  if (typeof before !== typeof after) {
    differences.push({
      path,
      type: 'type_mismatch',
      old: before,
      new: after
    });
    return differences;
  }

  if (typeof before === 'object' && before !== null && after !== null) {
    const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);

    for (const key of allKeys) {
      const currentPath = path ? `${path}.${key}` : key;
      
      if (!(key in before)) {
        differences.push({
          path: currentPath,
          type: 'value_mismatch',
          old: undefined,
          new: after[key]
        });
      } else if (!(key in after)) {
        differences.push({
          path: currentPath,
          type: 'value_mismatch',
          old: before[key],
          new: undefined
        });
      } else {
        differences.push(...findDifferences(before[key], after[key], currentPath));
      }
    }
  } else if (before !== after) {
    differences.push({
      path,
      type: 'value_mismatch',
      old: before,
      new: after
    });
  }

  return differences;
} 