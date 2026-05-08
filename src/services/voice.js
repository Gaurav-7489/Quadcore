// Voice Service - ALWAYS-ON Speech Recognition + Text-to-Speech
// Designed for blind users - continuous listening, auto-restart

class VoiceService {
  constructor() {
    this.recognition = null;
    this.synthesis = window.speechSynthesis;
    this.isListening = false;
    this.isSpeaking = false;
    this.language = localStorage.getItem('sv-language') || 'en-US';
    this.voiceSpeed = parseFloat(localStorage.getItem('sv-voice-speed') || '1.0');
    this.onResult = null;
    this.onStatusChange = null;
    this.onError = null;
    this.continuousMode = true; // ALWAYS ON for blind users
    this._restartTimer = null;
    this._initialized = false;

    this.initRecognition();
  }

  initRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn('[Voice] Speech Recognition not supported in this browser');
      return;
    }

    this.recognition = new SpeechRecognition();
    this.recognition.continuous = true; // Keep listening
    this.recognition.interimResults = false;
    this.recognition.lang = this.language;
    this.recognition.maxAlternatives = 1;

    this.recognition.onresult = (event) => {
      // Get the latest result
      const lastResult = event.results[event.results.length - 1];
      if (lastResult.isFinal) {
        const transcript = lastResult[0].transcript.toLowerCase().trim();
        console.log('[Voice] Heard:', transcript);
        if (this.onResult && transcript.length > 0) {
          this.onResult(transcript);
        }
      }
    };

    this.recognition.onend = () => {
      this.isListening = false;
      // Auto-restart if in continuous mode and not speaking
      if (this.continuousMode && !this.isSpeaking) {
        this._scheduleRestart();
      }
      if (this.onStatusChange) {
        this.onStatusChange(this.isSpeaking ? 'speaking' : 'idle');
      }
    };

    this.recognition.onerror = (event) => {
      console.warn('[Voice] Error:', event.error);
      this.isListening = false;

      // Auto-restart on recoverable errors
      if (this.continuousMode && event.error !== 'not-allowed' && event.error !== 'service-not-allowed') {
        this._scheduleRestart();
      }

      if (this.onStatusChange) {
        this.onStatusChange('idle');
      }
    };
  }

  _scheduleRestart() {
    if (this._restartTimer) clearTimeout(this._restartTimer);
    this._restartTimer = setTimeout(() => {
      if (this.continuousMode && !this.isListening && !this.isSpeaking) {
        this.startListening();
      }
    }, 500);
  }

  setLanguage(lang) {
    this.language = lang;
    localStorage.setItem('sv-language', lang);
    if (this.recognition) {
      this.recognition.lang = lang;
      // Restart with new language
      if (this.isListening) {
        this.stopListening();
        setTimeout(() => this.startListening(), 300);
      }
    }
  }

  startListening() {
    if (!this.recognition) {
      console.warn('[Voice] Recognition not available');
      return false;
    }
    if (this.isListening) return true;
    if (this.isSpeaking) return false; // Don't listen while speaking

    try {
      this.recognition.lang = this.language;
      this.recognition.start();
      this.isListening = true;
      this._initialized = true;
      if (this.onStatusChange) {
        this.onStatusChange('listening');
      }
      console.log('[Voice] 🎤 Listening started');
      return true;
    } catch (err) {
      // Already started - ignore
      if (err.name === 'InvalidStateError') {
        this.isListening = true;
        return true;
      }
      console.error('[Voice] Start error:', err);
      return false;
    }
  }

  stopListening() {
    if (this._restartTimer) clearTimeout(this._restartTimer);
    if (this.recognition && this.isListening) {
      try {
        this.recognition.stop();
      } catch (e) {
        // Ignore
      }
      this.isListening = false;
    }
  }

  speak(text, lang = null) {
    return new Promise((resolve) => {
      if (!this.synthesis) {
        resolve();
        return;
      }

      // Stop listening while speaking (avoid feedback loop)
      this.stopListening();

      // Cancel any ongoing speech
      this.synthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = lang || this.language;
      utterance.rate = this.voiceSpeed;
      utterance.pitch = 1.0;
      utterance.volume = 1.0;

      // Try to find a good voice
      const voices = this.synthesis.getVoices();
      const targetLang = (lang || this.language).split('-')[0];
      const preferredVoice = voices.find(v =>
        v.lang.startsWith(targetLang) && v.localService
      ) || voices.find(v => v.lang.startsWith(targetLang));

      if (preferredVoice) {
        utterance.voice = preferredVoice;
      }

      utterance.onstart = () => {
        this.isSpeaking = true;
        if (this.onStatusChange) {
          this.onStatusChange('speaking');
        }
      };

      utterance.onend = () => {
        this.isSpeaking = false;
        if (this.onStatusChange) {
          this.onStatusChange('idle');
        }
        // Resume listening after speaking
        if (this.continuousMode) {
          setTimeout(() => {
            this.startListening();
          }, 300);
        }
        resolve();
      };

      utterance.onerror = () => {
        this.isSpeaking = false;
        // Resume listening even on error
        if (this.continuousMode) {
          setTimeout(() => this.startListening(), 300);
        }
        resolve();
      };

      this.synthesis.speak(utterance);
    });
  }

  stopSpeaking() {
    if (this.synthesis) {
      this.synthesis.cancel();
      this.isSpeaking = false;
      if (this.onStatusChange) {
        this.onStatusChange('idle');
      }
      // Resume listening
      if (this.continuousMode) {
        setTimeout(() => this.startListening(), 300);
      }
    }
  }

  setSpeed(speed) {
    this.voiceSpeed = speed;
    localStorage.setItem('sv-voice-speed', String(speed));
  }

  // Toggle continuous mode
  setContinuousMode(enabled) {
    this.continuousMode = enabled;
    if (enabled && !this.isListening && !this.isSpeaking) {
      this.startListening();
    } else if (!enabled) {
      this.stopListening();
    }
  }

  // Parse voice command and return action
  parseCommand(transcript) {
    const text = transcript.toLowerCase().trim();

    // Navigation commands
    if (text.includes('go home') || text.includes('home page') || text.includes('main page') || text.includes('ghar')) {
      return { action: 'navigate', target: '/' };
    }
    if (text.includes('open camera') || text.includes('camera open') || text.includes('kamera') || text.includes('camera')) {
      return { action: 'navigate', target: '/camera' };
    }
    if (text.includes('emergency') || text.includes('help me') || text.includes('sos') || text.includes('madad') || text.includes('bachao')) {
      return { action: 'navigate', target: '/sos' };
    }
    if (text.includes('setting') || text.includes('options') || text.includes('preference')) {
      return { action: 'navigate', target: '/settings' };
    }

    // Camera/AI commands
    if (text.includes('describe') || text.includes('surroundings') || text.includes('what is in front') ||
        text.includes('kya hai') || text.includes('samne kya') || text.includes('around me') ||
        text.includes('scene') || text.includes('what do you see') || text.includes('kya dikh') ||
        text.includes('batao kya hai') || text.includes('what is this') || text.includes('what\'s this') ||
        text.includes('tell me what') || text.includes('what can you see')) {
      return { action: 'describe_scene' };
    }
    if (text.includes('read') || text.includes('text') || text.includes('padh') || text.includes('ocr') ||
        text.includes('likha') || text.includes('written') || text.includes('board') || text.includes('label') ||
        text.includes('medicine') || text.includes('menu')) {
      return { action: 'read_text' };
    }
    if (text.includes('currency') || text.includes('money') || text.includes('note') ||
        text.includes('paisa') || text.includes('rupee') || text.includes('rupay') || text.includes('kitne ka')) {
      return { action: 'detect_currency' };
    }
    if (text.includes('color') || text.includes('colour') || text.includes('rang') || text.includes('kya rang')) {
      return { action: 'detect_color' };
    }
    if (text.includes('object') || text.includes('detect') || text.includes('identify') ||
        text.includes('count') || text.includes('kitne') || text.includes('how many') ||
        text.includes('kitne log') || text.includes('how many people')) {
      return { action: 'detect_objects' };
    }

    // Control commands
    if (text.includes('stop') || text.includes('ruko') || text.includes('band karo') || text.includes('chup') || text.includes('quiet')) {
      return { action: 'stop' };
    }
    if (text.includes('repeat') || text.includes('phir se') || text.includes('dubara') || text.includes('again')) {
      return { action: 'repeat' };
    }

    // If it sounds like a question, send to AI
    if (text.includes('?') || text.startsWith('what') || text.startsWith('how') ||
        text.startsWith('where') || text.startsWith('who') || text.startsWith('is there') ||
        text.startsWith('can you') || text.startsWith('kya') || text.startsWith('kahan') ||
        text.startsWith('kaun') || text.length > 10) {
      return { action: 'ask_ai', query: transcript };
    }

    // Default - treat as AI question
    return { action: 'ask_ai', query: transcript };
  }
}

// Singleton
const voiceService = new VoiceService();

// Load voices
if (window.speechSynthesis) {
  window.speechSynthesis.onvoiceschanged = () => {
    window.speechSynthesis.getVoices();
  };
}

export default voiceService;
