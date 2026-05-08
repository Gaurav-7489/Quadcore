// API Service - Grok Vision API + OCR
// Proxies through backend on Render to keep API key secure

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// ========== Grok Vision API ==========

async function analyzeImage(base64Image, prompt, systemPrompt = null) {
  try {
    const response = await fetch(`${API_BASE}/api/vision`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        image: base64Image,
        prompt: prompt,
        systemPrompt: systemPrompt,
      }),
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    return data.result;
  } catch (err) {
    console.error('[API] Vision error:', err);
    throw err;
  }
}

// ========== Scene Description ==========

export async function describeScene(base64Image, language = 'en') {
  const prompts = {
    en: "You are an AI assistant helping a blind person. Describe what you see in this image in 2-3 short, clear sentences. Focus on: people present, objects nearby, the environment, and any potential hazards. Be concise and practical.",
    hi: "Aap ek AI assistant hain jo ek andhe insaan ki madad kar rahe hain. Is image mein jo dikh raha hai usse 2-3 choti, saaf sentences mein bataye. Dhyan rakho: log, nazdeeki cheezein, environment, aur koi bhi khatarnaak cheez. Hinglish mein jawab do."
  };

  return analyzeImage(base64Image, prompts[language] || prompts.en);
}

// ========== Currency Detection ==========

export async function detectCurrency(base64Image, language = 'en') {
  const prompts = {
    en: "You are helping a blind person identify currency. Look at this image carefully. If there is a banknote visible, identify the denomination and currency (especially Indian Rupee notes: ₹10, ₹20, ₹50, ₹100, ₹200, ₹500, ₹2000). State clearly what note it is. If no currency is visible, say 'No currency note detected'. Be very brief - just 1-2 sentences.",
    hi: "Aap ek andhe insaan ki madad kar rahe hain currency pehchanne mein. Is image mein agar koi note hai toh batao kitne ka hai (₹10, ₹20, ₹50, ₹100, ₹200, ₹500, ₹2000). Agar koi note nahi hai toh bolo 'Koi note nahi dikha'. Sirf 1-2 line mein jawab do Hinglish mein."
  };

  return analyzeImage(base64Image, prompts[language] || prompts.en);
}

// ========== Color Detection ==========

export async function detectColor(base64Image, language = 'en') {
  const prompts = {
    en: "You are helping a blind person identify colors. Describe the main colors visible in this image. Focus on the dominant object and its color. For example: 'The shirt is blue', 'The wall is white', 'The bag is red'. Be very brief - just 1-2 sentences.",
    hi: "Aap ek andhe insaan ki madad kar rahe hain rang pehchanne mein. Is image mein jo main cheez hai uska rang batao. Jaise: 'Shirt neeli hai', 'Deewar safed hai'. Sirf 1-2 line Hinglish mein."
  };

  return analyzeImage(base64Image, prompts[language] || prompts.en);
}

// ========== Ask AI (Free-form question) ==========

export async function askAI(base64Image, question, language = 'en') {
  const systemPrompts = {
    en: "You are a helpful AI assistant for a blind person. Answer their question about what you see in the image. Be concise, clear, and practical. Keep answers to 1-3 sentences maximum.",
    hi: "Aap ek andhe insaan ke AI assistant hain. Unke sawal ka jawab do image dekh ke. Chota aur saaf jawab do Hinglish mein. 1-3 sentences maximum."
  };

  return analyzeImage(base64Image, question, systemPrompts[language] || systemPrompts.en);
}

// ========== OCR Text Reading ==========

export async function readText(base64Image) {
  // Use Grok Vision for OCR - more reliable than Tesseract for varied conditions
  const prompt = "Read all the text visible in this image. Return ONLY the text content, nothing else. If no text is visible, say 'No text detected'. If the text is in Hindi or another Indian language, transliterate it to English.";
  return analyzeImage(base64Image, prompt);
}

// ========== Object Detection (COCO-SSD) ==========

let cocoModel = null;

export async function loadObjectDetectionModel() {
  if (cocoModel) return cocoModel;

  try {
    const cocoSsd = await import('@tensorflow-models/coco-ssd');
    await import('@tensorflow/tfjs');
    cocoModel = await cocoSsd.load();
    console.log('[API] COCO-SSD model loaded');
    return cocoModel;
  } catch (err) {
    console.error('[API] Failed to load COCO-SSD:', err);
    return null;
  }
}

export async function detectObjects(videoElement) {
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
    console.error('[API] Detection error:', err);
    return [];
  }
}

export function formatObjectResults(predictions, language = 'en') {
  if (!predictions || predictions.length === 0) {
    return language === 'hi' ? 'Koi object detect nahi hua.' : 'No objects detected.';
  }

  // Count objects by class
  const counts = {};
  predictions.forEach(p => {
    if (p.score >= 50) {
      counts[p.class] = (counts[p.class] || 0) + 1;
    }
  });

  const parts = Object.entries(counts).map(([cls, count]) => {
    if (count > 1) {
      return `${count} ${cls}s`;
    }
    return `a ${cls}`;
  });

  if (parts.length === 0) {
    return language === 'hi' ? 'Koi object detect nahi hua.' : 'No objects detected.';
  }

  if (language === 'hi') {
    return `Detect hua: ${parts.join(', ')}.`;
  }
  return `I can see ${parts.join(', ')}.`;
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
    // If backend is down, still try to open maps/phone
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
