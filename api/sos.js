// Vercel Serverless Function: /api/sos

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
    const { latitude, longitude, timestamp } = req.body;
    console.log(`[SOS] 🚨 Emergency! Location: ${latitude}, ${longitude} at ${timestamp}`);

    res.status(200).json({
      success: true,
      message: 'SOS alert received',
      location: { latitude, longitude },
    });
  } catch (err) {
    console.error('[SOS] Error:', err);
    res.status(500).json({ error: 'Failed to process SOS' });
  }
}
