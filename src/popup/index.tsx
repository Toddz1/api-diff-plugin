console.log('Popup script starting...');

import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const Popup: React.FC = () => {
  const [isCapturing, setIsCapturing] = useState(false);

  useEffect(() => {
    // 检查当前捕获状态
    chrome.runtime.sendMessage({ type: 'GET_CAPTURE_STATUS' }, (response) => {
      if (response && response.isCapturing !== undefined) {
        setIsCapturing(response.isCapturing);
      }
    });
  }, []);

  const handleCaptureClick = () => {
    const newCaptureState = !isCapturing;
    const messageType = newCaptureState ? 'START_CAPTURE' : 'STOP_CAPTURE';
    
    console.log(`Sending ${messageType} message to background script`);
    chrome.runtime.sendMessage({ type: messageType }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('Error sending message:', chrome.runtime.lastError);
        alert(`Error: ${chrome.runtime.lastError.message || 'Unknown error'}`);
        return;
      }

      console.log(`Received response for ${messageType}:`, response);
      if (response && response.success) {
        console.log(`Capture state changed to: ${newCaptureState}`);
        setIsCapturing(newCaptureState);
      } else {
        console.error('Failed to change capture state:', response?.error || 'Unknown error');
        alert(`Failed to ${newCaptureState ? 'start' : 'stop'} capture: ${response?.error || 'Unknown error'}`);
      }
    });
  };

  const handleOpenDashboard = () => {
    const url = chrome.runtime.getURL('dashboard.html');
    console.log('Opening dashboard at:', url);
    try {
      chrome.tabs.create({ url }, (tab) => {
        if (chrome.runtime.lastError) {
          console.error('Error opening dashboard:', chrome.runtime.lastError);
          alert(`Error opening dashboard: ${chrome.runtime.lastError.message || 'Unknown error'}`);
        } else {
          console.log('Dashboard opened in tab:', tab);
        }
      });
    } catch (error) {
      console.error('Exception opening dashboard:', error);
      alert(`Failed to open dashboard: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const containerStyle: React.CSSProperties = {
    width: '200px',
    minHeight: '150px',
    backgroundColor: '#ffffff',
    display: 'flex',
    flexDirection: 'column',
    border: '1px solid #ccc'
  };

  const headerStyle: React.CSSProperties = {
    backgroundColor: '#1976d2',
    color: 'white',
    padding: '8px',
    textAlign: 'center',
    borderBottom: '1px solid #1565c0'
  };

  const contentStyle: React.CSSProperties = {
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    flex: 1
  };

  const buttonStyle = (type: 'capture' | 'dashboard'): React.CSSProperties => ({
    color: 'white',
    border: 'none',
    padding: '8px 16px',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 500,
    backgroundColor: type === 'capture' 
      ? (isCapturing ? '#f44336' : '#4caf50')
      : '#1976d2',
    boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
    transition: 'background-color 0.3s ease'
  });

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <h1 style={{ margin: 0, fontSize: '16px', fontWeight: 500 }}>API Diff</h1>
      </div>
      <div style={contentStyle}>
        <button 
          style={buttonStyle('capture')}
          onClick={handleCaptureClick}
        >
          {isCapturing ? 'Stop Capture' : 'Start Capture'}
        </button>
        <button 
          style={buttonStyle('dashboard')}
          onClick={handleOpenDashboard}
        >
          Open Dashboard
        </button>
      </div>
    </div>
  );
};

const init = () => {
  console.log('Initializing popup...');
  const root = document.getElementById('root');
  console.log('Root element:', root);

  if (root) {
    console.log('Creating React root...');
    const reactRoot = createRoot(root);
    console.log('Rendering Popup component...');
    reactRoot.render(
      <React.StrictMode>
        <Popup />
      </React.StrictMode>
    );
    console.log('Popup rendered');
  } else {
    console.error('Root element not found');
  }
};

console.log('Setting up init...');
document.addEventListener('DOMContentLoaded', init);
console.log('Init setup complete');

console.log('Popup script loaded'); 