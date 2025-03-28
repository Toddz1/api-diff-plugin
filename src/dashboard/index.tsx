import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { RequestData, CaptureSession, PaginationOptions, SearchOptions, ModifiedRequestData } from '../utils/types';
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

const DEFAULT_DISPLAY_OPTIONS = {
  requestHeaders: true,
  requestBody: true,
  responseHeaders: true,
  responseBody: true,
  duration: true // 默认显示耗时
};

// 复制到剪贴板函数
const copyToClipboard = (text: string) => {
  navigator.clipboard.writeText(text).then(() => {
    // 可以添加一个提示，但这里保持简单
    console.log('Copied to clipboard');
  }).catch(err => {
    console.error('Failed to copy:', err);
  });
};

// 格式化 JSON 数据
const formatJson = (data: any): string => {
  try {
    return JSON.stringify(data, null, 2);
  } catch (error) {
    return String(data);
  }
};

// 可折叠的部分组件
interface CollapsibleSectionProps {
  title: string;
  content: any;
  defaultExpanded?: boolean;
}

const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({ title, content, defaultExpanded = true }) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const formattedContent = formatJson(content);

  return (
    <div className="collapsible-section">
      <div className="section-header" onClick={() => setIsExpanded(!isExpanded)}>
        <div className="header-left">
          <span className={`collapse-icon ${isExpanded ? 'expanded' : ''}`}>
            {isExpanded ? '▼' : '▶'}
          </span>
          <h3>
            {title}
            <button 
              className="copy-button"
              onClick={(e) => {
                e.stopPropagation();
                copyToClipboard(formattedContent);
              }}
              title="Copy to clipboard"
            >
              📋
            </button>
          </h3>
        </div>
      </div>
      {isExpanded && (
        <div className="section-content">
          <pre>{formattedContent}</pre>
        </div>
      )}
    </div>
  );
};

// 分页组件
interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

const Pagination: React.FC<PaginationProps> = ({ currentPage, totalPages, onPageChange }) => {
  const renderPageNumbers = () => {
    const pages = [];
    const maxVisiblePages = 7; // 最多显示的页码数
    const ellipsis = <span key="ellipsis" className="page-ellipsis">...</span>;

    if (totalPages <= maxVisiblePages) {
      // 如果总页数小于等于最大显示数，显示所有页码
      for (let i = 1; i <= totalPages; i++) {
        pages.push(
          <button
            key={i}
            className={`page-number ${currentPage + 1 === i ? 'active' : ''}`}
            onClick={() => onPageChange(i - 1)}
          >
            {i}
          </button>
        );
      }
    } else {
      // 总是显示第一页
      pages.push(
        <button
          key={1}
          className={`page-number ${currentPage + 1 === 1 ? 'active' : ''}`}
          onClick={() => onPageChange(0)}
        >
          1
        </button>
      );

      // 计算中间页码的范围
      let startPage = Math.max(2, currentPage - 1);
      let endPage = Math.min(totalPages - 1, currentPage + 3);

      // 调整范围以保持固定数量的页码
      if (currentPage <= 3) {
        endPage = 5;
      } else if (currentPage >= totalPages - 4) {
        startPage = totalPages - 4;
      }

      // 添加前面的省略号
      if (startPage > 2) {
        pages.push(ellipsis);
      }

      // 添加中间的页码
      for (let i = startPage; i <= endPage; i++) {
        pages.push(
          <button
            key={i}
            className={`page-number ${currentPage + 1 === i ? 'active' : ''}`}
            onClick={() => onPageChange(i - 1)}
          >
            {i}
          </button>
        );
      }

      // 添加后面的省略号
      if (endPage < totalPages - 1) {
        pages.push(ellipsis);
      }

      // 总是显示最后一页
      pages.push(
        <button
          key={totalPages}
          className={`page-number ${currentPage + 1 === totalPages ? 'active' : ''}`}
          onClick={() => onPageChange(totalPages - 1)}
        >
          {totalPages}
        </button>
      );
    }

    return pages;
  };

  return (
    <div className="pagination">
      <button
        className="page-nav"
        disabled={currentPage === 0}
        onClick={() => onPageChange(currentPage - 1)}
      >
        Previous
      </button>
      <div className="page-numbers">
        {renderPageNumbers()}
      </div>
      <button
        className="page-nav"
        disabled={currentPage >= totalPages - 1}
        onClick={() => onPageChange(currentPage + 1)}
      >
        Next
      </button>
    </div>
  );
};

// DiffModal 组件
interface DiffModalProps {
  request: RequestData;
  onClose: () => void;
  onSendRequest: (originalRequest: RequestData, modifiedRequest: ModifiedRequestData) => Promise<void>;
}

const DiffModal: React.FC<DiffModalProps> = ({ request, onClose, onSendRequest }) => {
  const [modifiedRequest, setModifiedRequest] = useState({
    url: request.url,
    method: request.method,
    requestHeaders: { ...request.requestHeaders },
    requestBody: request.requestBody
  });
  const [shouldResend, setShouldResend] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChange = (field: string, value: any) => {
    setModifiedRequest(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSubmit = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await onSendRequest(request, { ...modifiedRequest, shouldResend });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process request');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="modal">
      <div className="modal-content">
        <div className="modal-header">
          <h2>比较和修改请求</h2>
          <button className="close-button" onClick={onClose}>×</button>
        </div>
        
        <div className="modal-body">
          <div className="form-group">
            <label>Method:</label>
            <select 
              value={modifiedRequest.method}
              onChange={e => handleChange('method', e.target.value)}
            >
              {['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'].map(method => (
                <option key={method} value={method}>{method}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>URL:</label>
            <input
              type="text"
              value={modifiedRequest.url}
              onChange={e => handleChange('url', e.target.value)}
            />
          </div>

          <div className="form-group">
            <label>Request Headers:</label>
            <textarea
              value={JSON.stringify(modifiedRequest.requestHeaders, null, 2)}
              onChange={e => {
                try {
                  handleChange('requestHeaders', JSON.parse(e.target.value));
                } catch (err) {
                  // 如果JSON解析失败，仍然更新文本
                  handleChange('requestHeaders', e.target.value);
                }
              }}
            />
          </div>

          <div className="form-group">
            <label>Request Body:</label>
            <textarea
              value={typeof modifiedRequest.requestBody === 'string' 
                ? modifiedRequest.requestBody 
                : JSON.stringify(modifiedRequest.requestBody, null, 2)}
              onChange={e => {
                try {
                  handleChange('requestBody', JSON.parse(e.target.value));
                } catch (err) {
                  handleChange('requestBody', e.target.value);
                }
              }}
            />
          </div>

          <div className="form-group">
            <label>
              <input
                type="checkbox"
                checked={shouldResend}
                onChange={e => setShouldResend(e.target.checked)}
              />
              使用修改后的内容重新发送请求
            </label>
          </div>

          {error && <div className="error-message">{error}</div>}

          <div className="diff-preview">
            <h3>变更预览</h3>
            <div className="diff-section">
              {Object.entries(modifiedRequest).map(([key, value]) => {
                const originalValue = request[key as keyof RequestData];
                if (JSON.stringify(value) !== JSON.stringify(originalValue)) {
                  return (
                    <div key={key} className="diff-item">
                      <h4>{key}</h4>
                      <div className="diff-content">
                        <div className="original">
                          <strong>原始值:</strong>
                          <pre>{JSON.stringify(originalValue, null, 2)}</pre>
                        </div>
                        <div className="modified">
                          <strong>修改后:</strong>
                          <pre>{JSON.stringify(value, null, 2)}</pre>
                        </div>
                      </div>
                    </div>
                  );
                }
                return null;
              })}
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button 
            className="cancel-button" 
            onClick={onClose}
            disabled={isLoading}
          >
            取消
          </button>
          <button 
            className="apply-button" 
            onClick={handleSubmit}
            disabled={isLoading}
          >
            {isLoading ? '处理中...' : '应用修改'}
          </button>
        </div>
      </div>
    </div>
  );
};

// 添加一个新的完整信息模态窗口组件
interface SourceModalProps {
  request: RequestData;
  onClose: () => void;
}

const SourceModal: React.FC<SourceModalProps> = ({ request, onClose }) => {
  return (
    <div className="modal">
      <div className="modal-content large-modal">
        <div className="modal-header">
          <h2>完整请求/响应信息</h2>
          <button className="close-button" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="source-section">
            <h3>请求信息</h3>
            <div className="source-item">
              <div className="source-label">URL:</div>
              <div className="source-value">{request.url}</div>
            </div>
            <div className="source-item">
              <div className="source-label">Method:</div>
              <div className="source-value">{request.method}</div>
            </div>
            <div className="source-item">
              <div className="source-label">Timestamp:</div>
              <div className="source-value">{new Date(request.timestamp).toLocaleString()}</div>
            </div>
            {request.duration && (
              <div className="source-item">
                <div className="source-label">Duration:</div>
                <div className="source-value">{request.duration}ms</div>
              </div>
            )}
            <div className="source-item">
              <div className="source-label">Request Headers:</div>
              <div className="source-value code-block">
                <pre>{JSON.stringify(request.requestHeaders, null, 2)}</pre>
              </div>
            </div>
            {request.requestBody && (
              <div className="source-item">
                <div className="source-label">Request Body:</div>
                <div className="source-value code-block">
                  <pre>
                    {typeof request.requestBody === 'string'
                      ? request.requestBody
                      : JSON.stringify(request.requestBody, null, 2)}
                  </pre>
                </div>
              </div>
            )}
          </div>
          
          <div className="source-section">
            <h3>响应信息</h3>
            {request.response ? (
              <>
                <div className="source-item">
                  <div className="source-label">Status:</div>
                  <div className="source-value">
                    {request.response.status} {request.response.statusText}
                  </div>
                </div>
                {request.responseHeaders && (
                  <div className="source-item">
                    <div className="source-label">Response Headers:</div>
                    <div className="source-value code-block">
                      <pre>{JSON.stringify(request.responseHeaders, null, 2)}</pre>
                    </div>
                  </div>
                )}
                <div className="source-item">
                  <div className="source-label">Response Body:</div>
                  <div className="source-value code-block">
                    <pre>
                      {typeof request.response.body === 'string'
                        ? request.response.body
                        : JSON.stringify(request.response.body, null, 2)}
                    </pre>
                  </div>
                </div>
              </>
            ) : (
              <div className="no-response">No response data available</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// 修改 RequestItem 组件
const RequestItem: React.FC<{ 
  request: RequestData; 
  displayOptions: typeof DEFAULT_DISPLAY_OPTIONS;
  onSendModifiedRequest?: (originalRequest: RequestData, modifiedRequest: ModifiedRequestData) => Promise<void>;
  isSelected?: boolean;
  onCheckboxChange?: (requestId: string, checked: boolean) => void;
}> = ({ 
  request, 
  displayOptions,
  onSendModifiedRequest,
  isSelected = false,
  onCheckboxChange
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showDiffModal, setShowDiffModal] = useState(false);
  const [showSourceModal, setShowSourceModal] = useState(false);

  // 获取状态码，如果有的话
  const statusCode = request.response?.status || '';
  // 请求耗时
  const duration = request.duration;

  return (
    <div className="request-item">
      <div className="request-header">
        {onCheckboxChange && (
          <div className="request-checkbox">
            <input 
              type="checkbox"
              checked={isSelected}
              onChange={(e) => onCheckboxChange(request.id, e.target.checked)}
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        )}
        <div 
          className="request-header-content"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <span className={`method ${request.method.toLowerCase()}`}>
            {request.method}{statusCode && <span className="status-code">{` ${statusCode}`}</span>}
          </span>
          <span className="url" title={request.url}>
            {request.url}
          </span>
          {displayOptions.duration && duration !== undefined && (
            <span className="duration">{duration}ms</span>
          )}
        </div>
        <div className="request-actions">
          <button 
            className="source-button"
            onClick={(e) => {
              e.stopPropagation();
              setShowSourceModal(true);
            }}
            title="查看完整请求/响应信息"
          >
            Source
          </button>
          <button 
            className="diff-button"
            onClick={(e) => {
              e.stopPropagation();
              setShowDiffModal(true);
            }}
            title="比较和修改请求"
          >
            Diff
          </button>
        </div>
      </div>
      
      <div className="request-info">
        <span className="request-timestamp">
          {new Date(request.timestamp).toLocaleString()}
        </span>
        <span className="request-id">
          request_id: {request.id}
        </span>
      </div>
      {isExpanded && (
        <div className="request-details">
          {displayOptions.requestHeaders && (
            <CollapsibleSection 
              title="Request Headers" 
              content={request.requestHeaders} 
            />
          )}
          
          {request.requestBody && displayOptions.requestBody && (
            <CollapsibleSection 
              title="Request Body" 
              content={request.requestBody} 
            />
          )}

          {request.responseHeaders && displayOptions.responseHeaders && (
            <CollapsibleSection 
              title="Response Headers" 
              content={request.responseHeaders} 
            />
          )}
          
          {request.response && displayOptions.responseBody && (
            <CollapsibleSection 
              title="Response Body" 
              content={request.response.body} 
            />
          )}
        </div>
      )}

      {showDiffModal && (
        <DiffModal
          request={request}
          onClose={() => setShowDiffModal(false)}
          onSendRequest={onSendModifiedRequest || (async () => {})}
        />
      )}
      
      {showSourceModal && (
        <SourceModal
          request={request}
          onClose={() => setShowSourceModal(false)}
        />
      )}
    </div>
  );
};

const Dashboard: React.FC = () => {
  const [sessions, setSessions] = useState<CaptureSession[]>([]);
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [selectedSessionData, setSelectedSessionData] = useState<CaptureSession | null>(null);
  const [requests, setRequests] = useState<RequestData[]>([]);
  const [pagination, setPagination] = useState<PaginationOptions>(DEFAULT_PAGINATION);
  const [searchOptions, setSearchOptions] = useState<SearchOptions>(DEFAULT_SEARCH_OPTIONS);
  const [displayOptions, setDisplayOptions] = useState(DEFAULT_DISPLAY_OPTIONS);
  const [totalRequests, setTotalRequests] = useState(0);
  const [customPageSize, setCustomPageSize] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // 批量选择状态
  const [selectedSessions, setSelectedSessions] = useState<Set<string>>(new Set());
  const [selectedRequests, setSelectedRequests] = useState<Set<string>>(new Set());

  useEffect(() => {
    const initializeDashboard = async () => {
      try {
        console.log('Dashboard: Initializing...');
        setIsLoading(true);
        setError(null);
        
        // 初始化存储
        console.log('Dashboard: Initializing storage...');
        await initializeStorage();
        console.log('Dashboard: Storage initialized');
        
        // 加载会话和设置
        console.log('Dashboard: Loading sessions and settings...');
        const sessionsPromise = storageManager.getSessions().catch(err => {
          console.error('Dashboard: Failed to load sessions:', err);
          return [];
        });
        
        const settingsPromise = storageManager.getSettings().catch(err => {
          console.error('Dashboard: Failed to load settings:', err);
          return { pagination: { pageSize: DEFAULT_PAGINATION.pageSize, page: 0 } };
        });
        
        const [sessions, settings] = await Promise.all([sessionsPromise, settingsPromise]);
        console.log('Dashboard: Loaded sessions:', sessions.length, 'sessions found');
        console.log('Dashboard: Loaded settings:', settings);

        // 设置会话列表，按时间戳降序排序
        if (Array.isArray(sessions)) {
          setSessions(sessions.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)));
        } else {
          console.warn('Dashboard: Sessions is not an array:', sessions);
          setSessions([]);
        }

        // 设置分页选项，使用设置中的值或默认值
        if (settings && settings.pagination && typeof settings.pagination.pageSize === 'number') {
          const pageSize = settings.pagination.pageSize;
          console.log('Dashboard: Setting page size from settings:', pageSize);
          setPagination(prev => ({
            ...prev,
            pageSize
          }));
        }

        console.log('Dashboard: Initialization complete');
      } catch (err) {
        console.error('Dashboard: Failed to initialize dashboard:', err);
        setError(`Failed to load dashboard data: ${err instanceof Error ? err.message : 'Unknown error'}`);
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
    if (!selectedSession) {
      console.warn('Dashboard: No session selected, cannot load requests');
      return;
    }

    console.log(`Dashboard: Loading requests for session ${selectedSession}...`);
    setIsLoading(true);
    setError(null);

    try {
      // 重新获取最新的会话列表
      console.log('Dashboard: Refreshing sessions list...');
      const updatedSessions = await storageManager.getSessions();
      setSessions(updatedSessions.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)));

      // 查找当前选中的会话数据
      const currentSession = updatedSessions.find(s => s.id === selectedSession);
      if (currentSession) {
        setSelectedSessionData(currentSession);
      }

      // 先获取会话的所有请求（不应用搜索过滤）
      console.log(`Dashboard: Getting all requests for session ${selectedSession}...`);
      const allSessionRequests = await storageManager.getSessionRequests(
        selectedSession,
        undefined,
        undefined
      );
      
      // 更新会话的总请求数（不受搜索影响）
      if (currentSession && currentSession.requestCount !== allSessionRequests.length) {
        console.log(`Dashboard: Updating session ${selectedSession} request count from ${currentSession.requestCount} to ${allSessionRequests.length}`);
        await storageManager.updateSession({
          ...currentSession,
          requestCount: allSessionRequests.length
        });
      }
      
      // 获取搜索过滤后的请求总数
      console.log(`Dashboard: Counting filtered requests for session ${selectedSession}...`);
      const filteredRequests = await storageManager.getSessionRequests(
        selectedSession,
        undefined,
        searchOptions.query ? searchOptions : undefined
      );
      
      console.log(`Dashboard: Found ${filteredRequests.length} requests matching search criteria`);
      setTotalRequests(filteredRequests.length);

      // 获取分页请求
      console.log(`Dashboard: Loading page ${pagination.page} with size ${pagination.pageSize}...`);
      const pagedRequests = await storageManager.getSessionRequests(
        selectedSession,
        pagination,
        searchOptions.query ? searchOptions : undefined
      );
      
      // 确保请求按时间戳降序排序，最新的请求显示在前面
      const sortedRequests = pagedRequests.sort((a, b) => b.timestamp - a.timestamp);
      
      console.log(`Dashboard: Loaded ${sortedRequests.length} requests for current page`);
      setRequests(sortedRequests);
    } catch (err) {
      console.error('Dashboard: Failed to load requests:', err);
      setError(`Failed to load requests: ${err instanceof Error ? err.message : 'Unknown error'}`);
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

  const handleModifiedRequest = async (originalRequest: RequestData, modifiedRequest: ModifiedRequestData) => {
    try {
      const { shouldResend, ...requestChanges } = modifiedRequest;
      
      // 如果选择重新发送请求
      if (shouldResend && selectedSession) {
        // 创建新的请求对象
        const newRequest: RequestData = {
          ...originalRequest,
          ...requestChanges,
          id: `${originalRequest.id}_modified_${Date.now()}`,
          timestamp: Date.now(),
          responseHeaders: {},
          response: undefined
        };

        // 添加Diff请求标记
        newRequest.requestHeaders = {
          ...newRequest.requestHeaders,
          'X-API-Diff-Request': '1'
        };

        // 安全处理请求体
        let requestBody = undefined;
        if (newRequest.method !== 'GET' && newRequest.requestBody) {
          try {
            requestBody = typeof newRequest.requestBody === 'string' ? 
              newRequest.requestBody : 
              JSON.stringify(newRequest.requestBody);
          } catch (e: any) {
            console.error('Failed to stringify request body:', e);
            requestBody = String(newRequest.requestBody);
          }
        }

        // 发送请求
        const response = await fetch(newRequest.url, {
          method: newRequest.method,
          headers: newRequest.requestHeaders,
          body: requestBody
        });

        // 获取响应数据
        try {
          const responseText = await response.text();
          const contentType = response.headers.get('content-type');
          
          if (contentType && contentType.includes('application/json')) {
            try {
              newRequest.response = JSON.parse(responseText);
            } catch (e: any) {
              console.error('Failed to parse JSON response:', e);
              newRequest.response = responseText;
            }
          } else {
            newRequest.response = responseText;
          }
        } catch (e: any) {
          console.error('Failed to get response data:', e);
          newRequest.response = `[Error reading response: ${e.message}]`;
        }

        // 获取响应头
        newRequest.responseHeaders = {};
        try {
          response.headers.forEach((value, key) => {
            if (newRequest.responseHeaders) {
              newRequest.responseHeaders[key] = value;
            }
          });
        } catch (e) {
          console.error('Failed to process response headers:', e);
        }

        // 保存新请求到存储
        try {
          console.log(`Dashboard: Saving modified request to session ${selectedSession}`);
          await storageManager.saveRequest(selectedSession, newRequest);
          // 重新加载请求列表
          await loadRequests();
        } catch (e: any) {
          console.error('Failed to save modified request:', e);
          throw new Error(`Failed to save request: ${e.message}`);
        }
      }
    } catch (error) {
      console.error('Failed to process modified request:', error);
      throw new Error(error instanceof Error ? error.message : 'Failed to process request. Please check the console for details.');
    }
  };

  // 处理session复选框变更
  const handleSessionCheckboxChange = (sessionId: string, checked: boolean) => {
    const newSelected = new Set(selectedSessions);
    if (checked) {
      newSelected.add(sessionId);
    } else {
      newSelected.delete(sessionId);
    }
    setSelectedSessions(newSelected);
  };

  // 处理请求复选框变更
  const handleRequestCheckboxChange = (requestId: string, checked: boolean) => {
    const newSelected = new Set(selectedRequests);
    if (checked) {
      newSelected.add(requestId);
    } else {
      newSelected.delete(requestId);
    }
    setSelectedRequests(newSelected);
  };
  
  // 处理全选会话
  const handleSelectAllSessions = (checked: boolean) => {
    if (checked) {
      const allSessionIds = sessions.map(s => s.id);
      setSelectedSessions(new Set(allSessionIds));
    } else {
      setSelectedSessions(new Set());
    }
  };
  
  // 处理全选请求
  const handleSelectAllRequests = (checked: boolean) => {
    if (checked) {
      const allRequestIds = requests.map(r => r.id);
      setSelectedRequests(new Set(allRequestIds));
    } else {
      setSelectedRequests(new Set());
    }
  };
  
  // 删除选中的会话
  const handleDeleteSelectedSessions = async () => {
    if (selectedSessions.size === 0) return;
    
    if (!window.confirm(`确定要删除 ${selectedSessions.size} 个选中的会话吗？`)) {
      return;
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      await storageManager.deleteSessions(Array.from(selectedSessions));
      
      // 如果当前选中的会话被删除，清除选择
      if (selectedSession && selectedSessions.has(selectedSession)) {
        setSelectedSession(null);
        setSelectedSessionData(null);
        setRequests([]);
      }
      
      // 重新加载会话列表
      const updatedSessions = await storageManager.getSessions();
      setSessions(updatedSessions.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)));
      
      // 清空选择
      setSelectedSessions(new Set());
      
    } catch (err) {
      console.error('Dashboard: Failed to delete sessions:', err);
      setError(`Failed to delete sessions: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsLoading(false);
    }
  };
  
  // 删除选中的请求
  const handleDeleteSelectedRequests = async () => {
    if (!selectedSession || selectedRequests.size === 0) return;
    
    if (!window.confirm(`确定要删除 ${selectedRequests.size} 个选中的请求吗？`)) {
      return;
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      await storageManager.deleteRequests(selectedSession, Array.from(selectedRequests));
      
      // 重新加载请求列表
      await loadRequests();
      
      // 清空选择
      setSelectedRequests(new Set());
      
    } catch (err) {
      console.error('Dashboard: Failed to delete requests:', err);
      setError(`Failed to delete requests: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteSession = async (sessionId: string) => {
    if (!window.confirm('确定要删除这个会话吗？')) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      await storageManager.deleteSession(sessionId);
      setSelectedSession(null);
      setSelectedSessionData(null);
      setRequests([]);
      await loadRequests();
    } catch (err) {
      console.error('Dashboard: Failed to delete session:', err);
      setError(`Failed to delete session: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsLoading(false);
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
          <div className="sessions-actions">
            <label className="select-all">
              <input 
                type="checkbox" 
                checked={selectedSessions.size > 0 && selectedSessions.size === sessions.length}
                onChange={(e) => handleSelectAllSessions(e.target.checked)}
              />
              全选
            </label>
            {selectedSessions.size > 0 && (
              <button 
                className="delete-selected"
                onClick={handleDeleteSelectedSessions}
                disabled={isLoading}
              >
                删除选中 ({selectedSessions.size})
              </button>
            )}
          </div>
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
                >
                  <div className="session-checkbox">
                    <input 
                      type="checkbox"
                      checked={selectedSessions.has(session.id)}
                      onChange={(e) => handleSessionCheckboxChange(session.id, e.target.checked)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>
                  <div 
                    className="session-content"
                    onClick={() => {
                      console.log('Dashboard: Selecting session:', session.id);
                      setSelectedSession(session.id);
                      setSelectedSessionData(session);
                    }}
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
                  <button 
                    className="delete-button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteSession(session.id);
                    }}
                    title="删除会话"
                  >
                    ×
                  </button>
                </div>
              ))
            )}
          </div>
        </aside>

        <main className="requests-panel">
          {selectedSession ? (
            <>
              <div className="requests-header">
                <div className="requests-title-actions">
                  <h2>Requests ({totalRequests})</h2>
                  <div className="requests-actions">
                    <label className="select-all">
                      <input 
                        type="checkbox" 
                        checked={selectedRequests.size > 0 && selectedRequests.size === requests.length}
                        onChange={(e) => handleSelectAllRequests(e.target.checked)}
                      />
                      全选
                    </label>
                    {selectedRequests.size > 0 && (
                      <button 
                        className="delete-selected"
                        onClick={handleDeleteSelectedRequests}
                        disabled={isLoading}
                      >
                        删除选中 ({selectedRequests.size})
                      </button>
                    )}
                  </div>
                </div>
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
                  <Pagination
                    currentPage={pagination.page}
                    totalPages={Math.ceil(totalRequests / pagination.pageSize)}
                    onPageChange={page => setPagination(prev => ({ ...prev, page }))}
                  />
                </div>
                <div className="display-options">
                  <span>Display sections: </span>
                  {Object.entries(displayOptions).map(([key, value]) => (
                    <label key={key}>
                      <input
                        type="checkbox"
                        checked={value}
                        onChange={e => setDisplayOptions(prev => ({
                          ...prev,
                          [key]: e.target.checked
                        }))}
                      />
                      {key.replace(/([A-Z])/g, ' $1').toLowerCase()}
                    </label>
                  ))}
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
                    <RequestItem 
                      key={request.id}
                      request={request}
                      displayOptions={displayOptions}
                      onSendModifiedRequest={handleModifiedRequest}
                      isSelected={selectedRequests.has(request.id)}
                      onCheckboxChange={handleRequestCheckboxChange}
                    />
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