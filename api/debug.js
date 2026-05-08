// Temporary debug endpoint - DELETE AFTER VERIFYING
// Visit: https://quadcore-one.vercel.app/api/debug

export default function handler(req, res) {
  const xaiKey = process.env.XAI_API_KEY;
  const groqKey = process.env.GROQ_API_KEY;

  res.status(200).json({
    xai_key_exists: !!xaiKey,
    xai_key_preview: xaiKey ? `${xaiKey.substring(0, 6)}...${xaiKey.substring(xaiKey.length - 4)}` : 'NOT SET',
    groq_key_exists: !!groqKey,
    groq_key_preview: groqKey ? `${groqKey.substring(0, 6)}...${groqKey.substring(groqKey.length - 4)}` : 'NOT SET',
    node_env: process.env.NODE_ENV || 'not set',
    timestamp: new Date().toISOString(),
  });
}
