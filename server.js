/**
 * FloodReady Server (Node.js)
 * 
 * Secure backend that reads GEMINI_API_KEY from .env.local.
 * Keeps the key strictly on the server: never exposed to browser code or rendered on screen.
 * Zero external npm dependencies required (uses built-in http, https, fs, path).
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

/**
 * Read GEMINI_API_KEY from .env.local or .env
 */
function getApiKey() {
  const envCandidates = ['.env.local', '.env'];
  for (const filename of envCandidates) {
    const fullPath = path.join(__dirname, filename);
    if (fs.existsSync(fullPath)) {
      try {
        const content = fs.readFileSync(fullPath, 'utf8');
        for (const line of content.split(/\r?\n/)) {
          const trimmed = line.trim();
          if (trimmed && !trimmed.startsWith('#')) {
            const eqIdx = trimmed.indexOf('=');
            if (eqIdx !== -1) {
              const key = trimmed.slice(0, eqIdx).trim();
              let val = trimmed.slice(eqIdx + 1).trim();
              if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
                val = val.slice(1, -1);
              }
              if (key === 'GEMINI_API_KEY' && val) {
                return val;
              }
            }
          }
        }
      } catch (err) {
        // Silently skip unreadable files
      }
    }
  }
  return process.env.GEMINI_API_KEY || '';
}

/**
 * Call Gemini API with safety constraints
 */
/**
 * Call Gemini API using currently supported stable model (gemini-3-flash-preview)
 */
function callGemini(apiKey, situationDescription) {
  const model = 'gemini-3-flash-preview';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const promptText = `You are the FloodReady emergency situational assistant.
Your goal is to help an individual facing a flood situation structure their thoughts, identify missing critical details, and consider suggested next steps.

CRITICAL RULES:
1. Provide a calm, plain-language summary of what is happening based on the description.
2. Identify critical details that are missing (e.g. precise cross streets, water rise rate, presence of elderly/children/pets, power status, drinking water, safe upper floor/roof access).
3. Provide a short list of suggested next steps.
4. Clearly label AI suggestions as suggestions: Each item in suggestedNextSteps MUST start with "[Suggestion]" and be phrased as an unverified suggestion.
5. DO NOT invent or provide emergency phone numbers, hotlines, or official radio frequencies. Instruct the user to consult verified local authorities and official local emergency services.
6. DO NOT claim that information is verified. Always maintain that AI advice is unverified.

User flood situation:
"""${situationDescription.replace(/"/g, '\\"')}"""

Return strictly valid JSON adhering to this schema:
{
  "summary": "Plain-language summary of the situation",
  "missingDetails": [
    "Detail 1 that emergency responders would need",
    "Detail 2 that emergency responders would need"
  ],
  "suggestedNextSteps": [
    "[Suggestion] Step 1",
    "[Suggestion] Step 2"
  ]
}`;

  const payload = JSON.stringify({
    contents: [{
      parts: [{ text: promptText }]
    }],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: "application/json"
    }
  });

  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const req = https.request({
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, (res) => {
      let rawData = '';
      res.on('data', (chunk) => { rawData += chunk; });
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          try {
            const errJson = JSON.parse(rawData);
            return reject(new Error(errJson.error?.message || `Gemini API returned status ${res.statusCode}`));
          } catch (_) {
            return reject(new Error(`Gemini API returned HTTP status ${res.statusCode}`));
          }
        }

        try {
          const parsed = JSON.parse(rawData);
          const candidateText = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
          if (!candidateText) {
            return reject(new Error('No response text received from Gemini.'));
          }

          let cleanJson = candidateText.trim();
          if (cleanJson.startsWith('```json')) {
            cleanJson = cleanJson.replace(/^```json\s*/, '').replace(/```\s*$/, '');
          } else if (cleanJson.startsWith('```')) {
            cleanJson = cleanJson.replace(/^```\s*/, '').replace(/```\s*$/, '');
          }

          const structured = JSON.parse(cleanJson);
          resolve(structured);
        } catch (err) {
          reject(new Error(`Failed to parse Gemini response: ${err.message}`));
        }
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.write(payload);
    req.end();
  });
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const server = http.createServer(async (req, res) => {
  // Security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');

  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  // Status endpoint (Safe: returns boolean, NEVER the key)
  if (pathname === '/api/status' && req.method === 'GET') {
    const key = getApiKey();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      hasKey: Boolean(key && key.trim().length > 0)
    }));
    return;
  }

  // Analyze endpoint
  if (pathname === '/api/analyze' && req.method === 'POST') {
    const key = getApiKey();
    if (!key || !key.trim()) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'GEMINI_API_KEY is not configured. Please add your key to .env.local on line 3.'
      }));
      return;
    }

    let body = '';
    req.on('data', chunk => {
      body += chunk;
      // Guard against excessively large requests
      if (body.length > 500000) {
        req.destroy();
      }
    });

    req.on('end', async () => {
      try {
        const parsed = JSON.parse(body);
        const description = (parsed.description || '').trim();

        if (!description) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Please provide a flood situation description.' }));
          return;
        }

        const assessment = await callGemini(key, description);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(assessment));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message || 'Error processing request.' }));
      }
    });
    return;
  }

  // Serve static files from public/
  if (req.method === 'GET') {
    let safePath = pathname === '/' ? '/index.html' : pathname;
    // Prevent directory traversal
    safePath = path.normalize(safePath).replace(/^(\.\.[\/\\])+/, '');
    const filePath = path.join(PUBLIC_DIR, safePath);

    // Security check: ensure path stays inside PUBLIC_DIR
    if (!filePath.startsWith(PUBLIC_DIR)) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('Access Denied');
      return;
    }

    fs.stat(filePath, (err, stats) => {
      if (err || !stats.isFile()) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
        return;
      }

      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';

      res.writeHead(200, { 'Content-Type': contentType });
      fs.createReadStream(filePath).pipe(res);
    });
    return;
  }

  res.writeHead(405, { 'Content-Type': 'text/plain' });
  res.end('Method Not Allowed');
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`===============================================`);
  console.log(` FloodReady Server running at http://localhost:${PORT}`);
  console.log(` GEMINI_API_KEY status: ${getApiKey() ? 'Configured' : 'Missing in .env.local'}`);
  console.log(` Security: API key is isolated on server`);
  console.log(`===============================================`);
});
