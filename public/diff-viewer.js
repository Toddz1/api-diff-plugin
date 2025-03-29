// 页面加载时初始化
document.addEventListener('DOMContentLoaded', () => {
  console.log('Diff viewer script loaded, waiting for initialization');
});

// 初始化差异查看器 - 使用传入的数据
function initializeDiffViewer(data) {
  console.log('Initializing diff viewer with provided data');
  
  if (!data) {
    console.error('No diff data provided to initializeDiffViewer');
    showError('无法获取差异数据，请重新生成差异比较');
    return;
  }
  
  try {
    console.log('Data available, starting render');
    renderDiffData(data);
    setupEventListeners(data);
    hideLoading();
  } catch (error) {
    console.error('Error during diff rendering:', error);
    showError('渲染差异数据时出错: ' + error.message);
  }
}

// 隐藏加载动画，显示内容区域
function hideLoading() {
  const loadingEl = document.getElementById('loadingContainer');
  if (loadingEl) {
    loadingEl.style.display = 'none';
  }
  
  const requestSection = document.getElementById('requestSection');
  if (requestSection) {
    requestSection.style.display = 'block';
  }
  
  const responseSection = document.getElementById('responseSection');
  if (responseSection) {
    responseSection.style.display = 'block';
  }
}

// 显示错误消息
function showError(message) {
  console.error('Showing error:', message);
  const loadingEl = document.getElementById('loadingContainer');
  if (loadingEl) {
    loadingEl.style.display = 'none';
  }
  
  const errorDiv = document.createElement('div');
  errorDiv.className = 'error-container';
  errorDiv.innerHTML = `
    <h2>错误</h2>
    <p>${message}</p>
  `;
  
  const container = document.getElementById('diffContainer');
  container.appendChild(errorDiv);
}

// 渲染差异数据
function renderDiffData(data) {
  console.log('Rendering diff data');
  
  // 设置元数据
  renderMetadata(data);
  
  // 渲染请求部分
  renderRequestDiffs(data);
  
  // 渲染响应部分
  renderResponseDiffs(data);
}

// 渲染元数据
function renderMetadata(data) {
  console.log('Rendering metadata');
  const metadataEl = document.getElementById('diffMetadata');
  if (!metadataEl) {
    console.error('Metadata element not found');
    return;
  }
  
  let metadata = '';
  
  if (data.request1Time && data.request2Time) {
    metadata = `
      <div>请求1: ${new Date(data.request1Time).toLocaleString()}</div>
      <div>请求2: ${new Date(data.request2Time).toLocaleString()}</div>
    `;
  } else if (data.originalTime && data.modifiedTime) {
    metadata = `
      <div>原始请求时间: ${new Date(data.originalTime).toLocaleString()}</div>
      <div>修改后请求时间: ${new Date(data.modifiedTime).toLocaleString()}</div>
    `;
  }
  
  metadataEl.innerHTML = metadata;
  console.log('Metadata rendered');
}

// 渲染请求部分差异
function renderRequestDiffs(data) {
  console.log('Rendering request diffs');
  const requestSection = document.getElementById('requestSection');
  if (!requestSection) {
    console.error('Request section element not found');
    return;
  }
  
  let content = '';
  
  if (!data.requestDiff) {
    console.log('No request diffs found');
    requestSection.innerHTML = '<div class="diff-section-header">请求信息</div><div style="padding: 20px; text-align: center;">没有请求差异</div>';
    return;
  }
  
  // URL差异
  if (data.requestDiff.url) {
    console.log('Rendering URL diff');
    content += createDiffItem(
      'URL', 
      data.requestDiff.url.old, 
      data.requestDiff.url.new, 
      'url.txt',
      getCurrentDiffOptions()
    );
  }
  
  // Method差异
  if (data.requestDiff.method) {
    console.log('Rendering Method diff');
    content += createDiffItem(
      'Method', 
      data.requestDiff.method.old, 
      data.requestDiff.method.new, 
      'method.txt',
      getCurrentDiffOptions()
    );
  }
  
  // Headers差异
  if (data.requestDiff.headers) {
    console.log('Rendering Headers diff');
    const oldHeaders = typeof data.requestDiff.headers.old === 'string' 
      ? data.requestDiff.headers.old 
      : JSON.stringify(data.requestDiff.headers.old, null, 2);
      
    const newHeaders = typeof data.requestDiff.headers.new === 'string' 
      ? data.requestDiff.headers.new 
      : JSON.stringify(data.requestDiff.headers.new, null, 2);
      
    content += createDiffItem(
      'Request Headers', 
      oldHeaders, 
      newHeaders, 
      'request-headers.json',
      getCurrentDiffOptions()
    );
  }
  
  // Body差异
  if (data.requestDiff.body) {
    console.log('Rendering Body diff');
    const oldBody = typeof data.requestDiff.body.old === 'string' 
      ? data.requestDiff.body.old 
      : JSON.stringify(data.requestDiff.body.old, null, 2);
      
    const newBody = typeof data.requestDiff.body.new === 'string' 
      ? data.requestDiff.body.new 
      : JSON.stringify(data.requestDiff.body.new, null, 2);
      
    content += createDiffItem(
      'Request Body', 
      oldBody, 
      newBody, 
      'request-body.txt',
      getCurrentDiffOptions()
    );
  }
  
  // 添加内容到请求部分
  requestSection.innerHTML = '<div class="diff-section-header">请求信息</div>' + (content || '<div style="padding: 20px; text-align: center;">没有请求差异</div>');
  console.log('Request diffs rendered');
}

// 渲染响应部分差异
function renderResponseDiffs(data) {
  console.log('Rendering response diffs');
  const responseSection = document.getElementById('responseSection');
  if (!responseSection) {
    console.error('Response section element not found');
    return;
  }
  
  let content = '';
  
  if (!data.responseDiff) {
    console.log('No response diffs found');
    responseSection.innerHTML = '<div class="diff-section-header">响应信息</div><div style="padding: 20px; text-align: center;">没有响应差异</div>';
    return;
  }
  
  // Status差异
  if (data.responseDiff.status) {
    console.log('Rendering Status diff');
    content += createDiffItem(
      'Status', 
      String(data.responseDiff.status.old), 
      String(data.responseDiff.status.new), 
      'status.txt',
      getCurrentDiffOptions()
    );
  }
  
  // Headers差异
  if (data.responseDiff.headers) {
    console.log('Rendering Response Headers diff');
    const oldHeaders = typeof data.responseDiff.headers.old === 'string' 
      ? data.responseDiff.headers.old 
      : JSON.stringify(data.responseDiff.headers.old, null, 2);
      
    const newHeaders = typeof data.responseDiff.headers.new === 'string' 
      ? data.responseDiff.headers.new 
      : JSON.stringify(data.responseDiff.headers.new, null, 2);
      
    content += createDiffItem(
      'Response Headers', 
      oldHeaders, 
      newHeaders, 
      'response-headers.json',
      getCurrentDiffOptions()
    );
  }
  
  // Body差异
  if (data.responseDiff.body) {
    console.log('Rendering Response Body diff');
    const oldBody = typeof data.responseDiff.body.old === 'string' 
      ? data.responseDiff.body.old 
      : JSON.stringify(data.responseDiff.body.old, null, 2);
      
    const newBody = typeof data.responseDiff.body.new === 'string' 
      ? data.responseDiff.body.new 
      : JSON.stringify(data.responseDiff.body.new, null, 2);
      
    content += createDiffItem(
      'Response Body', 
      oldBody, 
      newBody, 
      'response-body.txt',
      getCurrentDiffOptions()
    );
  }
  
  // 添加内容到响应部分
  responseSection.innerHTML = '<div class="diff-section-header">响应信息</div>' + (content || '<div style="padding: 20px; text-align: center;">没有响应差异</div>');
  console.log('Response diffs rendered');
}

// 创建差异项
function createDiffItem(title, oldValue, newValue, filename, options) {
  console.log(`Creating diff item: ${title}`);
  try {
    // 尝试直接访问全局库对象
    if (typeof window.Diff === 'undefined') {
      throw new Error('Diff 库未找到 - 请确保库已正确加载');
    }
    if (typeof window.Diff2Html === 'undefined') {
      throw new Error('Diff2Html 库未找到 - 请确保库已正确加载');
    }
    
    // 处理JSON格式化
    if (filename.endsWith('.json')) {
      try {
        // 尝试将字符串解析为JSON并格式化
        if (typeof oldValue === 'string' && oldValue.trim()) {
          const parsed = JSON.parse(oldValue);
          oldValue = JSON.stringify(parsed, null, 2);
        }
        if (typeof newValue === 'string' && newValue.trim()) {
          const parsed = JSON.parse(newValue);
          newValue = JSON.stringify(parsed, null, 2);
        }
      } catch (e) {
        console.warn('无法解析JSON进行格式化，将使用原始字符串:', e);
      }
    }
    
    // 确保值为字符串
    oldValue = oldValue || '';
    newValue = newValue || '';
    
    // 创建差异补丁
    const diffStr = window.Diff.createPatch(
      filename, 
      typeof oldValue !== 'string' ? JSON.stringify(oldValue, null, 2) : oldValue, 
      typeof newValue !== 'string' ? JSON.stringify(newValue, null, 2) : newValue, 
      '原始内容', 
      '修改后内容'
    );
    
    // 配置对象
    const config = {
      ...options,
      drawFileList: false,
      matching: 'lines',
      outputFormat: options.outputFormat,
      renderNothingWhenEmpty: false,
      matchingMaxComparisons: 2500,
      maxLineSizeInBlockForComparison: 200
    };
    
    // 生成HTML
    const diffHtml = window.Diff2Html.html(diffStr, config);
    
    // 返回HTML结构
    return `
      <div class="diff-item">
        <div class="diff-item-header">${title}</div>
        <div class="diff-content">${diffHtml}</div>
      </div>
    `;
  } catch (error) {
    console.error(`Error creating diff for ${title}:`, error);
    return `
      <div class="diff-item">
        <div class="diff-item-header">${title}</div>
        <div class="diff-content">
          <div style="padding: 20px; color: #d32f2f;">
            无法生成差异视图: ${error.message}
          </div>
        </div>
      </div>
    `;
  }
}

// 获取当前差异选项
function getCurrentDiffOptions() {
  const outputFormat = document.getElementById('outputFormat')?.value || 'line-by-line';
  const diffStyle = document.getElementById('diffStyle')?.value || 'word';
  
  console.log(`Current diff options: outputFormat=${outputFormat}, diffStyle=${diffStyle}`);
  
  const baseOptions = {
    drawFileList: false,
    matching: 'lines',
    outputFormat: outputFormat,
    renderNothingWhenEmpty: false,
    matchingMaxComparisons: 2500,
    maxLineSizeInBlockForComparison: 200,
    diffStyle: diffStyle,
    lineNumbers: true,
    colorScheme: {
      addedBackground: '#e6ffed',
      addedColor: '#24292e',
      removedBackground: '#ffebe9',
      removedColor: '#24292e',
      unchangedBackground: '#ffffff',
      unchangedColor: '#24292e'
    }
  };
  
  // 为左右对比模式添加额外配置
  if (outputFormat === 'side-by-side') {
    baseOptions.synchronisedScroll = true; // 同步滚动
    baseOptions.renderNothingWhenEmpty = true; // 不显示空行  
  }
  
  return baseOptions;
}

// 设置事件监听器
function setupEventListeners(data) {
  console.log('Setting up event listeners');
  
  // 样式变更事件
  const outputFormatSelect = document.getElementById('outputFormat');
  const diffStyleSelect = document.getElementById('diffStyle');
  
  if (outputFormatSelect && diffStyleSelect) {
    outputFormatSelect.addEventListener('change', () => {
      console.log('Output format changed to', outputFormatSelect.value);
      refreshDiffs(data);
    });
    
    diffStyleSelect.addEventListener('change', () => {
      console.log('Diff style changed to', diffStyleSelect.value);
      refreshDiffs(data);
    });
    
    console.log('Style change listeners added');
  } else {
    console.error('Style selectors not found');
  }
}

// 刷新所有差异
function refreshDiffs(data) {
  console.log('Refreshing all diffs');
  // 清空差异显示区域
  const requestSection = document.getElementById('requestSection');
  const responseSection = document.getElementById('responseSection');
  
  if (requestSection) {
    requestSection.innerHTML = '<div class="diff-section-header">请求信息</div>';
  }
  
  if (responseSection) {
    responseSection.innerHTML = '<div class="diff-section-header">响应信息</div>';
  }
  
  // 重新渲染差异
  renderRequestDiffs(data);
  renderResponseDiffs(data);
}

// 在全局作用域上暴露初始化函数
window.initDiffViewer = initializeDiffViewer;

// 在页面完全加载后立即执行
window.onload = function() {
  console.log('Window loaded in diff-viewer.js, calling initializeDiffViewer');
  // 短暂延迟确保一切准备就绪
  setTimeout(initializeDiffViewer, 100);
}; 