// 全局存储差异数据
let globalDiffData = null;

// 从localStorage或URL获取数据
function getDiffData() {
  try {
    // 从 localStorage 获取数据
    const diffDataFromStorage = localStorage.getItem('api-diff-data');
    if (diffDataFromStorage) {
      console.log('Found diff data in localStorage');
      const data = JSON.parse(diffDataFromStorage);
      // 数据使用后立即删除
      localStorage.removeItem('api-diff-data');
      return data;
    }
    
    // 从 URL 获取参数
    const urlParams = new URLSearchParams(window.location.search);
    const diffData = urlParams.get('data');
    
    if (!diffData) {
      console.error('No diff data found in URL parameters or localStorage');
      return null;
    }
    
    // 解析数据
    return JSON.parse(decodeURIComponent(diffData));
  } catch (error) {
    console.error('Failed to parse diff data:', error);
    return null;
  }
}

// 显示错误消息
function showError(message) {
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
  if (container) {
    container.appendChild(errorDiv);
  }
}

// 优化库加载逻辑
function loadLibraries() {
  console.log('Loading libraries and processing data...');
  
  // 预加载数据，减少等待时间
  globalDiffData = getDiffData();
    
  if (!globalDiffData) {
    showError('没有找到差异数据，请重新生成差异比较');
    return;
  }
  
  // 立即加载脚本，不等待库加载完成
  // 这样可以并行加载，加快速度
  const script = document.createElement('script');
  script.src = "diff-viewer.js";
  script.onload = function() {
    console.log('Diff viewer script loaded successfully');
    // 如果initializeDiffViewer函数存在则调用
    if (typeof initializeDiffViewer === 'function') {
      initializeDiffViewer(globalDiffData);
    }
  };
  script.onerror = function() {
    showError('差异查看器脚本加载失败，请刷新页面重试');
  };
  document.body.appendChild(script);
}

// 加快加载速度，使用 DOMContentLoaded 代替 window.onload
document.addEventListener('DOMContentLoaded', function() {
  console.log('DOM loaded, starting initialization');
  setTimeout(loadLibraries, 0); // 使用setTimeout避免阻塞DOM渲染
}); 