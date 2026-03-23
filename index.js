const http = require('http');
const https = require('https');
const crypto = require('crypto');

// Configuration
const CONFIG = {
  // proxy: {
  //   host: 'sg5.datafrenzy.org',
  //   port: 20571
  // },
  server: {
    port: process.env.PORT || 3000
  }
};

// Utility functions
const randomIP = () => Array.from({length: 4}, () => Math.floor(Math.random() * 256)).join('.');

const simulated = {
  agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36',
  platform: 'Windows',
  mobile: '?0',
  ua: 'Not A(Brand";v="8", "Chromium";v="132", "Google Chrome";v="132'
};

function simulateBypassHeaders(accept, spoofAddress = false, preOaiUUID) {
  const ip = randomIP();
  const uuid = preOaiUUID || crypto.randomUUID();
  
  const headers = {
    'accept': accept,
    'Content-Type': 'application/json',
    'cache-control': 'no-cache',
    'Referer': 'https://chatgpt.com/',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'oai-device-id': uuid,
    'oai-language': 'en',
    'User-Agent': simulated.agent,
    'pragma': 'no-cache',
    'priority': 'u=1, i',
    'sec-ch-ua': `"${simulated.ua}"`,
    'sec-ch-ua-mobile': simulated.mobile,
    'sec-ch-ua-platform': `"${simulated.platform}"`,
    'sec-fetch-site': 'same-origin',
    'sec-fetch-mode': 'cors'
  };
  
  if (spoofAddress) {
    Object.assign(headers, {
      'X-Forwarded-For': ip,
      'X-Originating-IP': ip,
      'X-Remote-IP': ip,
      'X-Remote-Addr': ip,
      'X-Host': ip,
      'X-Forwarded-Host': ip,
      'Forwarded': `for=${ip}`,
      'True-Client-IP': ip,
      'X-Real-IP': ip
    });
  }
  
  return headers;
}

function solveSentinelChallenge(seed, difficulty) {
  const cores = [8, 12, 16, 24];
  const screens = [3000, 4000, 6000];
  
  const core = cores[crypto.randomInt(0, cores.length)];
  const screen = screens[crypto.randomInt(0, screens.length)];
  
  const now = new Date(Date.now() - 8 * 3600 * 1000);
  const parseTime = now.toUTCString().replace('GMT', 'GMT+0100 (Central European Time)');
  
  const config = [core + screen, parseTime, 4294705152, 0, simulated.agent];
  const diffLen = difficulty.length / 2;
  
  for (let i = 0; i < 100000; i++) {
    config[3] = i;
    const jsonData = JSON.stringify(config);
    const base = Buffer.from(jsonData).toString('base64');
    const hashValue = crypto.createHash('sha3-512').update(seed + base).digest();
    
    if (hashValue.toString('hex').substring(0, diffLen) <= difficulty) {
      return 'gAAAAAB' + base;
    }
  }
  
  const fallbackBase = Buffer.from(`"${seed}"`).toString('base64');
  return 'gAAAAABwQ8Lk5FbGpA2NcR9dShT6gYjU7VxZ4D' + fallbackBase;
}

function generateFakeSentinelToken() {
  const prefix = 'gAAAAAC';
  const randomFloat = (min, max) => (Math.random() * (max - min) + min).toFixed(4);
  
  const config = [
    crypto.randomInt(3000, 6000),
    new Date().toUTCString().replace('GMT', 'GMT+0100 (Central European Time)'),
    4294705152,
    0,
    simulated.agent,
    'de',
    'de',
    401,
    'mediaSession',
    'location',
    'scrollX',
    parseFloat(randomFloat(1000, 5000)),
    crypto.randomUUID(),
    '',
    12,
    Date.now()
  ];
  
  return prefix + Buffer.from(JSON.stringify(config)).toString('base64');
}

async function getCSRFToken(uuid) {
  const headers = simulateBypassHeaders('application/json', true, uuid);
  
  const response = await fetch('https://chatgpt.com/api/auth/csrf', {
    method: 'GET',
    headers: headers
  });
  
  const data = await response.json();
  
  if (!data.csrfToken) {
    throw new Error('Failed to fetch CSRF token');
  }
  
  return data.csrfToken;
}

async function getSentinelToken(uuid, csrf) {
  const headers = simulateBypassHeaders('application/json', true, uuid);
  const test = generateFakeSentinelToken();
  
  const response = await fetch('https://chatgpt.com/backend-anon/sentinel/chat-requirements', {
    method: 'POST',
    headers: {
      ...headers,
      'Cookie': `__Host-next-auth.csrf-token=${csrf}; oai-did=${uuid}; oai-nav-state=1;`
    },
    body: JSON.stringify({ p: test })
  });
  
  const data = await response.json();
  
  if (!data.token || !data.proofofwork) {
    throw new Error('Failed to fetch sentinel token');
  }
  
  const oaiSc = response.headers.get('set-cookie')?.split('oai-sc=')[1]?.split(';')[0] || '';
  
  if (!oaiSc) {
    throw new Error('Failed to fetch oai-sc token');
  }
  
  const challengeToken = solveSentinelChallenge(data.proofofwork.seed, data.proofofwork.difficulty);
  
  return {
    token: data.token,
    proof: challengeToken,
    oaiSc: oaiSc
  };
}

async function chatWithGPT(message) {
  const uuid = crypto.randomUUID();
  const csrfToken = await getCSRFToken(uuid);
  const sentinelToken = await getSentinelToken(uuid, csrfToken);
  
  const headers = simulateBypassHeaders('text/event-stream', true, uuid);
  const messageID = crypto.randomUUID();
  
  const response = await fetch('https://chatgpt.com/backend-anon/conversation', {
    method: 'POST',
    headers: {
      ...headers,
      'Cookie': `__Host-next-auth.csrf-token=${csrfToken}; oai-did=${uuid}; oai-nav-state=1; oai-sc=${sentinelToken.oaiSc};`,
      'openai-sentinel-chat-requirements-token': sentinelToken.token,
      'openai-sentinel-proof-token': sentinelToken.proof
    },
    body: JSON.stringify({
      action: 'next',
      messages: [{
        id: messageID,
        author: { role: 'user' },
        create_time: Date.now(),
        content: {
          content_type: 'text',
          parts: [message]
        },
        metadata: {
          selected_all_github_repos: false,
          selected_github_repos: [],
          serialization_metadata: { custom_symbol_offsets: [] },
          dictation: false
        }
      }],
      paragen_cot_summary_display_override: 'allow',
      parent_message_id: 'client-created-root',
      model: 'auto',
      timezone_offset_min: -60,
      timezone: 'Europe/Berlin',
      suggestions: [],
      history_and_training_disabled: true,
      conversation_mode: { kind: 'primary_assistant' },
      system_hints: [],
      supports_buffering: true,
      supported_encodings: ['v1'],
      client_contextual_info: {
        is_dark_mode: true,
        time_since_loaded: 7,
        page_height: 911,
        page_width: 1080,
        pixel_ratio: 1,
        screen_height: 1080,
        screen_width: 1920,
        app_name: 'chatgpt.com'
      }
    })
  });
  
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${response.statusText}`);
  }
  
  if (!response.body) {
    throw new Error('No response body');
  }
  
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  
  let result = '';
  let buffer = '';
  let finished = false;
  
  while (true) {
    const {done, value} = await reader.read();
    if (done) break;
    
    buffer += decoder.decode(value, {stream: true});
    let lines = buffer.split('\n');
    buffer = lines.pop() || '';
    
    for (const line of lines) {
      if (!line.startsWith('data:')) continue;
      const dataStr = line.replace('data:', '').trim();
      if (!dataStr || dataStr === '[DONE]') continue;
      
      try {
        const json = JSON.parse(dataStr);
        
        if (json.message) {
          if (json.message.content && json.message.content.parts) {
            result = json.message.content.parts[0];
          }
          if (json.message.status === 'finished_successfully') {
            finished = true;
            break;
          }
        } else if (json.o === 'append' && json.p === '/message/content/parts/0') {
          result += json.v;
        } else if (Array.isArray(json.v)) {
          for (const op of json.v) {
            if (op.o === 'append' && op.p === '/message/content/parts/0') {
              result += op.v;
            }
            if (op.p === '/message/status' && op.o === 'replace' && op.v === 'finished_successfully') {
              finished = true;
            }
          }
        }
      } catch (e) {
        continue;
      }
    }
    
    if (finished) break;
  }
  
  return result;
}

// HTTP Server
const server = http.createServer(async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }
  
  if (req.method === 'POST' && req.url === '/post') {
    let body = '';
    
    req.on('data', chunk => {
      body += chunk.toString();
    });
    
    req.on('end', async () => {
      try {
        const data = JSON.parse(body);
        
        if (!data.message) {
          res.writeHead(400, {'Content-Type': 'application/json'});
          res.end(JSON.stringify({error: 'Missing message field'}));
          return;
        }
        
        const response = await chatWithGPT(data.message);
        
        res.writeHead(200, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({response: response}));
      } catch (error) {
        res.writeHead(500, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({error: error.message}));
      }
    });
  } else {
    res.writeHead(404, {'Content-Type': 'application/json'});
    res.end(JSON.stringify({error: 'Not found. Use POST /post with {message: "your message"}'}));
  }
});

// Start server (for local development)
if (require.main === module) {
  server.listen(CONFIG.server.port, () => {
    // Server started successfully - running locally
  });
}

// Export for Vercel serverless deployment
module.exports = server;