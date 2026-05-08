import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import voiceService from '../services/voice';
import './SettingsPage.css';

export default function SettingsPage() {
  const navigate = useNavigate();
  const [language, setLanguage] = useState(
    localStorage.getItem('sv-language') || 'en-US'
  );
  const [voiceSpeed, setVoiceSpeed] = useState(
    parseFloat(localStorage.getItem('sv-voice-speed') || '1.0')
  );
  const [highContrast, setHighContrast] = useState(
    localStorage.getItem('sv-high-contrast') === 'true'
  );

  useEffect(() => {
    voiceService.speak('Settings page. You can change language, voice speed, and contrast mode. Say go home to go back.');

    voiceService.onStatusChange = () => {};
    voiceService.onResult = (transcript) => {
      const text = transcript.toLowerCase();
      if (text.includes('home') || text.includes('back') || text.includes('ghar')) {
        voiceService.speak('Going home');
        setTimeout(() => navigate('/'), 600);
      } else if (text.includes('english')) {
        handleLanguageChange('en-US');
      } else if (text.includes('hindi') || text.includes('हिंदी')) {
        handleLanguageChange('hi-IN');
      } else if (text.includes('punjabi') || text.includes('ਪੰਜਾਬੀ')) {
        handleLanguageChange('pa-IN');
      } else if (text.includes('urdu') || text.includes('اردو')) {
        handleLanguageChange('ur-PK');
      } else if (text.includes('fast') || text.includes('tez')) {
        handleSpeedChange('1.5');
      } else if (text.includes('slow') || text.includes('dheere')) {
        handleSpeedChange('0.75');
      } else if (text.includes('normal') || text.includes('default')) {
        handleSpeedChange('1.0');
      } else if (text.includes('contrast') || text.includes('high contrast')) {
        handleContrastToggle();
      }
    };

    return () => {
      voiceService.onResult = null;
      voiceService.onStatusChange = null;
    };
  }, [highContrast]);

  const handleLanguageChange = (lang) => {
    setLanguage(lang);
    localStorage.setItem('sv-language', lang);
    voiceService.setLanguage(lang);

    const langNames = {
      'en-US': 'English',
      'hi-IN': 'Hindi',
      'pa-IN': 'Punjabi',
      'ur-PK': 'Urdu',
    };
    voiceService.speak(`Language changed to ${langNames[lang]}. All voice responses will now be in ${langNames[lang]}.`, lang);
  };

  const handleSpeedChange = (speed) => {
    const speedVal = parseFloat(speed);
    setVoiceSpeed(speedVal);
    localStorage.setItem('sv-voice-speed', speed);
    voiceService.setSpeed(speedVal);
    voiceService.speak(`Voice speed set to ${speedVal} x. This is how I will speak now.`);
  };

  const handleContrastToggle = () => {
    const newVal = !highContrast;
    setHighContrast(newVal);
    localStorage.setItem('sv-high-contrast', String(newVal));
    document.documentElement.classList.toggle('high-contrast', newVal);
    voiceService.speak(newVal ? 'High contrast mode turned on. Colors are now brighter for better visibility.' : 'High contrast mode turned off. Back to normal display.');
  };

  const languages = [
    { code: 'en-US', name: 'English', flag: '🇬🇧' },
    { code: 'hi-IN', name: 'Hindi', flag: '🇮🇳' },
    { code: 'pa-IN', name: 'Punjabi', flag: '🇮🇳' },
    { code: 'ur-PK', name: 'Urdu', flag: '🇵🇰' },
  ];

  return (
    <div className="page settings-page">
      <header className="page-header">
        <h1 className="page-title">⚙️ Settings</h1>
        <p className="page-subtitle">Customize your experience</p>
      </header>

      <section className="settings-section">
        <h2 className="settings-section__title">🌐 Language</h2>
        <div className="settings-language-grid">
          {languages.map((lang) => (
            <button
              key={lang.code}
              className={`settings-lang-btn ${language === lang.code ? 'settings-lang-btn--active' : ''}`}
              onClick={() => handleLanguageChange(lang.code)}
            >
              <span className="settings-lang-btn__flag">{lang.flag}</span>
              <span className="settings-lang-btn__name">{lang.name}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="settings-section">
        <h2 className="settings-section__title">🔊 Voice Speed</h2>
        <div className="settings-speed">
          <input
            type="range"
            min="0.5"
            max="2.0"
            step="0.25"
            value={voiceSpeed}
            onChange={(e) => handleSpeedChange(e.target.value)}
            className="settings-slider"
            aria-label="Voice speed"
          />
          <div className="settings-speed__labels">
            <span>Slow</span>
            <span className="settings-speed__value">{voiceSpeed}x</span>
            <span>Fast</span>
          </div>
        </div>
      </section>

      <section className="settings-section">
        <h2 className="settings-section__title">♿ Accessibility</h2>
        <button
          className={`settings-toggle ${highContrast ? 'settings-toggle--active' : ''}`}
          onClick={handleContrastToggle}
        >
          <div className="settings-toggle__info">
            <span className="settings-toggle__label">High Contrast Mode</span>
            <span className="settings-toggle__desc">Increase visibility for low vision</span>
          </div>
          <div className="settings-toggle__switch">
            <div className="settings-toggle__knob"></div>
          </div>
        </button>
      </section>

      <section className="settings-section">
        <h2 className="settings-section__title">ℹ️ About</h2>
        <div className="glass-card settings-about">
          <h3>Second Vision</h3>
          <p>AI-powered voice-first assistant for visually impaired users.</p>
          <p className="settings-about__version">Version 1.0.0 · Built with ❤️ by QuadCore</p>
        </div>
      </section>
    </div>
  );
}
