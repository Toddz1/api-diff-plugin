import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { RequestData, StorageData } from '../utils/types';
import './styles.css';

const Dashboard: React.FC = () => {
  const [requests, setRequests] = useState<RequestData[]>([]);
  const [selectedRequest, setSelectedRequest] = useState<RequestData | null>(null);

  useEffect(() => {
    // 加载存储的请求数据
    chrome.storage.local.get(['apiDiffData'], (result) => {
      if (result.apiDiffData) {
        const data = result.apiDiffData as StorageData;
        setRequests(data.requests || []);
      }
    });

    // 监听存储变化
    chrome.storage.onChanged.addListener((changes) => {
      if (changes.apiDiffData) {
        const data = changes.apiDiffData.newValue as StorageData;
        setRequests(data.requests || []);
      }
    });
  }, []);

  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  const formatJson = (data: any) => {
    try {
      return JSON.stringify(data, null, 2);
    } catch (e) {
      return 'Unable to parse data';
    }
  };

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1>API Diff Dashboard</h1>
      </header>
      
      <div className="dashboard-content">
        <main className="requests-panel">
          <h2>Captured Requests ({requests.length})</h2>
          <div className="requests-list">
            {requests.map(request => (
              <div 
                key={request.id} 
                className="request-item"
                onClick={() => setSelectedRequest(
                  selectedRequest?.id === request.id ? null : request
                )}
              >
                <div className="request-header">
                  <span className={`method ${request.method.toLowerCase()}`}>
                    {request.method}
                  </span>
                  <span className="url" title={request.url}>
                    {request.url}
                  </span>
                </div>
                <div className="request-timestamp">
                  {formatTimestamp(request.timestamp)}
                </div>
                {selectedRequest?.id === request.id && (
                  <div className="request-details">
                    <h3>Headers</h3>
                    <pre>{formatJson(request.headers)}</pre>
                    {request.requestBody && (
                      <>
                        <h3>Request Body</h3>
                        <pre>{formatJson(request.requestBody)}</pre>
                      </>
                    )}
                    {request.response && (
                      <>
                        <h3>Response</h3>
                        <pre>{formatJson(request.response)}</pre>
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </main>
      </div>
    </div>
  );
};

const init = () => {
  const rootElement = document.getElementById('root');
  if (rootElement) {
    const root = createRoot(rootElement);
    root.render(
      <React.StrictMode>
        <Dashboard />
      </React.StrictMode>
    );
  }
};

document.addEventListener('DOMContentLoaded', init); 