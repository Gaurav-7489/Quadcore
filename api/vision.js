// Vercel Serverless Function: /api/vision
// Proxies image + prompt to xAI Grok (primary) or Groq (fallback)

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

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

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
    res.status(200).json({ result });
  } catch (err) {
    console.error('[Vision] Server error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}
