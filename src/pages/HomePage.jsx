import { useNavigate } from 'react-router-dom';
import { useState, useEffect, useCallback } from 'react';
import VoiceButton from '../components/VoiceButton';
import ActionCard from '../components/ActionCard';
import voiceService from '../services/voice';
import './HomePage.css';

export default function HomePage() {
  const navigate = useNavigate();
  const [isListening, setIsListening] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState('idle');
  const [lastCommand, setLastCommand] = useState('');

  const handleVoiceCommand = useCallback((transcript) => {
    setLastCommand(transcript);
    const command = voiceService.parseCommand(transcript);

    switch (command.action) {
      case 'navigate':
        voiceService.speak(
          command.target === '/camera' ? 'Opening camera' :
          command.target === '/sos' ? 'Opening emergency mode' :
          command.target === '/settings' ? 'Opening settings' : 'Going home'
        );
        setTimeout(() => navigate(command.target), 800);
        break;
      case 'describe_scene':
      case 'read_text':
      case 'detect_currency':
      case 'detect_color':
      case 'detect_objects':
        voiceService.speak('Opening camera for you');
        setTimeout(() => navigate('/camera', { state: { autoAction: command.action } }), 800);
        break;
      case 'stop':
        voiceService.stopSpeaking();
        break;
      case 'ask_ai':
        voiceService.speak('Opening camera to answer your question');
        setTimeout(() => navigate('/camera', { state: { autoAction: 'ask_ai', query: command.query } }), 800);
        break;
      default:
        voiceService.speak('I did not understand. Try saying: describe scene, read text, or open camera.');
    }
  }, [navigate]);

  useEffect(() => {
    // Set up voice callbacks
    voiceService.onStatusChange = (status) => {
      setVoiceStatus(status);
      setIsListening(status === 'listening');
    };

    voiceService.onResult = handleVoiceCommand;

    // Auto-start listening with greeting
    const timer = setTimeout(() => {
      voiceService.speak(
        "Welcome to Second Vision. Your AI powered eyes. I am always listening. Just say a command like: describe scene, read text, detect currency, or open camera."
      ).then(() => {
        // Voice will auto-restart listening after speaking
      });
    }, 600);

    return () => {
      clearTimeout(timer);
      voiceService.onResult = null;
      voiceService.onStatusChange = null;
    };
  }, [handleVoiceCommand]);

  const handleVoiceClick = () => {
    if (voiceService.isSpeaking) {
      voiceService.stopSpeaking();
    } else if (isListening) {
      voiceService.stopListening();
    } else {
      voiceService.startListening();
    }
  };

  const features = [
    {
      icon: '👁️',
      title: 'Describe Scene',
      description: 'AI describes what camera sees',
      action: () => {
        voiceService.speak('Opening scene description');
        setTimeout(() => navigate('/camera', { state: { autoAction: 'describe_scene' } }), 600);
      },
    },
    {
      icon: '📖',
      title: 'Read Text',
      description: 'Read text from books, labels, signs',
      action: () => {
        voiceService.speak('Opening text reader');
        setTimeout(() => navigate('/camera', { state: { autoAction: 'read_text' } }), 600);
      },
    },
    {
      icon: '💵',
      title: 'Currency Detection',
      description: 'Identify banknote denominations',
      action: () => {
        voiceService.speak('Opening currency detection');
        setTimeout(() => navigate('/camera', { state: { autoAction: 'detect_currency' } }), 600);
      },
    },
    {
      icon: '🎨',
      title: 'Color Detection',
      description: 'Identify colors of objects',
      action: () => {
        voiceService.speak('Opening color detection');
        setTimeout(() => navigate('/camera', { state: { autoAction: 'detect_color' } }), 600);
      },
    },
    {
      icon: '🪑',
      title: 'Object Detection',
      description: 'Detect and count nearby objects',
      action: () => {
        voiceService.speak('Opening object detection');
        setTimeout(() => navigate('/camera', { state: { autoAction: 'detect_objects' } }), 600);
      },
    },
    {
      icon: '🚨',
      title: 'Emergency SOS',
      description: 'Send emergency alert with location',
      action: () => {
        voiceService.speak('Opening emergency');
        setTimeout(() => navigate('/sos'), 600);
      },
      variant: 'danger',
    },
  ];

  return (
    <div className="page home-page">
      {/* Header */}
      <header className="home-header">
        <div className="home-logo">
          <span className="home-logo__icon">👁️</span>
          <div>
            <h1 className="home-logo__title">Second Vision</h1>
            <p className="home-logo__tagline">Your AI-Powered Eyes</p>
          </div>
        </div>

        {/* Always-on status indicator */}
        <div className={`status-badge ${
          voiceStatus === 'listening' ? 'status-badge--listening' :
          voiceStatus === 'speaking' ? 'status-badge--speaking' :
          'status-badge--listening'
        }`}>
          <span className="status-dot"></span>
          {voiceStatus === 'speaking' ? 'Speaking' : voiceStatus === 'listening' ? 'Listening' : 'Ready'}
        </div>
      </header>

      {/* Voice Button */}
      <div className="home-voice-section">
        <VoiceButton
          isListening={isListening}
          status={voiceStatus}
          onClick={handleVoiceClick}
        />
        {lastCommand && (
          <p className="home-last-command">
            <span>🗣️</span> "{lastCommand}"
          </p>
        )}
      </div>

      {/* Always listening indicator */}
      <div className="home-tip glass-card">
        <span>🎤</span>
        <p>I'm <strong>always listening</strong>. Just say: <strong>"Describe scene"</strong>, <strong>"Read text"</strong>, <strong>"Detect currency"</strong>, or <strong>"Open camera"</strong></p>
      </div>

      {/* Feature Grid */}
      <div className="home-features">
        <h2 className="home-section-title">Quick Actions</h2>
        <div className="home-features__grid">
          {features.map((feature) => (
            <ActionCard
              key={feature.title}
              icon={feature.icon}
              title={feature.title}
              description={feature.description}
              onClick={feature.action}
              variant={feature.variant}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
