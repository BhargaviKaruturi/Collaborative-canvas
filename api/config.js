// Vercel serverless function to provide WebSocket URL configuration
export default function handler(req, res) {
  // Get WebSocket URL from environment variable, fallback to Railway URL
  const wsUrl = process.env.WS_URL || process.env.NEXT_PUBLIC_WS_URL || 'https://collaborative-canvas-production-48b3.up.railway.app';
  
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');
  res.status(200).json({ wsUrl });
}

