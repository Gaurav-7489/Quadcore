import { useState, useEffect, useRef, useCallback } from 'react';
import cameraService from './services/camera';
import voiceService from './services/voice';
import {
  describeScene,
  readText,
  detectCurrency,
  detectColor,
  askAI,
  detectObjects,
} from './services/api';
import * as tf from '@tensorflow/tfjs';
import * as cocossd from '@tensorflow-models/coco-ssd';
import './App.css';

// ==================== SPLASH SCREEN ====================
function SplashScreen({ onSelectMode }) {
  return (
    <div className="splash">
      <div className="splash-bg" />
      <div className="splash-content">
        <span className="splash-eye">👁️</span>
        <h1 className="splash-title">Second Vision</h1>
        <p className="splash-tagline">
          AI-powered voice-first assistant for the visually impaired
        </p>
        <div className="splash-modes">
          <button
            className="splash-mode-btn splash-mode-btn--demo"
            onClick={() => onSelectMode('demo')}
          >
            <span className="splash-mode-icon">🎯</span>
            <div>
              <span className="splash-mode-label">Demo Mode</span>
              <span className="splash-mode-desc">
                Full UI with visual responses — perfect for presentations &amp; hackathon demos
              </span>
            </div>
          </button>
          <button
            className="splash-mode-btn splash-mode-btn--blind"
            onClick={() => onSelectMode('blind')}
          >
            <span className="splash-mode-icon">👁️‍🗨️</span>
            <div>
              <span className="splash-mode-label">Blind Mode</span>
              <span className="splash-mode-desc">
                Voice-only, camera auto-starts — designed for real use by visually impaired users
              </span>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}

// ==================== CAMERA-FIRST APP (Demo + Blind) ====================
function CameraApp({ mode, onSwitchMode }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const modelRef = useRef(null);
  const lastResponseRef = useRef('');
  const arLoopRef = useRef(null);
  const isNavigatingRef = useRef(false);
  const lastSpokeTimeRef = useRef(0);

  const [cameraReady, setCameraReady] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState('idle');
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingLabel, setProcessingLabel] = useState('Analyzing...');
  const [response, setResponse] = useState(null);
  const [responseLabel, setResponseLabel] = useState('');
  const [lastCommand, setLastCommand] = useState('');
  const [isWalking, setIsWalking] = useState(false);
  const [history, setHistory] = useState([]);
  const [language, setLanguage] = useState(
    localStorage.getItem('sv-language') || 'en-US'
  );

  const langKey = language === 'hi-IN' ? 'hi' : 'en';
  const isDemo = mode === 'demo';

  // ---- Camera init ----
  useEffect(() => {
    const initCamera = async () => {
      if (videoRef.current) {
        const success = await cameraService.startCamera(videoRef.current);
        setCameraReady(success);
        if (success) {
          if (mode === 'blind') {
            voiceService.speak('Camera ready. I am listening. Say describe scene, read text, detect currency, or ask anything.');
          } else {
            voiceService.speak('Demo mode active. Camera ready. Use the buttons below or say a voice command.');
          }
        } else {
          voiceService.speak('Camera access denied. Please allow camera permission.');
        }
      }
    };
    initCamera();
    return () => cameraService.stopCamera();
  }, [mode]);

  // ---- Walk Mode ----
  const stopWalkMode = useCallback(() => {
    isNavigatingRef.current = false;
    setIsWalking(false);
    if (arLoopRef.current) {
      cancelAnimationFrame(arLoopRef.current);
      arLoopRef.current = null;
    }
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    voiceService.speak(langKey === 'hi' ? 'Navigation band.' : 'Walk mode stopped.');
  }, [langKey]);

  const startWalkMode = useCallback(async () => {
    if (!cameraReady || !videoRef.current || !canvasRef.current) {
      voiceService.speak('Camera not ready.');
      return;
    }

    isNavigatingRef.current = true;
    setIsWalking(true);
    voiceService.speak(langKey === 'hi' ? 'Live tracking shuru.' : 'Live tracking started. Loading model...');

    if (!modelRef.current) {
      setIsProcessing(true);
      setProcessingLabel('Loading AI model...');
      try {
        await tf.ready();
        modelRef.current = await cocossd.load({ base: 'lite_mobilenet_v2' });
        voiceService.speak(langKey === 'hi' ? 'Ready. Chalte rahiye.' : 'Ready. Keep walking.');
      } catch (err) {
        console.error('Failed to load COCO-SSD', err);
        voiceService.speak('Failed to load live tracking.');
        stopWalkMode();
        setIsProcessing(false);
        return;
      }
      setIsProcessing(false);
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const detectFrame = async () => {
      if (!isNavigatingRef.current || !modelRef.current) return;
      try {
        const predictions = await modelRef.current.detect(video);
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        let immediateObstacle = null;
        predictions.forEach(pred => {
          const [x, y, width, height] = pred.bbox;
          const areaRatio = (width * height) / (canvas.width * canvas.height);
          const isImmediate = areaRatio > 0.25;
          const centerX = x + (width / 2);
          let position = 'center';
          if (centerX < canvas.width * 0.33) position = 'left';
          else if (centerX > canvas.width * 0.66) position = 'right';

          if (isImmediate && (!immediateObstacle || pred.score > immediateObstacle.score)) {
            immediateObstacle = { ...pred, position };
          }

          ctx.strokeStyle = isImmediate ? '#ff4757' : '#2ed573';
          ctx.lineWidth = isImmediate ? 6 : 3;
          ctx.strokeRect(x, y, width, height);
          ctx.fillStyle = isImmediate ? '#ff4757' : '#2ed573';
          ctx.font = 'bold 24px Arial';
          ctx.fillText(`${pred.class} (${Math.round(pred.score * 100)}%)`, x, y > 24 ? y - 5 : y + 24);
        });

        const now = Date.now();
        if (immediateObstacle && (now - lastSpokeTimeRef.current > 3500)) {
          lastSpokeTimeRef.current = now;
          const msg = langKey === 'hi'
            ? `Dhyan dein, aapke ${immediateObstacle.position === 'center' ? 'saamne' : immediateObstacle.position === 'left' ? 'baayein' : 'daayein'} ek ${immediateObstacle.class} hai.`
            : `Caution. ${immediateObstacle.class} immediately to your ${immediateObstacle.position}.`;
          voiceService.speak(msg, language);
        }
      } catch (err) {
        console.error('AR Loop Error:', err);
      }
      if (isNavigatingRef.current) {
        arLoopRef.current = requestAnimationFrame(detectFrame);
      }
    };

    detectFrame();
  }, [cameraReady, langKey, language, stopWalkMode]);

  // Cleanup walk mode on unmount
  useEffect(() => {
    return () => {
      isNavigatingRef.current = false;
      if (arLoopRef.current) cancelAnimationFrame(arLoopRef.current);
    };
  }, []);

  // ---- Action handler ----
  const handleAction = useCallback(async (action, query = '') => {
    if (isWalking) stopWalkMode();
    if (isProcessing) {
      voiceService.speak('Please wait, still processing.');
      return;
    }
    if (!cameraReady) {
      voiceService.speak('Camera not ready.');
      return;
    }

    setIsProcessing(true);
    setResponse(null);

    const labels = {
      describe_scene: '👁️ Scene Description',
      read_text: '📖 Text Reading',
      detect_currency: '💵 Currency Detection',
      detect_color: '🎨 Color Detection',
      detect_objects: '🪑 Object Detection',
      ask_ai: '🧠 AI Answer',
    };
    setResponseLabel(labels[action] || '🧠 AI Answer');

    const statusMessages = {
      describe_scene: langKey === 'hi' ? 'Scene analyze kar raha hu...' : 'Analyzing scene...',
      read_text: langKey === 'hi' ? 'Text padh raha hu...' : 'Reading text...',
      detect_currency: langKey === 'hi' ? 'Currency check kar raha hu...' : 'Checking currency...',
      detect_color: langKey === 'hi' ? 'Rang detect kar raha hu...' : 'Detecting colors...',
      detect_objects: langKey === 'hi' ? 'Objects detect kar raha hu...' : 'Detecting objects...',
      ask_ai: langKey === 'hi' ? 'Soch raha hu...' : 'Thinking...',
    };
    setProcessingLabel(statusMessages[action] || 'Processing...');
    setLastCommand(query || action.replace(/_/g, ' '));

    try {
      const frame = cameraService.captureFrame(0.7);
      if (!frame) throw new Error('Could not capture camera frame');

      await voiceService.speak(statusMessages[action] || 'Processing...');

      let result;
      switch (action) {
        case 'describe_scene':
          result = await describeScene(frame, langKey);
          break;
        case 'read_text':
          result = await readText(frame);
          break;
        case 'detect_currency':
          result = await detectCurrency(frame, langKey);
          break;
        case 'detect_color':
          result = await detectColor(frame, langKey);
          break;
        case 'detect_objects':
          result = await detectObjects(frame, langKey);
          break;
        case 'ask_ai':
          result = await askAI(frame, query, langKey);
          break;
        default:
          result = await askAI(frame, query || action, langKey);
      }

      setResponse(result);
      lastResponseRef.current = result;

      // Add to history (demo mode)
      if (isDemo) {
        setHistory(prev => [{
          label: labels[action] || action,
          text: result.length > 80 ? result.substring(0, 80) + '...' : result,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        }, ...prev.slice(0, 4)]);
      }

      await voiceService.speak(result, language);
    } catch (err) {
      console.error('[Action Error]', err);
      const errorMsg = 'Sorry, something went wrong. Please try again.';
      setResponse(errorMsg);
      setResponseLabel('⚠️ Error');
      await voiceService.speak(errorMsg);
    } finally {
      setIsProcessing(false);
    }
  }, [isProcessing, isWalking, cameraReady, langKey, language, isDemo, stopWalkMode]);

  // ---- Voice commands ----
  const handleVoiceCommand = useCallback((transcript) => {
    const text = transcript.toLowerCase();
    setLastCommand(transcript);

    if (text.includes('walk') || text.includes('navigate') || text.includes('chalo')) {
      if (!isWalking) startWalkMode();
      return;
    }
    if (text.includes('stop walk') || (isWalking && (text.includes('stop') || text.includes('ruko')))) {
      stopWalkMode();
      return;
    }

    const command = voiceService.parseCommand(transcript);

    switch (command.action) {
      case 'navigate':
        // In camera-first mode, just announce
        voiceService.speak(command.target === '/sos' ? 'SOS mode not available in camera view. Say SOS to send alert.' : 'Navigation not available in this mode.');
        break;
      case 'describe_scene':
        handleAction('describe_scene');
        break;
      case 'read_text':
        handleAction('read_text');
        break;
      case 'detect_currency':
        handleAction('detect_currency');
        break;
      case 'detect_color':
        handleAction('detect_color');
        break;
      case 'detect_objects':
        handleAction('detect_objects');
        break;
      case 'stop':
        voiceService.stopSpeaking();
        setIsProcessing(false);
        break;
      case 'repeat':
        if (lastResponseRef.current) {
          voiceService.speak(lastResponseRef.current, language);
        } else {
          voiceService.speak('Nothing to repeat.');
        }
        break;
      case 'ask_ai':
        handleAction('ask_ai', command.query);
        break;
      default:
        handleAction('ask_ai', transcript);
    }
  }, [isWalking, language, handleAction, startWalkMode, stopWalkMode]);

  // ---- Voice setup ----
  useEffect(() => {
    voiceService.onStatusChange = (status) => {
      setVoiceStatus(status);
    };
    voiceService.onResult = handleVoiceCommand;

    // Auto-start listening
    if (!voiceService.isListening && !voiceService.isSpeaking) {
      setTimeout(() => voiceService.startListening(), 500);
    }

    return () => {
      voiceService.onResult = null;
      voiceService.onStatusChange = null;
    };
  }, [handleVoiceCommand]);

  // ---- Language toggle ----
  const toggleLanguage = () => {
    const newLang = language === 'en-US' ? 'hi-IN' : 'en-US';
    setLanguage(newLang);
    localStorage.setItem('sv-language', newLang);
    voiceService.setLanguage(newLang);
    voiceService.speak(newLang === 'hi-IN' ? 'Hindi mein switch kiya.' : 'Switched to English.');
  };

  // ---- Voice button click ----
  const handleVoiceClick = () => {
    if (voiceService.isSpeaking) {
      voiceService.stopSpeaking();
    } else if (voiceStatus === 'listening') {
      voiceService.stopListening();
    } else {
      voiceService.startListening();
    }
  };

  return (
    <div className="app">
      {/* Full-screen Camera */}
      <video
        ref={videoRef}
        className="camera-fullscreen"
        autoPlay
        playsInline
        muted
      />

      {/* AR Canvas Overlay */}
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          pointerEvents: 'none',
          zIndex: 2,
          objectFit: 'cover',
        }}
      />

      {/* Status Bar */}
      <div className="status-bar">
        <div className={`status-indicator ${voiceStatus}`}>
          <span className="status-dot-live" />
          <span className="status-text">
            {isWalking ? 'WALKING' : voiceStatus === 'speaking' ? 'SPEAKING' : voiceStatus === 'listening' ? 'LISTENING' : 'READY'}
          </span>
        </div>

        <div className="status-right">
          <button
            className={`mode-toggle ${mode === 'blind' ? 'mode-toggle--blind' : ''}`}
            onClick={onSwitchMode}
          >
            {isDemo ? '🎯 DEMO' : '👁️ BLIND'}
          </button>
          <button
            className="icon-btn"
            onClick={() => {
              cameraService.switchCamera();
              voiceService.speak('Switching camera');
            }}
            aria-label="Switch camera"
          >
            🔄
          </button>
          <button
            className="icon-btn"
            onClick={() => {
              const ok = cameraService.toggleFlashlight();
              voiceService.speak(ok ? 'Flashlight toggled' : 'Not supported');
            }}
            aria-label="Toggle flashlight"
          >
            🔦
          </button>
        </div>
      </div>

      {/* Last command display */}
      {lastCommand && (
        <div className="command-display">
          <span>🗣️ "{lastCommand}"</span>
        </div>
      )}

      {/* Processing overlay */}
      {isProcessing && (
        <div className="processing-overlay">
          <div className="processing-ring" />
          <span className="processing-text">{processingLabel}</span>
        </div>
      )}

      {/* DEMO MODE: Response Panel */}
      {isDemo && response && !isProcessing && (
        <div className="demo-response-panel">
          <div className="demo-response-card">
            <div className="demo-response-header">
              <span className="demo-response-label">{responseLabel}</span>
              <span className="demo-response-command">"{lastCommand}"</span>
            </div>
            <p className="demo-response-text">{response}</p>
          </div>
        </div>
      )}

      {/* BLIND MODE: Minimal response */}
      {!isDemo && response && !isProcessing && (
        <div className="response-overlay">
          <div className="response-card-main">
            <p>{response}</p>
          </div>
        </div>
      )}

      {/* DEMO MODE: History sidebar */}
      {isDemo && history.length > 0 && (
        <div className="demo-history">
          <span className="demo-history-title">History</span>
          {history.map((item, i) => (
            <div className="demo-history-item" key={i}>
              <span className="demo-history-label">{item.label}</span>
              <p className="demo-history-text">{item.text}</p>
              <span className="demo-history-time">{item.time}</span>
            </div>
          ))}
        </div>
      )}

      {/* Bottom Controls */}
      <div className="bottom-controls">
        {/* Quick action buttons */}
        <div className="quick-actions">
          <button className="quick-btn" onClick={() => handleAction('describe_scene')} disabled={isProcessing || !cameraReady}>
            <span>👁️</span><span>Describe</span>
          </button>
          <button className="quick-btn" onClick={() => handleAction('read_text')} disabled={isProcessing || !cameraReady}>
            <span>📖</span><span>Read</span>
          </button>
          <button className="quick-btn" onClick={() => handleAction('detect_currency')} disabled={isProcessing || !cameraReady}>
            <span>💵</span><span>Currency</span>
          </button>
          <button className="quick-btn" onClick={() => handleAction('detect_color')} disabled={isProcessing || !cameraReady}>
            <span>🎨</span><span>Color</span>
          </button>
          <button className="quick-btn" onClick={() => handleAction('detect_objects')} disabled={isProcessing || !cameraReady}>
            <span>🪑</span><span>Objects</span>
          </button>
          <button
            className="quick-btn"
            onClick={() => isWalking ? stopWalkMode() : startWalkMode()}
            disabled={!cameraReady}
            style={isWalking ? { borderColor: '#ff4757', background: 'rgba(255, 71, 87, 0.15)' } : {}}
          >
            <span>{isWalking ? '🛑' : '🚶'}</span>
            <span>{isWalking ? 'Stop' : 'Walk'}</span>
          </button>
        </div>

        {/* Main controls: SOS, Voice, Language */}
        <div className="main-controls">
          <button className="sos-btn" onClick={() => {
            voiceService.speak('Opening emergency SOS');
            // Use Web Share or tel: for SOS in camera-first mode
            window.location.href = 'tel:112';
          }} aria-label="Emergency SOS">
            🚨
          </button>

          <button
            className={`voice-btn-main ${voiceStatus === 'listening' ? 'voice-btn-main--listening' : ''} ${voiceStatus === 'speaking' ? 'voice-btn-main--speaking' : ''}`}
            onClick={handleVoiceClick}
            aria-label="Voice control"
          >
            {voiceStatus === 'listening' && (
              <>
                <span className="voice-ring-main r1" />
                <span className="voice-ring-main r2" />
              </>
            )}
            <span className="voice-btn-icon">
              {voiceStatus === 'speaking' ? '🔊' : voiceStatus === 'listening' ? '👂' : '🎤'}
            </span>
          </button>

          <button className="lang-btn" onClick={toggleLanguage} aria-label="Switch language">
            {language === 'hi-IN' ? 'EN' : 'हि'}
          </button>
        </div>

        {/* Demo mode hint */}
        {isDemo && (
          <p className="demo-hint">
            Say: "describe scene", "read text", "detect currency", "what color", "walk mode" or ask any question
          </p>
        )}
      </div>
    </div>
  );
}

// ==================== MAIN APP ====================
function App() {
  const [mode, setMode] = useState(() => {
    return localStorage.getItem('sv-mode') || null;
  });

  const handleSelectMode = (selectedMode) => {
    setMode(selectedMode);
    localStorage.setItem('sv-mode', selectedMode);
  };

  const handleSwitchMode = () => {
    const newMode = mode === 'demo' ? 'blind' : 'demo';
    setMode(newMode);
    localStorage.setItem('sv-mode', newMode);
    voiceService.speak(newMode === 'demo' ? 'Switched to demo mode.' : 'Switched to blind mode.');
  };

  // No mode selected → show splash
  if (!mode) {
    return <SplashScreen onSelectMode={handleSelectMode} />;
  }

  // Mode selected → camera-first experience
  return <CameraApp mode={mode} onSwitchMode={handleSwitchMode} />;
}

export default App;
