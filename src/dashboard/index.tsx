import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { RequestData, CaptureSession, PaginationOptions, SearchOptions, ModifiedRequestData, DiffResult } from '../utils/types';
import { storageManager, initializeStorage } from '../utils/storage';
import './styles.css';
import * as Diff from 'diff';
import { html as diffToHtml, Diff2HtmlConfig } from 'diff2html';

const DEFAULT_SEARCH_OPTIONS: SearchOptions = {
  query: '',
  fields: {
    url: true,
    requestHeaders: false,
    requestBody: false,
    responseHeaders: false,
    responseBody: false,
    id: true // 修改为true，默认启用request_id搜索
  }
};

const DEFAULT_PAGINATION: PaginationOptions = {
  pageSize: 10,
  page: 0
};

// 声明显示选项的类型
interface DisplayOptions {
  requestHeaders: boolean;
  requestBody: boolean;
  responseHeaders: boolean;
  responseBody: boolean;
  duration: boolean;
  diffStyle: 'side-by-side' | 'line-by-line';
}

const DEFAULT_DISPLAY_OPTIONS: DisplayOptions = {
  requestHeaders: false,
  requestBody: false,
  responseHeaders: false,
  responseBody: true,
  duration: true, // 默认显示耗时
  diffStyle: 'side-by-side' // 默认比较样式，可选 'side-by-side', 'line-by-line'
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
  const [shouldSaveRequest, setShouldSaveRequest] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [diffResult, setDiffResult] = useState<string | null>(null);

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
      await onSendRequest(request, { ...modifiedRequest, shouldResend: true, shouldSaveRequest });
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
          <h2>Compare and Modify Request</h2>
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

          {error && <div className="error-message">{error}</div>}

          <div className="diff-preview">
            <h3>Changes Preview</h3>
            <div className="diff-section">
              {Object.entries(modifiedRequest).map(([key, value]) => {
                const originalValue = request[key as keyof RequestData];
                if (JSON.stringify(value) !== JSON.stringify(originalValue)) {
                  return (
                    <div key={key} className="diff-item">
                      <h4>{key}</h4>
                      <div className="diff-content">
                        <div className="original">
                          <strong>Original:</strong>
                          <pre>{JSON.stringify(originalValue, null, 2)}</pre>
                        </div>
                        <div className="modified">
                          <strong>Modified:</strong>
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
          <div className="save-option">
            <label>
              <input
                type="checkbox"
                checked={shouldSaveRequest}
                onChange={e => setShouldSaveRequest(e.target.checked)}
              />
              Save as new request record
            </label>
          </div>
          <div className="buttons">
            <button 
              className="cancel-button" 
              onClick={onClose}
              disabled={isLoading}
            >
              Cancel
            </button>
            <button 
              className="apply-button" 
              onClick={handleSubmit}
              disabled={isLoading}
            >
              {isLoading ? 'Processing...' : 'Send'}
            </button>
          </div>
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
          <h2>Complete Request/Response Information</h2>
          <button className="close-button" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="source-section">
            <h3>Request Information</h3>
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
            <h3>Response Information</h3>
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

// 生成curl命令的函数
const generateCurlCommand = (request: RequestData): string => {
  let command = `curl -X ${request.method} "${request.url}"`;
  
  // 添加请求头
  if (request.requestHeaders && Object.keys(request.requestHeaders).length > 0) {
    Object.entries(request.requestHeaders).forEach(([key, value]) => {
      // 跳过某些特殊的头部，如X-API-Diff-Request
      if (key !== 'X-API-Diff-Request') {
        command += ` \\\n  -H "${key}: ${value.replace(/"/g, '\\"')}"`;
      }
    });
  }
  
  // 添加请求体
  if (request.requestBody && request.method !== 'GET') {
    let bodyStr = '';
    if (typeof request.requestBody === 'string') {
      bodyStr = request.requestBody;
    } else {
      try {
        bodyStr = JSON.stringify(request.requestBody);
      } catch (e) {
        bodyStr = String(request.requestBody);
      }
    }
    command += ` \\\n  -d '${bodyStr.replace(/'/g, "'\\''")}'`;
  }
  
  return command;
};

// 使用diff2html生成更专业的差异视图
const generateProfessionalDiff = (
  oldStr: string, 
  newStr: string, 
  filename: string,
  displayOptions: DisplayOptions
): string => {
  // 创建差异补丁
  const diffStr = Diff.createPatch(filename, oldStr, newStr, '原始内容', '修改后内容');
  
  // 配置diff2html选项
  const diffHtmlOptions: Diff2HtmlConfig = {
    drawFileList: false,
    matching: 'lines',
    outputFormat: displayOptions.diffStyle, // 使用用户选择的样式
    renderNothingWhenEmpty: false,
    matchingMaxComparisons: 2500,
    maxLineSizeInBlockForComparison: 200,
    diffStyle: 'word' // 默认对比单词
  };
  
  // 生成HTML
  const diffHtml = diffToHtml(diffStr, diffHtmlOptions);
  
  return diffHtml;
};

// 修改 RequestItem 组件
const RequestItem: React.FC<{ 
  request: RequestData; 
  displayOptions: DisplayOptions;
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
  
  // 获取HTTP状态码
  const statusCode = request.response?.status;
  
  // 获取请求耗时
  const duration = request.duration;
  
  // 调试日志
  useEffect(() => {
    console.log(`RequestItem: Request ${request.id} with duration:`, duration);
    console.log(`RequestItem: Full request object:`, request);
  }, [request]);

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
            {(() => {
              try {
                const url = new URL(request.url);
                return url.pathname + url.search;
              } catch (e) {
                return request.url;
              }
            })()}
          </span>
        </div>
        <div className="request-actions">
          <button 
            className="curl-button"
            onClick={(e) => {
              e.stopPropagation();
              const curlCommand = generateCurlCommand(request);
              navigator.clipboard.writeText(curlCommand).then(() => {
                console.log('Curl command copied to clipboard');
              }).catch(err => {
                console.error('Failed to copy curl command:', err);
              });
            }}
            title="Export as curl command"
          >
            Curl
          </button>
          <button 
            className="source-button"
            onClick={(e) => {
              e.stopPropagation();
              setShowSourceModal(true);
            }}
            title="View Complete Request/Response Information"
          >
            Source
          </button>
          <button 
            className="diff-button"
            onClick={(e) => {
              e.stopPropagation();
              setShowDiffModal(true);
            }}
            title="Compare and Modify Request"
          >
            Diff
          </button>
        </div>
      </div>
      
      <div className="request-info">
        <span className="request-timestamp">
          {new Date(request.timestamp).toLocaleString()}
        </span>
        {(() => {
          try {
            const url = new URL(request.url);
            return <span className="request-domain">{url.protocol}//{url.hostname}</span>;
          } catch (e) {
            return null;
          }
        })()}
        <span className="request-id">
          {displayOptions.duration ? 
            `duration:${duration !== undefined ? `${duration}ms` : '--ms'} ` : 
            ''}
          request_id:{request.id}
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

// 添加DiffResultModal组件
interface DiffResultModalProps {
  originalRequest: RequestData;
  newRequest: RequestData;
  diffData: DiffResult;
  onClose: () => void;
}

const DiffResultModal: React.FC<DiffResultModalProps> = ({ originalRequest, newRequest, diffData, onClose }) => {
  // 使用react-diff-viewer或实现自定义diff视图
  const renderDiff = (oldValue: any, newValue: any, title: string) => {
    let oldStr = typeof oldValue === 'string' ? oldValue : JSON.stringify(oldValue, null, 2);
    let newStr = typeof newValue === 'string' ? newValue : JSON.stringify(newValue, null, 2);
    
    // 简单地并排显示两个值，实际生产中可以使用专业的diff库
    return (
      <div className="diff-item">
        <h3>{title}</h3>
        <div className="diff-content">
          <div className="diff-original">
            <h4>Original:</h4>
            <pre>{oldStr}</pre>
          </div>
          <div className="diff-modified">
            <h4>Modified:</h4>
            <pre>{newStr}</pre>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="modal diff-result-modal">
      <div className="modal-content large-modal">
        <div className="modal-header">
          <h2>Request Comparison Result</h2>
          <button className="close-button" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="diff-section">
            <h3>Request Changes</h3>
            {diffData.requestDiff.url && renderDiff(
              diffData.requestDiff.url.old,
              diffData.requestDiff.url.new,
              "URL"
            )}
            {diffData.requestDiff.method && renderDiff(
              diffData.requestDiff.method.old,
              diffData.requestDiff.method.new,
              "Method"
            )}
            {diffData.requestDiff.headers && renderDiff(
              diffData.requestDiff.headers.old,
              diffData.requestDiff.headers.new,
              "Request Headers"
            )}
            {diffData.requestDiff.body && renderDiff(
              diffData.requestDiff.body.old,
              diffData.requestDiff.body.new,
              "Request Body"
            )}
          </div>
          
          <div className="diff-section">
            <h3>Response Changes</h3>
            {diffData.responseDiff.status && renderDiff(
              diffData.responseDiff.status.old,
              diffData.responseDiff.status.new,
              "Status"
            )}
            {diffData.responseDiff.headers && renderDiff(
              diffData.responseDiff.headers.old,
              diffData.responseDiff.headers.new,
              "Response Headers"
            )}
            {diffData.responseDiff.body && renderDiff(
              diffData.responseDiff.body.old,
              diffData.responseDiff.body.new,
              "Response Body"
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// 添加会话重命名模态框组件
interface RenameSessionModalProps {
  session: CaptureSession;
  onSave: (id: string, newName: string) => Promise<void>;
  onClose: () => void;
}

const RenameSessionModal: React.FC<RenameSessionModalProps> = ({ session, onSave, onClose }) => {
  const [name, setName] = useState(session.name || session.id);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError('Name cannot be empty');
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      await onSave(session.id, name);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to rename session');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="modal">
      <div className="modal-content">
        <div className="modal-header">
          <h2>Rename Session</h2>
          <button className="close-button" onClick={onClose}>×</button>
        </div>
        
        <div className="modal-body">
          <div className="form-group">
            <label>Session Name:</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Enter session name"
            />
          </div>

          {error && <div className="error-message">{error}</div>}
        </div>

        <div className="modal-footer">
          <div className="buttons">
            <button 
              className="cancel-button" 
              onClick={onClose}
              disabled={isLoading}
            >
              Cancel
            </button>
            <button 
              className="apply-button" 
              onClick={handleSubmit}
              disabled={isLoading}
            >
              {isLoading ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>
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

  // 添加状态管理会话重命名
  const [renameSessionId, setRenameSessionId] = useState<string | null>(null);

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

  const handleModifiedRequest = async (originalRequest: RequestData, modifiedRequest: ModifiedRequestData): Promise<void> => {
    try {
      const { shouldResend, shouldSaveRequest, ...requestChanges } = modifiedRequest;
      
      // 始终发送请求，因为我们修改了行为
      if (selectedSession) {
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
          
          // 首先设置响应的基本结构和状态码
          newRequest.response = {
            status: response.status,
            statusText: response.statusText,
            headers: {},
            body: undefined
          };
          
          // 然后处理响应体
          if (contentType && contentType.includes('application/json')) {
            try {
              // 尝试解析JSON
              newRequest.response.body = JSON.parse(responseText);
            } catch (e: any) {
              console.error('Failed to parse JSON response:', e);
              newRequest.response.body = responseText;
            }
          } else {
            // 非JSON响应直接保存文本
            newRequest.response.body = responseText;
          }
        } catch (e: any) {
          console.error('Failed to get response data:', e);
          newRequest.response = {
            status: 0,
            statusText: 'Error',
            error: `Error reading response: ${e.message}`
          };
        }

        // 获取响应头
        if (newRequest.response && !newRequest.response.headers) {
          newRequest.response.headers = {};
        }
        
        try {
          response.headers.forEach((value, key) => {
            if (newRequest.response && newRequest.response.headers) {
              newRequest.response.headers[key] = value;
            }
          });
        } catch (e) {
          console.error('Failed to process response headers:', e);
        }

        // 根据选项决定是否保存请求
        if (shouldSaveRequest) {
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
        
        // 在这里我们创建一个新窗口来显示diff
        const originalResponse = originalRequest.response;
        const newResponse = newRequest.response;
        
        if (originalResponse && newResponse) {
          // 使用DiffResult类型定义差异数据
          let diffData: DiffResult = {
            requestDiff: {
              url: originalRequest.url !== newRequest.url ? { old: originalRequest.url, new: newRequest.url } : undefined,
              method: originalRequest.method !== newRequest.method ? { old: originalRequest.method, new: newRequest.method } : undefined,
              headers: originalRequest.requestHeaders !== newRequest.requestHeaders ? { old: originalRequest.requestHeaders, new: newRequest.requestHeaders } : undefined,
              body: JSON.stringify(originalRequest.requestBody) !== JSON.stringify(newRequest.requestBody) ? { old: originalRequest.requestBody, new: newRequest.requestBody } : undefined
            },
            responseDiff: {
              status: originalResponse.status !== newResponse.status ? { old: originalResponse.status, new: newResponse.status } : undefined,
              headers: originalResponse.headers !== newResponse.headers ? { old: originalResponse.headers || {}, new: newResponse.headers || {} } : undefined,
              body: JSON.stringify(originalResponse.body) !== JSON.stringify(newResponse.body) ? { old: originalResponse.body, new: newResponse.body } : undefined
            }
          };

          // 添加时间戳信息
          const dataToSend = {
            ...diffData,
            originalTime: originalRequest.timestamp,
            modifiedTime: newRequest.timestamp,
          };

          console.log('Preparing modified request diff data:', dataToSend);

          try {
            // 将数据存储到 localStorage (处理大数据)
            localStorage.setItem('api-diff-data', JSON.stringify(dataToSend));
            console.log('Data saved to localStorage');
            
            // 打开无参数的差异查看器页面
            const diffViewerUrl = chrome.runtime.getURL('diff-viewer.html');
            console.log('Opening diff viewer URL:', diffViewerUrl);
            
            // 打开新窗口
            const diffWindow = window.open(diffViewerUrl, '_blank', 'width=1200,height=800');
            
            if (!diffWindow) {
              console.error('Failed to open diff window');
              throw new Error('Failed to open diff window, please check if browser is blocking pop-ups');
            }
          } catch (storageError) {
            console.error('Failed to save data to localStorage, falling back to URL params', storageError);
            
            // 如果 localStorage 失败，回退到 URL 参数方式 (适用于较小数据)
            const jsonData = JSON.stringify(dataToSend);
            const dataParam = encodeURIComponent(jsonData);
            console.log('Data encoded for URL, length:', dataParam.length);
            
            // 获取完整 URL
            const diffViewerUrl = chrome.runtime.getURL('diff-viewer.html') + '?data=' + dataParam;
            console.log('Opening diff viewer URL with params');
            
            // 打开新窗口
            const diffWindow = window.open(diffViewerUrl, '_blank', 'width=1200,height=800');
            
            if (!diffWindow) {
              console.error('Failed to open diff window');
              throw new Error('Failed to open diff window, please check if browser is blocking pop-ups');
            }
          }
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
    
    if (!window.confirm(`Are you sure you want to delete ${selectedSessions.size} selected sessions?`)) {
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
    
    if (!window.confirm(`Are you sure you want to delete ${selectedRequests.size} selected requests?`)) {
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

  // 处理搜索字段变更
  const handleSearchFieldChange = (field: keyof SearchOptions['fields']) => {
    setSearchOptions(prev => ({
      ...prev,
      fields: {
        ...prev.fields,
        [field]: !prev.fields[field]
      }
    }));
  };

  // 删除会话
  const handleDeleteSession = async (sessionId: string) => {
    if (!window.confirm('Are you sure you want to delete this session?')) {
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

  // 添加处理会话重命名的函数
  const handleRenameSession = async (sessionId: string, newName: string) => {
    setIsLoading(true);
    setError(null);

    try {
      // 查找会话
      const session = sessions.find(s => s.id === sessionId);
      if (!session) {
        throw new Error('Session does not exist');
      }

      // 更新会话
      await storageManager.updateSession({
        ...session,
        name: newName
      });

      // 立即获取更新后的会话列表
      const updatedSessions = await storageManager.getSessions();
      setSessions(updatedSessions.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)));

      // 如果当前选中的会话是被重命名的会话，也更新选中的会话数据
      if (selectedSession === sessionId) {
        const updatedSession = updatedSessions.find(s => s.id === sessionId);
        if (updatedSession) {
          setSelectedSessionData(updatedSession);
        }
      }

      // 如果需要，还可以重新加载请求列表
      await loadRequests();
      
      console.log(`Dashboard: Successfully renamed session ${sessionId} to "${newName}"`);
    } catch (err) {
      console.error('Dashboard: Failed to rename session:', err);
      setError(`Failed to rename session: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsLoading(false);
    }
  };

  // 处理两个请求的对比
  const handleCompareRequests = async () => {
    if (selectedRequests.size !== 2) return;
    
    setIsLoading(true);
    setError(null);

    try {
      // 获取选中的两个请求
      const requestIds = Array.from(selectedRequests);
      const request1 = requests.find(r => r.id === requestIds[0]);
      const request2 = requests.find(r => r.id === requestIds[1]);
      
      if (!request1 || !request2) {
        throw new Error('Failed to find selected requests');
      }

      console.log('Comparing requests:', request1.id, request2.id);

      // 使用DiffResult类型定义差异数据
      let diffData: DiffResult = {
        requestDiff: {
          url: request1.url !== request2.url ? { old: request1.url, new: request2.url } : undefined,
          method: request1.method !== request2.method ? { old: request1.method, new: request2.method } : undefined,
          headers: !deepEqual(request1.requestHeaders, request2.requestHeaders) ? 
            { old: request1.requestHeaders, new: request2.requestHeaders } : undefined,
          body: !deepEqual(request1.requestBody, request2.requestBody) ? 
            { old: request1.requestBody, new: request2.requestBody } : undefined
        },
        responseDiff: {
          status: request1.response?.status !== request2.response?.status ? 
            { old: request1.response?.status || 0, new: request2.response?.status || 0 } : undefined,
          headers: request1.responseHeaders !== request2.responseHeaders ? 
            { old: request1.responseHeaders || {}, new: request2.responseHeaders || {} } : undefined,
          body: !deepEqual(request1.response?.body, request2.response?.body) ? 
            { old: request1.response?.body, new: request2.response?.body } : undefined
        }
      };

      // 添加时间戳信息
      const dataToSend = {
        ...diffData,
        request1Time: request1.timestamp,
        request2Time: request2.timestamp,
      };

      console.log('Preparing data to send to diff viewer', dataToSend);

      try {
        // 将数据存储到 localStorage (处理大数据)
        localStorage.setItem('api-diff-data', JSON.stringify(dataToSend));
        console.log('Data saved to localStorage');
        
        // 打开无参数的差异查看器页面
        const diffViewerUrl = chrome.runtime.getURL('diff-viewer.html');
        console.log('Opening diff viewer URL:', diffViewerUrl);
        
        // 打开新窗口
        const diffWindow = window.open(diffViewerUrl, '_blank', 'width=1200,height=800');
        
        if (!diffWindow) {
          console.error('Failed to open diff window');
          throw new Error('Failed to open diff window, please check if browser is blocking pop-ups');
        }
      } catch (storageError) {
        console.error('Failed to save data to localStorage, falling back to URL params', storageError);
        
        // 如果 localStorage 失败，回退到 URL 参数方式 (适用于较小数据)
        const jsonData = JSON.stringify(dataToSend);
        const dataParam = encodeURIComponent(jsonData);
        console.log('Data encoded for URL, length:', dataParam.length);
        
        // 获取完整 URL
        const diffViewerUrl = chrome.runtime.getURL('diff-viewer.html') + '?data=' + dataParam;
        console.log('Opening diff viewer URL with params');
        
        // 打开新窗口
        const diffWindow = window.open(diffViewerUrl, '_blank', 'width=1200,height=800');
        
        if (!diffWindow) {
          console.error('Failed to open diff window');
          throw new Error('Failed to open diff window, please check if browser is blocking pop-ups');
        }
      }
    } catch (error) {
      console.error('Failed to compare requests:', error);
      setError(`Failed to compare requests: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsLoading(false);
    }
  };

  // 深度比较两个对象是否相等的辅助函数
  const deepEqual = (a: any, b: any): boolean => {
    if (a === b) return true;
    if (a === null || b === null) return false;
    if (a === undefined || b === undefined) return false;
    if (typeof a !== typeof b) return false;
    
    if (typeof a === 'object') {
      const keysA = Object.keys(a || {});
      const keysB = Object.keys(b || {});
      
      if (keysA.length !== keysB.length) return false;
      
      return keysA.every(key => deepEqual(a[key], b[key]));
    }
    
    return false;
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
            <label className="search-option">
              <input
                type="checkbox"
                checked={searchOptions.fields.url}
                onChange={() => handleSearchFieldChange('url')}
              />
              <span>URL</span>
            </label>
            <label className="search-option">
              <input
                type="checkbox"
                checked={searchOptions.fields.id}
                onChange={() => handleSearchFieldChange('id')}
              />
              <span>ID</span>
            </label>
            <label className="search-option">
              <input
                type="checkbox"
                checked={searchOptions.fields.requestHeaders}
                onChange={() => handleSearchFieldChange('requestHeaders')}
              />
              <span>Request Headers</span>
            </label>
            <label className="search-option">
              <input
                type="checkbox"
                checked={searchOptions.fields.requestBody}
                onChange={() => handleSearchFieldChange('requestBody')}
              />
              <span>Request Body</span>
            </label>
            <label className="search-option">
              <input
                type="checkbox"
                checked={searchOptions.fields.responseHeaders}
                onChange={() => handleSearchFieldChange('responseHeaders')}
              />
              <span>Response Headers</span>
            </label>
            <label className="search-option">
              <input
                type="checkbox"
                checked={searchOptions.fields.responseBody}
                onChange={() => handleSearchFieldChange('responseBody')}
              />
              <span>Response Body</span>
            </label>
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
              Select All
            </label>
            {selectedSessions.size > 0 && (
              <button 
                className="delete-selected"
                onClick={handleDeleteSelectedSessions}
                disabled={isLoading}
              >
                Delete Selected ({selectedSessions.size})
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
                      <span className="session-id">{session.name || session.id}</span>
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
                  <div className="session-actions">
                    <button 
                      className="rename-button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setRenameSessionId(session.id);
                      }}
                      title="Rename Session"
                    >
                      ✏️
                    </button>
                    <button 
                      className="delete-button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteSession(session.id);
                      }}
                      title="Delete Session"
                    >
                      ×
                    </button>
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
                <div className="requests-title-actions">
                  <h2>Requests ({totalRequests})</h2>
                  <div className="requests-actions">
                    <label className="select-all">
                      <input 
                        type="checkbox" 
                        checked={selectedRequests.size > 0 && selectedRequests.size === requests.length}
                        onChange={(e) => handleSelectAllRequests(e.target.checked)}
                      />
                      Select All
                    </label>
                    {selectedRequests.size > 0 && (
                      <>
                        <button 
                          className="delete-selected"
                          onClick={handleDeleteSelectedRequests}
                          disabled={isLoading}
                        >
                          Delete Selected ({selectedRequests.size})
                        </button>
                        
                        {selectedRequests.size === 2 && (
                          <button 
                            className="compare-selected"
                            onClick={handleCompareRequests}
                            disabled={isLoading}
                          >
                            Compare Requests
                          </button>
                        )}
                      </>
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
                  {Object.entries(displayOptions).map(([key, value]) => {
                    // 差异样式使用下拉选择器
                    if (key === 'diffStyle') {
                      return (
                        <div key={key} className="diff-style-selector">
                          <label>Diff Style:</label>
                          <select 
                            value={value as string}
                            onChange={e => setDisplayOptions(prev => ({
                              ...prev,
                              diffStyle: e.target.value as 'side-by-side' | 'line-by-line'
                            }))}
                          >
                            <option value="side-by-side">Side by Side</option>
                            <option value="line-by-line">Line by Line</option>
                          </select>
                        </div>
                      );
                    }
                    
                    // 其他选项使用复选框
                    return (
                    <label key={key}>
                      <input
                        type="checkbox"
                          checked={value as boolean}
                        onChange={e => setDisplayOptions(prev => ({
                          ...prev,
                          [key]: e.target.checked
                        }))}
                      />
                      {key.replace(/([A-Z])/g, ' $1').toLowerCase()}
                    </label>
                    );
                  })}
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
      
      {/* 添加重命名模态框 */}
      {renameSessionId && (
        <RenameSessionModal 
          session={sessions.find(s => s.id === renameSessionId)!}
          onSave={handleRenameSession}
          onClose={() => setRenameSessionId(null)}
        />
      )}
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