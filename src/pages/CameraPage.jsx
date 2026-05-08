import { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import cameraService from '../services/camera';
import voiceService from '../services/voice';
import {
  describeScene,
  readText,
  detectCurrency,
  detectColor,
  askAI,
  detectObjects,
  formatObjectResults,
  navigatePath,
} from '../services/api';
import * as tf from '@tensorflow/tfjs';
import * as cocossd from '@tensorflow-models/coco-ssd';
import VoiceButton from '../components/VoiceButton';
import ResponseCard from '../components/ResponseCard';
import './CameraPage.css';

export default function CameraPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const modelRef = useRef(null);
  const lastResponseRef = useRef('');
  const arLoopRef = useRef(null);
  const isNavigatingRef = useRef(false);
  const lastSpokeTimeRef = useRef(0);

  const [cameraReady, setCameraReady] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState('idle');
  const [isProcessing, setIsProcessing] = useState(false);
  const [response, setResponse] = useState(null);
  const [responseType, setResponseType] = useState('info');
  const [language] = useState(
    localStorage.getItem('sv-language') || 'en-US'
  );

  const [isNavigating, setIsNavigating] = useState(false);

  const stopWalkMode = useCallback(() => {
    isNavigatingRef.current = false;
    setIsNavigating(false);
    if (arLoopRef.current) {
      cancelAnimationFrame(arLoopRef.current);
      arLoopRef.current = null;
    }
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    voiceService.speak(language === 'hi-IN' ? 'Navigation band kar diya.' : 'Walk mode stopped.');
  }, [language]);

  const startWalkMode = useCallback(async () => {
    if (!cameraReady || !videoRef.current || !canvasRef.current) {
      voiceService.speak('Camera not ready.');
      return;
    }

    isNavigatingRef.current = true;
    setIsNavigating(true);
    voiceService.speak(language === 'hi-IN' ? 'Live tracking shuru. Model load ho raha hai...' : 'Live tracking started. Loading AI model...');

    if (!modelRef.current) {
      setIsProcessing(true);
      try {
        await tf.ready();
        modelRef.current = await cocossd.load({ base: 'lite_mobilenet_v2' });
        voiceService.speak(language === 'hi-IN' ? 'Ready. Chalte rahiye.' : 'Ready. Keep walking.');
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
    
    // Match canvas to video exact resolution
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const detectFrame = async () => {
      if (!isNavigatingRef.current || !modelRef.current) return;

      try {
        const predictions = await modelRef.current.detect(video);
        
        // Clear previous drawings
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        let immediateObstacle = null;
        
        predictions.forEach(pred => {
          const [x, y, width, height] = pred.bbox;
          // Calculate if object is dangerously close (takes up > 25% of screen area)
          const areaRatio = (width * height) / (canvas.width * canvas.height);
          const isImmediate = areaRatio > 0.25;
          
          const centerX = x + (width / 2);
          let position = 'center';
          if (centerX < canvas.width * 0.33) position = 'left';
          else if (centerX > canvas.width * 0.66) position = 'right';

          if (isImmediate && (!immediateObstacle || pred.score > immediateObstacle.score)) {
            immediateObstacle = { ...pred, position };
          }

          // Draw Bounding Box
          ctx.strokeStyle = isImmediate ? '#ff4757' : '#2ed573';
          ctx.lineWidth = isImmediate ? 6 : 3;
          ctx.strokeRect(x, y, width, height);

          // Draw Label
          ctx.fillStyle = isImmediate ? '#ff4757' : '#2ed573';
          ctx.font = 'bold 24px Arial';
          ctx.fillText(
            `${pred.class} (${Math.round(pred.score * 100)}%)`, 
            x, y > 24 ? y - 5 : y + 24
          );
        });

        const now = Date.now();
        if (immediateObstacle && (now - lastSpokeTimeRef.current > 3500)) { // Speak every 3.5s max
          lastSpokeTimeRef.current = now;
          const msg = language === 'hi-IN' 
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
  }, [cameraReady, language, stopWalkMode]);

  useEffect(() => {
    return () => {
      isNavigatingRef.current = false;
      if (arLoopRef.current) cancelAnimationFrame(arLoopRef.current);
    };
  }, []);

  const handleAction = useCallback(async (action, query = '') => {
    if (isNavigating) stopWalkMode();
    if (isProcessing) {
      voiceService.speak('Please wait, I am still processing.');
      return;
    }
    if (!cameraReady) {
      voiceService.speak('Camera is not ready yet. Please wait.');
      return;
    }

    setIsProcessing(true);
    setResponse(null);

    const typeMap = {
      describe_scene: 'scene',
      read_text: 'text',
      detect_currency: 'currency',
      detect_color: 'color',
      detect_objects: 'objects',
      ask_ai: 'info',
    };
    setResponseType(typeMap[action] || 'info');

    try {
      let result;
      const langKey = language === 'hi-IN' ? 'hi' : 'en';

      if (action === 'detect_objects') {
        voiceService.speak(langKey === 'hi' ? 'Objects detect kar raha hu...' : 'Detecting objects...');
        const predictions = await detectObjects(videoRef.current);
        result = formatObjectResults(predictions, langKey);
      } else {
        const frame = cameraService.captureFrame(0.7);
        if (!frame) {
          throw new Error('Could not capture camera frame');
        }

        const statusMessages = {
          describe_scene: langKey === 'hi' ? 'Scene analyze kar raha hu...' : 'Analyzing your surroundings...',
          read_text: langKey === 'hi' ? 'Text padh raha hu...' : 'Reading text...',
          detect_currency: langKey === 'hi' ? 'Currency check kar raha hu...' : 'Checking currency...',
          detect_color: langKey === 'hi' ? 'Rang detect kar raha hu...' : 'Detecting colors...',
          ask_ai: langKey === 'hi' ? 'Soch raha hu...' : 'Thinking...',
        };

        await voiceService.speak(statusMessages[action] || 'Processing...');

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
          case 'ask_ai':
            result = await askAI(frame, query, langKey);
            break;
        }
      }

      setResponse(result);
      lastResponseRef.current = result;
      await voiceService.speak(result, language);
      // After speaking result, tell user they can ask more
      await voiceService.speak(
        language === 'hi-IN'
          ? 'Aur koi command boliye.'
          : 'You can say another command.'
      );
    } catch (err) {
      console.error('[Camera] Action error:', err);
      const errorMsg = 'Sorry, something went wrong. Please try again. Say describe scene or read text.';
      setResponse(errorMsg);
      setResponseType('error');
      await voiceService.speak(errorMsg);
    } finally {
      setIsProcessing(false);
    }
  }, [isProcessing, cameraReady, language]);

  // Start camera on mount
  useEffect(() => {
    const initCamera = async () => {
      if (videoRef.current) {
        const success = await cameraService.startCamera(videoRef.current);
        setCameraReady(success);
        if (success) {
          voiceService.speak('Camera is ready. Say: describe scene, read text, detect currency, detect color, or ask me anything.');
        } else {
          voiceService.speak('Camera access denied. Please allow camera permission in your browser and try again.');
          setResponse('Camera access denied. Please allow camera permission.');
          setResponseType('error');
        }
      }
    };

    initCamera();

    return () => {
      cameraService.stopCamera();
    };
  }, []);

  // Handle auto-action from navigation state
  useEffect(() => {
    if (cameraReady && location.state?.autoAction) {
      const { autoAction, query } = location.state;
      const timer = setTimeout(() => {
        handleAction(autoAction, query);
      }, 1500); // Give camera time to warm up
      window.history.replaceState({}, '');
      return () => clearTimeout(timer);
    }
  }, [cameraReady, location.state, handleAction]);

  // Voice setup - always on
  useEffect(() => {
    voiceService.onStatusChange = (status) => {
      setVoiceStatus(status);
      setIsListening(status === 'listening');
    };

    voiceService.onResult = (transcript) => {
      handleVoiceCommand(transcript);
    };

    return () => {
      voiceService.onResult = null;
      voiceService.onStatusChange = null;
    };
  }, [cameraReady, language, handleAction]);

  const handleVoiceCommand = useCallback((transcript) => {
    const text = transcript.toLowerCase();
    if (text.includes('walk') || text.includes('navigate') || text.includes('chalo')) {
      if (!isNavigating) startWalkMode();
      return;
    }

    const command = voiceService.parseCommand(transcript);

    switch (command.action) {
      case 'navigate':
        voiceService.speak(command.target === '/' ? 'Going home' : 'Navigating');
        setTimeout(() => navigate(command.target), 600);
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
        if (isNavigating) {
          stopWalkMode();
        } else {
          voiceService.stopSpeaking();
          setIsProcessing(false);
        }
        break;
      case 'repeat':
        if (lastResponseRef.current) {
          voiceService.speak(lastResponseRef.current, language);
        } else {
          voiceService.speak('Nothing to repeat. Try saying describe scene first.');
        }
        break;
      case 'ask_ai':
        handleAction('ask_ai', command.query);
        break;
      default:
        handleAction('ask_ai', transcript);
    }
  }, [cameraReady, language, navigate, handleAction]);

  const handleVoiceClick = () => {
    if (voiceService.isSpeaking) {
      voiceService.stopSpeaking();
    } else if (isListening) {
      voiceService.stopListening();
    } else {
      voiceService.startListening();
    }
  };

  return (
    <div className="page camera-page">
      {/* Camera View */}
      <div className="camera-view">
        <video
          ref={videoRef}
          className="camera-video"
          autoPlay
          playsInline
          muted
        />
        <canvas
          ref={canvasRef}
          className="camera-canvas-overlay"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            pointerEvents: 'none',
            zIndex: 2,
            objectFit: 'cover'
          }}
        />
        {!cameraReady && (
          <div className="camera-placeholder">
            <span className="camera-placeholder__icon">📷</span>
            <p>Initializing camera...</p>
          </div>
        )}

        {/* Processing overlay */}
        {isProcessing && (
          <div className="camera-processing-overlay">
            <div className="camera-processing-pulse"></div>
            <span>Analyzing...</span>
          </div>
        )}

        {/* Camera controls overlay */}
        <div className="camera-overlay-top">
          {/* Always-on indicator */}
          <div className={`camera-live-badge ${isListening ? 'camera-live-badge--active' : ''}`}>
            <span className="camera-live-dot"></span>
            {isNavigating ? 'WALKING' : voiceStatus === 'speaking' ? 'SPEAKING' : isListening ? 'LISTENING' : 'READY'}
          </div>
          <div className="camera-overlay-btns">
            <button
              className="camera-btn-icon"
              onClick={() => {
                cameraService.switchCamera();
                voiceService.speak('Switching camera');
              }}
              aria-label="Switch camera"
            >
              🔄
            </button>
            <button
              className="camera-btn-icon"
              onClick={() => {
                const success = cameraService.toggleFlashlight();
                voiceService.speak(success ? 'Flashlight toggled' : 'Flashlight not supported');
              }}
              aria-label="Toggle flashlight"
            >
              🔦
            </button>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="camera-actions">
        <button
          className="camera-action-btn"
          onClick={() => isNavigating ? stopWalkMode() : startWalkMode()}
          disabled={!cameraReady}
          style={isNavigating ? { borderColor: 'var(--sos-red)', background: 'rgba(255, 71, 87, 0.1)' } : {}}
        >
          <span>{isNavigating ? '🛑' : '🚶'}</span>
          <span>{isNavigating ? 'Stop Walk' : 'Walk'}</span>
        </button>
        <button
          className="camera-action-btn"
          onClick={() => handleAction('describe_scene')}
          disabled={isProcessing || !cameraReady || isNavigating}
        >
          <span>👁️</span>
          <span>Describe</span>
        </button>
        <button
          className="camera-action-btn"
          onClick={() => handleAction('read_text')}
          disabled={isProcessing || !cameraReady || isNavigating}
        >
          <span>📖</span>
          <span>Read</span>
        </button>
        <button
          className="camera-action-btn"
          onClick={() => handleAction('detect_currency')}
          disabled={isProcessing || !cameraReady || isNavigating}
        >
          <span>💵</span>
          <span>Currency</span>
        </button>
        <button
          className="camera-action-btn"
          onClick={() => handleAction('detect_color')}
          disabled={isProcessing || !cameraReady || isNavigating}
        >
          <span>🎨</span>
          <span>Color</span>
        </button>
        <button
          className="camera-action-btn"
          onClick={() => handleAction('detect_objects')}
          disabled={isProcessing || !cameraReady || isNavigating}
        >
          <span>🪑</span>
          <span>Objects</span>
        </button>
      </div>

      {/* Voice */}
      <div className="camera-voice-section">
        <VoiceButton
          isListening={isListening}
          status={voiceStatus}
          onClick={handleVoiceClick}
        />
      </div>

      {/* Response */}
      <ResponseCard
        response={response}
        isLoading={isProcessing}
        type={responseType}
      />
    </div>
  );
}
