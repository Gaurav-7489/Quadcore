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
  getLocation,
} from './services/api';
import './App.css';

function requestFullscreen() {
  const el = document.documentElement;
  if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
  else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
}

function App() {
  const [started, setStarted] = useState(false);
  const [mode, setMode] = useState('demo'); // 'demo' or 'blind'
  const [cameraReady, setCameraReady] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState('idle');
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentAction, setCurrentAction] = useState('');
  const [lastResponse, setLastResponse] = useState('');
  const [lastCommand, setLastCommand] = useState('');
  const [responseHistory, setResponseHistory] = useState([]);
  const [language, setLanguage] = useState(localStorage.getItem('sv-language') || 'en-US');
  const videoRef = useRef(null);
  const lastResponseRef = useRef('');
  const isProcessingRef = useRef(false);

  // ========== START ==========
  const handleStart = (selectedMode) => {
    requestFullscreen();
    setMode(selectedMode);
    setStarted(true);
  };

  // ========== MODE SWITCH ==========
  const switchMode = () => {
    const newMode = mode === 'demo' ? 'blind' : 'demo';
    setMode(newMode);

    if (newMode === 'blind') {
      voiceService.continuousMode = true;
      voiceService.startListening();
      voiceService.speak('Blind mode activated. I am always listening. Just speak your commands.');
    } else {
      voiceService.continuousMode = false;
      voiceService.stopListening();
      voiceService.speak('Demo mode activated. Tap the microphone to speak, or use the buttons.');
    }
  };

  // ========== CAMERA ==========
  useEffect(() => {
    if (!started || !videoRef.current) return;

    const initCamera = async () => {
      const success = await cameraService.startCamera(videoRef.current);
      setCameraReady(success);

      if (success) {
        if (mode === 'blind') {
          await voiceService.speak('Second Vision is ready. Camera is on. Let me describe your surroundings.');
          setTimeout(() => handleAction('describe_scene'), 500);
        } else {
          await voiceService.speak('Second Vision is ready. Use the buttons or tap the microphone to give a command.');
        }
      } else {
        voiceService.speak('Camera access denied. Please allow camera permission.');
      }
    };

    initCamera();
    return () => cameraService.stopCamera();
  }, [started]);

  // ========== VOICE ==========
  useEffect(() => {
    if (!started) return;

    voiceService.continuousMode = mode === 'blind';

    voiceService.onStatusChange = (status) => {
      setVoiceStatus(status);
      setIsListening(status === 'listening');
    };

    voiceService.onResult = (transcript) => {
      setLastCommand(transcript);
      handleVoiceCommand(transcript);
    };

    // In blind mode, start continuous listening
    if (mode === 'blind') {
      voiceService.startListening();
    }

    return () => {
      voiceService.onResult = null;
      voiceService.onStatusChange = null;
    };
  }, [started, cameraReady, language, mode]);

  // ========== VOICE COMMANDS ==========
  const handleVoiceCommand = useCallback((transcript) => {
    const text = transcript.toLowerCase().trim();

    if (text.includes('emergency') || text.includes('sos') || text.includes('help me') || text.includes('madad') || text.includes('bachao')) {
      handleSOS(); return;
    }
    if (text.includes('stop') || text.includes('ruko') || text.includes('band') || text.includes('chup')) {
      voiceService.stopSpeaking(); setIsProcessing(false); isProcessingRef.current = false; return;
    }
    if (text.includes('repeat') || text.includes('phir se') || text.includes('again') || text.includes('dubara')) {
      if (lastResponseRef.current) voiceService.speak(lastResponseRef.current, language);
      else voiceService.speak('Nothing to repeat.');
      return;
    }
    if (text.includes('switch mode') || text.includes('demo mode') || text.includes('blind mode')) {
      switchMode(); return;
    }
    if (text.includes('describe') || text.includes('scene') || text.includes('surroundings') ||
        text.includes('what is') || text.includes('kya hai') || text.includes('samne') ||
        text.includes('around') || text.includes('what do you see') || text.includes('kya dikh') ||
        text.includes('batao') || text.includes('look') || text.includes('dekho') || text.includes('check')) {
      handleAction('describe_scene'); return;
    }
    if (text.includes('read') || text.includes('text') || text.includes('padh') || text.includes('likha') ||
        text.includes('written') || text.includes('board') || text.includes('label') ||
        text.includes('medicine') || text.includes('menu') || text.includes('book')) {
      handleAction('read_text'); return;
    }
    if (text.includes('currency') || text.includes('money') || text.includes('note') ||
        text.includes('paisa') || text.includes('rupee') || text.includes('rupay') ||
        text.includes('kitne ka') || text.includes('how much') || text.includes('cash')) {
      handleAction('detect_currency'); return;
    }
    if (text.includes('color') || text.includes('colour') || text.includes('rang')) {
      handleAction('detect_color'); return;
    }
    if (text.includes('object') || text.includes('detect') || text.includes('count') ||
        text.includes('kitne') || text.includes('how many') || text.includes('people') || text.includes('log')) {
      handleAction('detect_objects'); return;
    }
    if (text.includes('switch camera') || text.includes('flip') || text.includes('front camera') || text.includes('selfie')) {
      cameraService.switchCamera(); voiceService.speak('Camera switched.'); return;
    }
    if (text.includes('flash') || text.includes('torch') || text.includes('light')) {
      cameraService.toggleFlashlight(); voiceService.speak('Flashlight toggled.'); return;
    }
    if (text.includes('hindi')) { changeLanguage('hi-IN'); return; }
    if (text.includes('english')) { changeLanguage('en-US'); return; }

    // Default - ask AI
    if (text.length > 3) handleAction('ask_ai', transcript);
  }, [cameraReady, language, mode]);

  // ========== AI ACTIONS ==========
  const handleAction = async (action, query = '') => {
    if (isProcessingRef.current) {
      voiceService.speak('Please wait, still processing.');
      return;
    }
    if (!cameraReady) {
      voiceService.speak('Camera is not ready.');
      return;
    }

    isProcessingRef.current = true;
    setIsProcessing(true);
    setCurrentAction(action);

    const actionLabels = {
      describe_scene: '👁️ Scene Description',
      read_text: '📖 Text Reading',
      detect_currency: '💵 Currency Detection',
      detect_color: '🎨 Color Detection',
      detect_objects: '🪑 Object Detection',
      ask_ai: '🧠 AI Answer',
    };

    try {
      let result;
      const langKey = language === 'hi-IN' ? 'hi' : 'en';
      const frame = cameraService.captureFrame(0.7);
      if (!frame) throw new Error('Could not capture frame');

      switch (action) {
        case 'describe_scene': result = await describeScene(frame, langKey); break;
        case 'read_text': result = await readText(frame); break;
        case 'detect_currency': result = await detectCurrency(frame, langKey); break;
        case 'detect_color': result = await detectColor(frame, langKey); break;
        case 'detect_objects': result = await detectObjects(frame, langKey); break;
        case 'ask_ai': result = await askAI(frame, query, langKey); break;
        default: result = await describeScene(frame, langKey);
      }

      setLastResponse(result);
      lastResponseRef.current = result;

      // Add to history for demo mode
      setResponseHistory(prev => [{
        label: actionLabels[action] || '🧠 AI',
        text: result,
        time: new Date().toLocaleTimeString(),
        command: query || action.replace('_', ' '),
      }, ...prev].slice(0, 10));

      await voiceService.speak(result, language);
    } catch (err) {
      console.error('[App] Error:', err);
      const errorMsg = 'Sorry, something went wrong. Please check your internet connection and try again.';
      setLastResponse(errorMsg);
      await voiceService.speak(errorMsg);
    } finally {
      isProcessingRef.current = false;
      setIsProcessing(false);
      setCurrentAction('');
    }
  };

  // ========== SOS ==========
  const handleSOS = async () => {
    await voiceService.speak('Sending emergency alert with your location.');
    try {
      const loc = await getLocation();
      const mapsUrl = `https://maps.google.com/?q=${loc.latitude},${loc.longitude}`;
      const msg = `🚨 EMERGENCY! I need help! My location: ${mapsUrl}`;
      if (navigator.share) {
        await navigator.share({ title: '🚨 SOS', text: msg, url: mapsUrl });
        voiceService.speak('Emergency alert shared!');
      } else {
        await navigator.clipboard.writeText(msg);
        voiceService.speak('Location copied to clipboard.');
      }
    } catch {
      voiceService.speak('Could not get location. Calling emergency services.');
      window.location.href = 'tel:112';
    }
  };

  const changeLanguage = (lang) => {
    setLanguage(lang);
    localStorage.setItem('sv-language', lang);
    voiceService.setLanguage(lang);
    voiceService.speak(`Language changed to ${lang === 'hi-IN' ? 'Hindi' : 'English'}.`, lang);
  };

  // Push to talk for demo mode
  const handleMicPress = () => {
    if (voiceService.isSpeaking) {
      voiceService.stopSpeaking();
    } else if (isListening) {
      voiceService.stopListening();
    } else {
      voiceService.startListening();
    }
  };

  // ========== SPLASH ==========
  if (!started) {
    return (
      <div className="splash">
        <div className="splash-bg"></div>
        <div className="splash-content">
          <div className="splash-eye">👁️</div>
          <h1 className="splash-title">Second Vision</h1>
          <p className="splash-tagline">AI-Powered Eyes for the Visually Impaired</p>

          <div className="splash-modes">
            <button className="splash-mode-btn splash-mode-btn--demo" onClick={() => handleStart('demo')}>
              <span className="splash-mode-icon">🖥️</span>
              <span className="splash-mode-label">Demo Mode</span>
              <span className="splash-mode-desc">For presentation — push-to-talk, shows text on screen</span>
            </button>

            <button className="splash-mode-btn splash-mode-btn--blind" onClick={() => handleStart('blind')}>
              <span className="splash-mode-icon">👁️</span>
              <span className="splash-mode-label">Blind Mode</span>
              <span className="splash-mode-desc">For real use — always listening, voice-only, auto-describe</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ========== MAIN APP ==========
  return (
    <div className={`app app--${mode}`}>
      {/* CAMERA */}
      <video ref={videoRef} className="camera-fullscreen" autoPlay playsInline muted />

      {/* TOP BAR */}
      <div className="status-bar">
        <div className={`status-indicator ${voiceStatus}`}>
          <span className="status-dot-live"></span>
          <span className="status-text">
            {isProcessing ? 'ANALYZING' :
             voiceStatus === 'speaking' ? 'SPEAKING' :
             voiceStatus === 'listening' ? 'LISTENING' : 'READY'}
          </span>
        </div>
        <div className="status-right">
          <button className={`mode-toggle ${mode === 'blind' ? 'mode-toggle--blind' : ''}`} onClick={switchMode}>
            {mode === 'demo' ? '🖥️ Demo' : '👁️ Blind'}
          </button>
          <button className="icon-btn" onClick={() => { cameraService.switchCamera(); voiceService.speak('Camera switched'); }}>🔄</button>
          <button className="icon-btn" onClick={() => { cameraService.toggleFlashlight(); voiceService.speak('Flashlight'); }}>🔦</button>
        </div>
      </div>

      {/* PROCESSING */}
      {isProcessing && (
        <div className="processing-overlay">
          <div className="processing-ring"></div>
          <span className="processing-text">
            {currentAction === 'describe_scene' ? '👁️ Analyzing Scene...' :
             currentAction === 'read_text' ? '📖 Reading Text...' :
             currentAction === 'detect_currency' ? '💵 Detecting Currency...' :
             currentAction === 'detect_color' ? '🎨 Detecting Colors...' :
             currentAction === 'detect_objects' ? '🪑 Detecting Objects...' :
             '🧠 Thinking...'}
          </span>
        </div>
      )}

      {/* DEMO MODE: Visual response panel */}
      {mode === 'demo' && lastResponse && !isProcessing && (
        <div className="demo-response-panel">
          <div className="demo-response-card">
            <div className="demo-response-header">
              <span className="demo-response-label">
                {responseHistory[0]?.label || '🧠 AI Response'}
              </span>
              {lastCommand && <span className="demo-response-command">🗣️ "{lastCommand}"</span>}
            </div>
            <p className="demo-response-text">{lastResponse}</p>
          </div>
        </div>
      )}

      {/* BLIND MODE: Minimal response */}
      {mode === 'blind' && lastResponse && !isProcessing && (
        <div className="response-overlay">
          <div className="response-card-main">
            <p>{lastResponse}</p>
          </div>
        </div>
      )}

      {/* Command heard indicator */}
      {lastCommand && (
        <div className="command-display">
          <span>🗣️ "{lastCommand}"</span>
        </div>
      )}

      {/* DEMO MODE: History sidebar */}
      {mode === 'demo' && responseHistory.length > 1 && (
        <div className="demo-history">
          <div className="demo-history-title">📋 History</div>
          {responseHistory.slice(1, 5).map((item, i) => (
            <div key={i} className="demo-history-item">
              <span className="demo-history-label">{item.label}</span>
              <p className="demo-history-text">{item.text.substring(0, 80)}...</p>
              <span className="demo-history-time">{item.time}</span>
            </div>
          ))}
        </div>
      )}

      {/* BOTTOM CONTROLS */}
      <div className="bottom-controls">
        <div className="quick-actions">
          <button className="quick-btn" onClick={() => handleAction('describe_scene')} disabled={isProcessing}>
            <span>👁️</span><span>Scene</span>
          </button>
          <button className="quick-btn" onClick={() => handleAction('read_text')} disabled={isProcessing}>
            <span>📖</span><span>Read</span>
          </button>
          <button className="quick-btn" onClick={() => handleAction('detect_currency')} disabled={isProcessing}>
            <span>💵</span><span>Money</span>
          </button>
          <button className="quick-btn" onClick={() => handleAction('detect_color')} disabled={isProcessing}>
            <span>🎨</span><span>Color</span>
          </button>
          <button className="quick-btn" onClick={() => handleAction('detect_objects')} disabled={isProcessing}>
            <span>🪑</span><span>Objects</span>
          </button>
        </div>

        <div className="main-controls">
          <button className="sos-btn" onClick={handleSOS}>🚨</button>

          <button
            className={`voice-btn-main ${isListening ? 'voice-btn-main--listening' : ''} ${voiceStatus === 'speaking' ? 'voice-btn-main--speaking' : ''}`}
            onClick={handleMicPress}
          >
            {isListening && (
              <>
                <span className="voice-ring-main r1"></span>
                <span className="voice-ring-main r2"></span>
              </>
            )}
            <span className="voice-btn-icon">
              {voiceStatus === 'speaking' ? '🔊' : isListening ? '👂' : '🎤'}
            </span>
          </button>

          <button className="lang-btn" onClick={() => changeLanguage(language === 'en-US' ? 'hi-IN' : 'en-US')}>
            {language === 'hi-IN' ? 'EN' : 'हि'}
          </button>
        </div>

        {/* Demo mode instruction */}
        {mode === 'demo' && !isProcessing && !isListening && (
          <div className="demo-hint">
            Tap 🎤 to speak or use buttons above • Tap 👁️ Blind to switch to always-listening mode
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
