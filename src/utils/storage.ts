import { StorageData, RequestData, Group } from './types';

const STORAGE_KEY = 'apiDiffData';

export async function getStorageData(): Promise<StorageData> {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return result[STORAGE_KEY] || { requests: [], groups: [] };
}

export async function saveStorageData(data: StorageData): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: data });
}

export async function addRequest(request: RequestData): Promise<void> {
  const data = await getStorageData();
  data.requests.push(request);
  await saveStorageData(data);
}

export async function updateRequest(request: RequestData): Promise<void> {
  const data = await getStorageData();
  const index = data.requests.findIndex(r => r.id === request.id);
  if (index !== -1) {
    data.requests[index] = request;
    await saveStorageData(data);
  }
}

export async function deleteRequest(requestId: string): Promise<void> {
  const data = await getStorageData();
  data.requests = data.requests.filter(r => r.id !== requestId);
  await saveStorageData(data);
}

export async function addGroup(group: Group): Promise<void> {
  const data = await getStorageData();
  data.groups.push(group);
  await saveStorageData(data);
}

export async function updateGroup(group: Group): Promise<void> {
  const data = await getStorageData();
  const index = data.groups.findIndex(g => g.id === group.id);
  if (index !== -1) {
    data.groups[index] = group;
    await saveStorageData(data);
  }
}

export async function deleteGroup(groupId: string): Promise<void> {
  const data = await getStorageData();
  data.groups = data.groups.filter(g => g.id !== groupId);
  // 移除该分组下的所有请求
  data.requests = data.requests.filter(r => r.groupId !== groupId);
  await saveStorageData(data);
}

export async function moveRequestToGroup(requestId: string, groupId: string): Promise<void> {
  const data = await getStorageData();
  const request = data.requests.find(r => r.id === requestId);
  if (request) {
    request.groupId = groupId;
    await saveStorageData(data);
  }
} 