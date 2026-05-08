import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import voiceService from '../services/voice';
import { getLocation } from '../services/api';
import './SOSPage.css';

export default function SOSPage() {
  const navigate = useNavigate();
  const [isSending, setIsSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [locationData, setLocationData] = useState(null);
  const [countdown, setCountdown] = useState(null);
  const countdownIntervalRef = useRef(null);

  useEffect(() => {
    voiceService.speak('Emergency page opened. Tap the big red button or say SOS to send emergency alert. Say go home to go back.');

    voiceService.onStatusChange = (status) => {};
    voiceService.onResult = (transcript) => {
      const text = transcript.toLowerCase();
      if (text.includes('sos') || text.includes('help') || text.includes('emergency') || text.includes('send') || text.includes('madad') || text.includes('bachao')) {
        handleSOS();
      } else if (text.includes('call') || text.includes('phone')) {
        voiceService.speak('Calling emergency number');
        callEmergency();
      } else if (text.includes('home') || text.includes('back') || text.includes('ghar')) {
        voiceService.speak('Going home');
        setTimeout(() => navigate('/'), 600);
      } else if (text.includes('cancel') || text.includes('stop') || text.includes('ruko')) {
        if (countdown !== null) {
          cancelSOS();
        } else {
          voiceService.stopSpeaking();
        }
      }
    };

    return () => {
      voiceService.onResult = null;
      voiceService.onStatusChange = null;
      // Clear any running countdown interval on unmount
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
    };
  }, [countdown]);

  const handleSOS = async () => {
    if (isSending) return;

    voiceService.speak('SOS activating in 3 seconds. Say cancel to stop.');
    setCountdown(3);

    // Clear any existing interval before starting a new one
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
    }

    countdownIntervalRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(countdownIntervalRef.current);
          countdownIntervalRef.current = null;
          executeSOS();
          return null;
        }
        voiceService.speak(String(prev - 1));
        return prev - 1;
      });
    }, 1000);
  };

  const cancelSOS = () => {
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    setCountdown(null);
    voiceService.speak('SOS cancelled. You are safe.');
  };

  const executeSOS = async () => {
    setIsSending(true);
    setCountdown(null);
    voiceService.speak('Sending emergency alert now. Getting your location.');

    try {
      const loc = await getLocation();
      setLocationData(loc);

      // Call our Vercel Backend to log the SOS
      import('../services/api').then(({ sendSOS }) => sendSOS(loc)).catch(console.error);

      const mapsUrl = `https://maps.google.com/?q=${loc.latitude},${loc.longitude}`;
      const message = `🚨 EMERGENCY! I need help! My location: ${mapsUrl}`;

      if (navigator.share) {
        try {
          await navigator.share({
            title: '🚨 EMERGENCY SOS - Second Vision',
            text: message,
            url: mapsUrl,
          });
          voiceService.speak('Emergency alert shared successfully! Help is on the way.');
        } catch {
          // Fallback if user cancels share
          fallbackShare(message);
        }
      } else {
        // Fallback for desktop browsers
        fallbackShare(message);
      }

      setSent(true);
    } catch (err) {
      console.error('[SOS] Error:', err);
      voiceService.speak('Could not get your location. Please call emergency services directly. Say call to dial 112.');
      setSent(true);
    } finally {
      setIsSending(false);
    }
  };

  const fallbackShare = async (message) => {
    try {
      await navigator.clipboard.writeText(message);
      voiceService.speak('Location copied. Opening WhatsApp to share with emergency contact.');
      // Open WhatsApp web/app as a visible fallback action
      setTimeout(() => {
        window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank');
      }, 1500);
    } catch (e) {
      console.error('Clipboard failed', e);
    }
  };

  const callEmergency = () => {
    voiceService.speak('Calling emergency services now.');
    setTimeout(() => {
      window.location.href = 'tel:112';
    }, 1000);
  };

  return (
    <div className="page sos-page">
      <header className="page-header">
        <h1 className="page-title">🚨 Emergency SOS</h1>
        <p className="page-subtitle">Send emergency alert with your location</p>
      </header>

      <div className="sos-button-container">
        {countdown !== null ? (
          <button className="sos-cancel-btn" onClick={cancelSOS}>
            <span className="sos-countdown">{countdown}</span>
            <span className="sos-cancel-text">Tap to Cancel</span>
          </button>
        ) : (
          <button
            className={`sos-button ${sent ? 'sos-button--sent' : ''}`}
            onClick={handleSOS}
            disabled={isSending}
            aria-label="Send SOS Emergency Alert"
          >
            {isSending ? (
              <>
                <span className="sos-button__icon">📡</span>
                <span className="sos-button__text">Sending...</span>
              </>
            ) : sent ? (
              <>
                <span className="sos-button__icon">✅</span>
                <span className="sos-button__text">Sent!</span>
              </>
            ) : (
              <>
                <span className="sos-ring sos-ring--1"></span>
                <span className="sos-ring sos-ring--2"></span>
                <span className="sos-button__icon">🚨</span>
                <span className="sos-button__text">SOS</span>
                <span className="sos-button__sub">Tap to Send</span>
              </>
            )}
          </button>
        )}
      </div>

      {locationData && (
        <div className="glass-card sos-location">
          <span>📍</span>
          <div>
            <p className="sos-location__label">Your Location</p>
            <p className="sos-location__coords">
              {locationData.latitude.toFixed(4)}, {locationData.longitude.toFixed(4)}
            </p>
          </div>
          <a
            href={`https://maps.google.com/?q=${locationData.latitude},${locationData.longitude}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-ghost"
            onClick={() => voiceService.speak('Opening map')}
          >
            Open Map
          </a>
        </div>
      )}

      <div className="sos-quick-actions">
        <button className="btn btn-danger btn-xl sos-call-btn" onClick={callEmergency}>
          📞 Call Emergency (112)
        </button>

        {sent && (
          <button
            className="btn btn-ghost btn-lg"
            onClick={() => {
              setSent(false);
              setLocationData(null);
              voiceService.speak('Reset. Ready to send SOS again if needed.');
            }}
          >
            Reset
          </button>
        )}
      </div>
    </div>
  );
}
