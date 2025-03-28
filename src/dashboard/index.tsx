import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { RequestData, CaptureSession, PaginationOptions, SearchOptions } from '../utils/types';
import { storageManager, initializeStorage } from '../utils/storage';
import './styles.css';

const DEFAULT_SEARCH_OPTIONS: SearchOptions = {
  query: '',
  fields: {
    url: true,
    requestHeaders: false,
    requestBody: false,
    responseHeaders: false,
    responseBody: false
  }
};

const DEFAULT_PAGINATION: PaginationOptions = {
  pageSize: 50,
  page: 0
};

const Dashboard: React.FC = () => {
  const [sessions, setSessions] = useState<CaptureSession[]>([]);
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [requests, setRequests] = useState<RequestData[]>([]);
  const [pagination, setPagination] = useState<PaginationOptions>(DEFAULT_PAGINATION);
  const [searchOptions, setSearchOptions] = useState<SearchOptions>(DEFAULT_SEARCH_OPTIONS);
  const [totalRequests, setTotalRequests] = useState(0);
  const [customPageSize, setCustomPageSize] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const initializeDashboard = async () => {
      try {
        setIsLoading(true);
        setError(null);
        
        // 初始化存储
        await initializeStorage();
        
        // 加载会话和设置
        const [sessions, settings] = await Promise.all([
          storageManager.getSessions(),
          storageManager.getSettings()
        ]);

        // 设置会话列表，按时间戳降序排序
        if (Array.isArray(sessions)) {
          setSessions(sessions.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)));
        } else {
          setSessions([]);
        }

        // 设置分页选项，使用设置中的值或默认值
        if (settings?.pagination?.pageSize) {
          setPagination(prev => ({
            ...prev,
            pageSize: settings.pagination.pageSize
          }));
        }

      } catch (err) {
        console.error('Failed to initialize dashboard:', err);
        setError('Failed to load dashboard data. Please try refreshing the page.');
      } finally {
        setIsLoading(false);
      }
    };

    initializeDashboard();
  }, []);

  useEffect(() => {
    if (selectedSession) {
      loadRequests().catch(err => {
        console.error('Failed to load requests:', err);
        setError('Failed to load requests. Please try selecting the session again.');
      });
    }
  }, [selectedSession, pagination, searchOptions]);

  const loadRequests = async () => {
    if (!selectedSession) return;

    setIsLoading(true);
    setError(null);

    try {
      const allRequests = await storageManager.getSessionRequests(
        selectedSession,
        undefined,
        searchOptions.query ? searchOptions : undefined
      );
      setTotalRequests(allRequests.length);

      const pagedRequests = await storageManager.getSessionRequests(
        selectedSession,
        pagination,
        searchOptions.query ? searchOptions : undefined
      );
      setRequests(pagedRequests);
    } catch (err) {
      console.error('Failed to load requests:', err);
      setError('Failed to load requests. Please try again.');
      setRequests([]);
      setTotalRequests(0);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePageSizeChange = async (size: number) => {
    setPagination({ pageSize: size, page: 0 });
  };

  const handleCustomPageSize = () => {
    const size = parseInt(customPageSize);
    if (size > 0) {
      handlePageSizeChange(size);
      setCustomPageSize('');
    }
  };

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

  if (isLoading && !selectedSession) {
    return (
      <div className="dashboard loading">
        <div className="loading-spinner">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="dashboard error">
        <div className="error-message">
          <h2>Error</h2>
          <p>{error}</p>
          <button onClick={() => window.location.reload()}>Refresh Page</button>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1>API Diff Dashboard</h1>
        <div className="search-container">
          <input
            type="text"
            placeholder="Search requests..."
            value={searchOptions.query}
            onChange={e => setSearchOptions(prev => ({
              ...prev,
              query: e.target.value
            }))}
          />
          <div className="search-options">
            {Object.entries(searchOptions.fields).map(([key, value]) => (
              <label key={key}>
                <input
                  type="checkbox"
                  checked={value}
                  onChange={e => setSearchOptions(prev => ({
                    ...prev,
                    fields: {
                      ...prev.fields,
                      [key]: e.target.checked
                    }
                  }))}
                />
                {key.replace(/([A-Z])/g, ' $1').toLowerCase()}
              </label>
            ))}
          </div>
        </div>
      </header>
      
      <div className="dashboard-content">
        <aside className="sessions-panel">
          <h2>Capture Sessions</h2>
          <div className="sessions-list">
            {sessions.length === 0 ? (
              <div className="no-sessions">
                <p>No capture sessions available</p>
                <p>Start capturing API requests from the extension popup</p>
              </div>
            ) : (
              sessions.map(session => (
                <div
                  key={session.id}
                  className={`session-item ${selectedSession === session.id ? 'selected' : ''}`}
                  onClick={() => setSelectedSession(session.id)}
                >
                  <div className="session-header">
                    <span className="session-id">{session.id}</span>
                    <span className={`session-status ${session.status}`}>
                      {session.status}
                    </span>
                  </div>
                  <div className="session-info">
                    <span className="session-time">
                      {formatTimestamp(session.timestamp)}
                    </span>
                    <span className="session-count">
                      {session.requestCount} requests
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </aside>

        <main className="requests-panel">
          {selectedSession ? (
            <>
              <div className="requests-header">
                <h2>Requests ({totalRequests})</h2>
                <div className="pagination-controls">
                  <select
                    value={pagination.pageSize}
                    onChange={e => handlePageSizeChange(Number(e.target.value))}
                  >
                    {[10, 50, 100, 500].map(size => (
                      <option key={size} value={size}>
                        {size} per page
                      </option>
                    ))}
                  </select>
                  <div className="custom-page-size">
                    <input
                      type="number"
                      placeholder="Custom size"
                      value={customPageSize}
                      onChange={e => setCustomPageSize(e.target.value)}
                      min="1"
                    />
                    <button onClick={handleCustomPageSize}>Apply</button>
                  </div>
                  <div className="page-navigation">
                    <button
                      disabled={pagination.page === 0}
                      onClick={() => setPagination(prev => ({
                        ...prev,
                        page: prev.page - 1
                      }))}
                    >
                      Previous
                    </button>
                    <span>
                      Page {pagination.page + 1} of{' '}
                      {Math.ceil(totalRequests / pagination.pageSize)}
                    </span>
                    <button
                      disabled={
                        (pagination.page + 1) * pagination.pageSize >= totalRequests
                      }
                      onClick={() => setPagination(prev => ({
                        ...prev,
                        page: prev.page + 1
                      }))}
                    >
                      Next
                    </button>
                  </div>
                </div>
              </div>

              <div className="requests-list">
                {isLoading ? (
                  <div className="loading-requests">Loading requests...</div>
                ) : requests.length === 0 ? (
                  <div className="no-requests">
                    <p>No requests found</p>
                    {searchOptions.query && (
                      <p>Try adjusting your search criteria</p>
                    )}
                  </div>
                ) : (
                  requests.map(request => (
                    <div key={request.id} className="request-item">
                      <div className="request-header">
                        <span className={`method ${request.method.toLowerCase()}`}>
                          {request.method}
                        </span>
                        <span className="url" title={request.url}>
                          {request.url}
                        </span>
                      </div>
                      <div className="request-info">
                        <span className="request-timestamp">
                          {formatTimestamp(request.timestamp)}
                        </span>
                        <span className="request-id">
                          request_id: {request.id}
                        </span>
                      </div>
                      <div className="request-details">
                        <h3>Request Headers</h3>
                        <pre>{formatJson(request.requestHeaders)}</pre>
                        
                        {request.requestBody && (
                          <>
                            <h3>Request Body</h3>
                            <pre>{formatJson(request.requestBody)}</pre>
                          </>
                        )}

                        {request.responseHeaders && (
                          <>
                            <h3>Response Headers</h3>
                            <pre>{formatJson(request.responseHeaders)}</pre>
                          </>
                        )}
                        
                        {request.response && (
                          <>
                            <h3>Response Body</h3>
                            <pre>{formatJson(request.response)}</pre>
                          </>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          ) : (
            <div className="no-session-selected">
              <p>Select a capture session to view requests</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

// 确保在 DOM 加载完成后再渲染
document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('root');
  if (container) {
    const root = createRoot(container);
    root.render(
      <React.StrictMode>
        <Dashboard />
      </React.StrictMode>
    );
  } else {
    console.error('Root element not found');
  }
}); 