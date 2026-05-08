import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
const cors = require("cors");

app.use(cors({
  origin: [
    "http://localhost:5173",
    "http://localhost:3000",
    process.env.FRONTEND_URL,
  ].filter(Boolean),

  methods: ["GET", "POST"],
  credentials: true,
}));

app.use(express.json({ limit: "50mb" }));

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'Second Vision API' });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ========== Vision API - Supports both xAI Grok and Groq ==========

async function callXAIGrok(messages) {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) return null;

  const response = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'grok-4.3',
      messages: messages,
      max_tokens: 300,
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    console.error('[xAI Grok] Error:', response.status, err);
    return null;
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || null;
}

async function callGroq(messages) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'meta-llama/llama-4-scout-17b-16e-instruct',
      messages: messages,
      max_tokens: 300,
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    console.error('[Groq] Error:', response.status, err);
    return null;
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || null;
}

// ========== Vision Endpoint ==========
app.post('/api/vision', async (req, res) => {
  try {
    const { image, prompt, systemPrompt } = req.body;

    if (!image || !prompt) {
      return res.status(400).json({ error: 'Image and prompt are required' });
    }

    // Build messages
    const messages = [];

    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }

    messages.push({
      role: 'user',
      content: [
        {
          type: 'image_url',
          image_url: { url: image },
        },
        {
          type: 'text',
          text: prompt,
        },
      ],
    });

    console.log(`[Vision] Processing: "${prompt.substring(0, 60)}..."`);

    // Try xAI Grok first (better quality), fallback to Groq (faster)
    let result = await callXAIGrok(messages);

    if (!result) {
      console.log('[Vision] xAI unavailable, trying Groq...');
      result = await callGroq(messages);
    }

    if (!result) {
      return res.status(500).json({ error: 'Both AI providers failed. Check API keys.' });
    }

    console.log(`[Vision] ✅ Response: "${result.substring(0, 80)}..."`);
    res.json({ result });
  } catch (err) {
    console.error('[Vision] Server error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ========== SOS Endpoint ==========
app.post('/api/sos', async (req, res) => {
  try {
    const { latitude, longitude, timestamp } = req.body;
    console.log(`[SOS] 🚨 Emergency! Location: ${latitude}, ${longitude} at ${timestamp}`);

    res.json({
      success: true,
      message: 'SOS alert received',
      location: { latitude, longitude },
    });
  } catch (err) {
    console.error('[SOS] Error:', err);
    res.status(500).json({ error: 'Failed to process SOS' });
  }
});

// Start server
app.listen(PORT, () => {
  const hasXAI = !!process.env.XAI_API_KEY;
  const hasGroq = !!process.env.GROQ_API_KEY;
  console.log(`\n🔮 Second Vision API Server`);
  console.log(`   Port: ${PORT}`);
  console.log(`   xAI Grok 4.3: ${hasXAI ? '✅ configured' : '❌ not set'}`);
  console.log(`   Groq Llama 4: ${hasGroq ? '✅ configured' : '❌ not set'}`);
  console.log(`   Endpoints:`);
  console.log(`     GET  /api/health`);
  console.log(`     POST /api/vision`);
  console.log(`     POST /api/sos\n`);
});
