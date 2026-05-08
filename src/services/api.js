// API Service - Smart Online/Offline Mode
// Online: xAI Grok + Groq vision APIs through backend
// Offline: COCO-SSD object detection + Tesseract.js OCR
// Auto-switches based on connectivity

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// ========== Connectivity State ==========

let _isOnline = navigator.onLine;
let _lastCheckTime = 0;
let _apiReachable = null; // null = unknown, true/false = checked
const CHECK_INTERVAL = 30000; // Re-check every 30 seconds

// Listen for browser online/offline events
window.addEventListener('online', () => {
  _isOnline = true;
  _apiReachable = null; // re-verify on next call
  console.log('[API] 🌐 Browser reports: ONLINE');
});

window.addEventListener('offline', () => {
  _isOnline = false;
  _apiReachable = false;
  console.log('[API] 📡 Browser reports: OFFLINE');
});

/**
 * Check if the backend API is reachable
 * Caches result for CHECK_INTERVAL to avoid hammering
 */
async function checkApiReachable() {
  const now = Date.now();

  // Use cached result if recent
  if (_apiReachable !== null && now - _lastCheckTime < CHECK_INTERVAL) {
    return _apiReachable;
  }

  // If browser says offline, don't even try
  if (!navigator.onLine) {
    _apiReachable = false;
    _lastCheckTime = now;
    return false;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000); // 5s timeout

    const response = await fetch(`${API_BASE}/api/health`, {
      signal: controller.signal,
    });

    clearTimeout(timeout);
    _apiReachable = response.ok;
    _lastCheckTime = now;
    console.log(`[API] Health check: ${_apiReachable ? '✅ ONLINE' : '❌ UNREACHABLE'}`);
    return _apiReachable;
  } catch (err) {
    _apiReachable = false;
    _lastCheckTime = now;
    console.log('[API] Health check: ❌ OFFLINE (', err.message, ')');
    return false;
  }
}

/**
 * Get current connectivity status
 */
export function getConnectivityStatus() {
  return {
    browserOnline: navigator.onLine,
    apiReachable: _apiReachable,
    isOnline: _isOnline && _apiReachable !== false,
  };
}

/**
 * Force re-check connectivity (e.g., user wants to retry)
 */
export async function recheckConnectivity() {
  _apiReachable = null;
  _lastCheckTime = 0;
  return await checkApiReachable();
}

// ========== Online: Vision API (xAI Grok / Groq) ==========

async function analyzeImageOnline(base64Image, prompt, systemPrompt = null) {
  const response = await fetch(`${API_BASE}/api/vision`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      image: base64Image,
      prompt: prompt,
      systemPrompt: systemPrompt,
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`API error ${response.status}: ${errText}`);
  }

  const data = await response.json();
  return data.result;
}

// ========== Offline: COCO-SSD Object Detection ==========

let cocoModel = null;
let _cocoLoading = false;

export async function loadObjectDetectionModel() {
  if (cocoModel) return cocoModel;
  if (_cocoLoading) {
    // Wait for existing load
    while (_cocoLoading) {
      await new Promise(r => setTimeout(r, 200));
    }
    return cocoModel;
  }

  _cocoLoading = true;
  try {
    const cocoSsd = await import('@tensorflow-models/coco-ssd');
    await import('@tensorflow/tfjs');
    cocoModel = await cocoSsd.load();
    console.log('[API] ✅ COCO-SSD model loaded (offline ready)');
    return cocoModel;
  } catch (err) {
    console.error('[API] Failed to load COCO-SSD:', err);
    return null;
  } finally {
    _cocoLoading = false;
  }
}

export async function detectObjectsLocal(videoElement) {
  if (!cocoModel) {
    await loadObjectDetectionModel();
  }
  if (!cocoModel || !videoElement) return [];

  try {
    const predictions = await cocoModel.detect(videoElement);
    return predictions.map(p => ({
      class: p.class,
      score: Math.round(p.score * 100),
      bbox: p.bbox,
    }));
  } catch (err) {
    console.error('[API] COCO-SSD detection error:', err);
    return [];
  }
}

export function formatObjectResults(predictions, language = 'en') {
  if (!predictions || predictions.length === 0) {
    return language === 'hi' ? 'Koi object detect nahi hua.' : 'No objects detected.';
  }

  const counts = {};
  predictions.forEach(p => {
    if (p.score >= 50) {
      counts[p.class] = (counts[p.class] || 0) + 1;
    }
  });

  const parts = Object.entries(counts).map(([cls, count]) => {
    if (count > 1) return `${count} ${cls}s`;
    return `a ${cls}`;
  });

  if (parts.length === 0) {
    return language === 'hi' ? 'Koi object detect nahi hua.' : 'No objects detected.';
  }

  if (language === 'hi') return `Detect hua: ${parts.join(', ')}.`;
  return `I can see ${parts.join(', ')}.`;
}

// ========== Offline: Tesseract.js OCR ==========

let _tesseractWorker = null;

async function readTextOffline(base64Image) {
  try {
    const Tesseract = await import('tesseract.js');
    const { data: { text } } = await Tesseract.recognize(base64Image, 'eng', {
      logger: () => {},
    });

    const cleaned = text.trim();
    if (!cleaned || cleaned.length < 2) {
      return 'No text detected.';
    }
    return cleaned;
  } catch (err) {
    console.error('[API] Tesseract OCR error:', err);
    return 'Could not read text in offline mode.';
  }
}

// ========== Smart Feature Functions ==========
// Each function tries ONLINE first, falls back to OFFLINE

/**
 * Describe the scene - Online: Grok/Groq vision, Offline: COCO-SSD
 */
export async function describeScene(base64Image, language = 'en', videoElement = null) {
  const online = await checkApiReachable();

  if (online) {
    try {
      const prompts = {
        en: "You are an AI assistant helping a blind person. Describe what you see in this image in 2-3 short, clear sentences. Focus on: people present, objects nearby, the environment, and any potential hazards. Be concise and practical.",
        hi: "Aap ek AI assistant hain jo ek andhe insaan ki madad kar rahe hain. Is image mein jo dikh raha hai usse 2-3 choti, saaf sentences mein bataye. Dhyan rakho: log, nazdeeki cheezein, environment, aur koi bhi khatarnaak cheez. Hinglish mein jawab do."
      };
      return await analyzeImageOnline(base64Image, prompts[language] || prompts.en);
    } catch (err) {
      console.warn('[API] Online scene description failed, falling back to offline:', err.message);
      _apiReachable = false; // Mark as offline for subsequent calls
    }
  }

  // OFFLINE FALLBACK: Use COCO-SSD
  if (videoElement) {
    const predictions = await detectObjectsLocal(videoElement);
    const result = formatObjectResults(predictions, language);
    return `[Offline] ${result}`;
  }
  return language === 'hi'
    ? '[Offline] Internet nahi hai. Scene describe nahi ho paya.'
    : '[Offline] No internet connection. Could not describe the scene.';
}

/**
 * Read text - Online: Grok/Groq vision OCR, Offline: Tesseract.js
 */
export async function readText(base64Image) {
  const online = await checkApiReachable();

  if (online) {
    try {
      const prompt = "Read all the text visible in this image. Return ONLY the text content, nothing else. If no text is visible, say 'No text detected'. If the text is in Hindi or another Indian language, transliterate it to English.";
      return await analyzeImageOnline(base64Image, prompt);
    } catch (err) {
      console.warn('[API] Online OCR failed, falling back to Tesseract:', err.message);
      _apiReachable = false;
    }
  }

  // OFFLINE FALLBACK: Tesseract.js
  const result = await readTextOffline(base64Image);
  return `[Offline] ${result}`;
}

/**
 * Detect currency - Online: Grok/Groq vision, Offline: COCO-SSD (limited)
 */
export async function detectCurrency(base64Image, language = 'en', videoElement = null) {
  const online = await checkApiReachable();

  if (online) {
    try {
      const prompts = {
        en: "You are helping a blind person identify currency. Look at this image carefully. If there is a banknote visible, identify the denomination and currency (especially Indian Rupee notes: ₹10, ₹20, ₹50, ₹100, ₹200, ₹500, ₹2000). State clearly what note it is. If no currency is visible, say 'No currency note detected'. Be very brief - just 1-2 sentences.",
        hi: "Aap ek andhe insaan ki madad kar rahe hain currency pehchanne mein. Is image mein agar koi note hai toh batao kitne ka hai (₹10, ₹20, ₹50, ₹100, ₹200, ₹500, ₹2000). Agar koi note nahi hai toh bolo 'Koi note nahi dikha'. Sirf 1-2 line mein jawab do Hinglish mein."
      };
      return await analyzeImageOnline(base64Image, prompts[language] || prompts.en);
    } catch (err) {
      console.warn('[API] Online currency detection failed:', err.message);
      _apiReachable = false;
    }
  }

  // OFFLINE FALLBACK: limited - try COCO-SSD + note
  if (videoElement) {
    const predictions = await detectObjectsLocal(videoElement);
    const result = formatObjectResults(predictions, language);
    return language === 'hi'
      ? `[Offline] Currency detect nahi ho sakta offline mode mein. Jo dikha: ${result}`
      : `[Offline] Currency detection needs internet. Objects found: ${result}`;
  }
  return language === 'hi'
    ? '[Offline] Internet nahi hai. Currency detect nahi ho paya.'
    : '[Offline] No internet. Currency detection unavailable.';
}

/**
 * Detect color - Online: Grok/Groq vision, Offline: canvas pixel analysis
 */
export async function detectColor(base64Image, language = 'en') {
  const online = await checkApiReachable();

  if (online) {
    try {
      const prompts = {
        en: "You are helping a blind person identify colors. Describe the main colors visible in this image. Focus on the dominant object and its color. For example: 'The shirt is blue', 'The wall is white', 'The bag is red'. Be very brief - just 1-2 sentences.",
        hi: "Aap ek andhe insaan ki madad kar rahe hain rang pehchanne mein. Is image mein jo main cheez hai uska rang batao. Jaise: 'Shirt neeli hai', 'Deewar safed hai'. Sirf 1-2 line Hinglish mein."
      };
      return await analyzeImageOnline(base64Image, prompts[language] || prompts.en);
    } catch (err) {
      console.warn('[API] Online color detection failed:', err.message);
      _apiReachable = false;
    }
  }

  // OFFLINE FALLBACK: Analyze dominant color from canvas
  try {
    const color = await analyzeDominantColor(base64Image);
    return language === 'hi'
      ? `[Offline] Screen ka main rang ${color} hai.`
      : `[Offline] The dominant color is ${color}.`;
  } catch {
    return language === 'hi'
      ? '[Offline] Rang detect nahi ho paya.'
      : '[Offline] Could not detect color.';
  }
}

/**
 * Simple dominant color extraction from base64 image (offline fallback)
 */
async function analyzeDominantColor(base64Image) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const size = 50; // Sample a small area for speed
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, size, size);

      const imageData = ctx.getImageData(0, 0, size, size).data;
      let r = 0, g = 0, b = 0, count = 0;

      // Sample center region
      for (let i = 0; i < imageData.length; i += 4) {
        r += imageData[i];
        g += imageData[i + 1];
        b += imageData[i + 2];
        count++;
      }

      r = Math.round(r / count);
      g = Math.round(g / count);
      b = Math.round(b / count);

      resolve(rgbToColorName(r, g, b));
    };
    img.onerror = () => resolve('unknown');
    img.src = base64Image;
  });
}

function rgbToColorName(r, g, b) {
  const colors = [
    { name: 'red', r: 255, g: 0, b: 0 },
    { name: 'green', r: 0, g: 128, b: 0 },
    { name: 'blue', r: 0, g: 0, b: 255 },
    { name: 'yellow', r: 255, g: 255, b: 0 },
    { name: 'orange', r: 255, g: 165, b: 0 },
    { name: 'purple', r: 128, g: 0, b: 128 },
    { name: 'pink', r: 255, g: 192, b: 203 },
    { name: 'brown', r: 139, g: 69, b: 19 },
    { name: 'black', r: 0, g: 0, b: 0 },
    { name: 'white', r: 255, g: 255, b: 255 },
    { name: 'gray', r: 128, g: 128, b: 128 },
    { name: 'cyan', r: 0, g: 255, b: 255 },
    { name: 'magenta', r: 255, g: 0, b: 255 },
    { name: 'beige', r: 245, g: 245, b: 220 },
    { name: 'navy blue', r: 0, g: 0, b: 128 },
    { name: 'dark green', r: 0, g: 100, b: 0 },
    { name: 'maroon', r: 128, g: 0, b: 0 },
  ];

  let closest = colors[0].name;
  let minDist = Infinity;

  for (const c of colors) {
    const dist = Math.sqrt(
      Math.pow(r - c.r, 2) + Math.pow(g - c.g, 2) + Math.pow(b - c.b, 2)
    );
    if (dist < minDist) {
      minDist = dist;
      closest = c.name;
    }
  }

  return closest;
}

/**
 * Ask AI free-form question - Online only, offline gives COCO-SSD
 */
export async function askAI(base64Image, question, language = 'en', videoElement = null) {
  const online = await checkApiReachable();

  if (online) {
    try {
      const systemPrompts = {
        en: "You are a helpful AI assistant for a blind person. Answer their question about what you see in the image. Be concise, clear, and practical. Keep answers to 1-3 sentences maximum.",
        hi: "Aap ek andhe insaan ke AI assistant hain. Unke sawal ka jawab do image dekh ke. Chota aur saaf jawab do Hinglish mein. 1-3 sentences maximum."
      };
      return await analyzeImageOnline(base64Image, question, systemPrompts[language] || systemPrompts.en);
    } catch (err) {
      console.warn('[API] Online AI failed:', err.message);
      _apiReachable = false;
    }
  }

  // OFFLINE FALLBACK
  if (videoElement) {
    const predictions = await detectObjectsLocal(videoElement);
    const result = formatObjectResults(predictions, language);
    return language === 'hi'
      ? `[Offline] AI questions need internet. Jo detect hua: ${result}`
      : `[Offline] AI questions need internet. Objects detected: ${result}`;
  }
  return language === 'hi'
    ? '[Offline] Internet nahi hai. AI sawal ka jawab nahi de sakta.'
    : '[Offline] No internet. Cannot answer AI questions offline.';
}

/**
 * Detect objects - Try ONLINE first (Grok vision), fallback to COCO-SSD
 * This is the key fix: object detection now uses API when online!
 */
export async function detectObjects(base64Image, language = 'en', videoElement = null) {
  const online = await checkApiReachable();

  if (online && base64Image) {
    try {
      const prompts = {
        en: "You are helping a blind person detect objects. List every distinct object you see in this image. Format: 'I can see: [object1], [object2], ...'. Be specific - mention people, furniture, devices, food items, etc. Count multiples. Be concise.",
        hi: "Aap ek andhe insaan ki madad kar rahe hain objects detect karne mein. Is image mein jo bhi cheezein dikh rahi hain unki list banao. Format: 'Detect hua: [cheez1], [cheez2], ...'. Logo, furniture, devices, khaana sab mention karo. Hinglish mein."
      };
      return await analyzeImageOnline(base64Image, prompts[language] || prompts.en);
    } catch (err) {
      console.warn('[API] Online object detection failed, using COCO-SSD:', err.message);
      _apiReachable = false;
    }
  }

  // OFFLINE FALLBACK: COCO-SSD
  if (videoElement) {
    const predictions = await detectObjectsLocal(videoElement);
    const result = formatObjectResults(predictions, language);
    return online === false ? `[Offline] ${result}` : result;
  }

  return language === 'hi' ? 'Object detect nahi ho paya.' : 'Could not detect objects.';
}

// ========== SOS ==========

export async function sendSOS(location) {
  try {
    const response = await fetch(`${API_BASE}/api/sos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        latitude: location?.latitude,
        longitude: location?.longitude,
        timestamp: new Date().toISOString(),
      }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export function getLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation not supported'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
      }),
      (err) => reject(err),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });
}

// ========== Pre-load offline models in background ==========

export async function preloadOfflineModels() {
  // Start loading COCO-SSD in background so it's ready for offline fallback
  loadObjectDetectionModel().catch(() => {});
}

// Start preloading when this module loads
preloadOfflineModels();
