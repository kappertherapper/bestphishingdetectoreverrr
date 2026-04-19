// List of legitimate domains
const legitimateDomains = [
  "postnord.dk", "fragt.dk",
  "dao.as", "dhl.com", "fedex.com", "ups.com",
  "gls-group.com", "gls-express.com",
  "bring.dk", "budbee.com", "coolrunner.dk", "pakkeshop.dk",
  "danskebank.dk", "nordea.dk", "swedbank.dk", "jyskebank.dk",
  "sydbank.dk", "nykredit.dk", "arbejdernes-landsbank.dk",
  "sparenord.dk", "bankdata.dk", "nationalbanken.dk",
  "nets.eu", "mobilepay.dk", "betalingsservice.dk",
  "paypal.com", "visa.dk", "mastercard.dk", "epay.dk",
  "skat.dk", "borger.dk", "virk.dk", "sundhed.dk",
  "politi.dk", "dr.dk", "lifeline.dk",
  "tdc.dk", "telenor.dk", "3.dk", "yousee.dk", "fullrate.dk",
  "zalando.dk", "elgiganten.dk", "power.dk", "pricerunner.dk",
  "bilka.dk", "foetex.dk", "harald-nyborg.dk", "saxo.com",
  "tv2.dk", "eb.dk", "bt.dk", "berlingske.dk", "politiken.dk",
];

// Build inverted index
const invertedIndex = {};
legitimateDomains.forEach(domain => {
  getTrigrams(domain).forEach(trigram => {
    if (!invertedIndex[trigram]) invertedIndex[trigram] = new Set();
    invertedIndex[trigram].add(domain);
  });
});

// Generate trigrams for a string
function getTrigrams(str) {
  const ngrams = [];
  const n = Math.max(2, Math.min(3, str.length));
  for (let i = 0; i <= str.length - n; i++) {
    ngrams.push(str.substr(i, n).toLowerCase());
  }
  return ngrams;
}

// Extract domain from a URL (hostname only, no path)
function extractDomain(url) {
  try {
    const parsed = new URL(url.startsWith('http') ? url : 'https://' + url);
    let host = parsed.hostname.toLowerCase();
    if (host.startsWith('www.')) host = host.slice(4);
    return host;
  } catch {
    // Fallback for malformed URLs
    let domain = url.replace(/^https?:\/\//, '').split('/')[0].toLowerCase();
    if (domain.startsWith('www.')) domain = domain.slice(4);
    return domain;
  }
}


function decodePunycode(hostname) {
  try {
    return hostname
      .split('.')
      .map(label => {
        if (!label.startsWith('xn--')) return label;
        try {
          // Decode via URL hostname round-trip on an isolated label
          return new URL('https://' + label + '.x').hostname.split('.')[0];
        } catch {
          return label;
        }
      })
      .join('.');
  } catch {
    return hostname;
  }
}

// Extract all meaningful domain-like tokens from a URL
function extractAllTokens(url) {
  const tokens = new Set();

  // 1. The full hostname (raw and Unicode-decoded)
  const hostname = extractDomain(url);
  const decodedHostname = decodePunycode(hostname);
  tokens.add(hostname);
  if (decodedHostname !== hostname) tokens.add(decodedHostname);

  // 2. All subdomain levels of the hostname
  const hostParts = hostname.split('.');
  for (let i = 0; i < hostParts.length; i++) {
    tokens.add(hostParts.slice(i).join('.'));
  }

  // 3. Sliding window of 2-label combinations
  for (let i = 0; i < hostParts.length - 1; i++) {
    tokens.add(hostParts.slice(i, i + 2).join('.'));
  }

  // 4. Same sliding windows on the decoded hostname
  const decodedParts = decodedHostname.split('.');
  if (decodedHostname !== hostname) {
    for (let i = 0; i < decodedParts.length; i++) {
      tokens.add(decodedParts.slice(i).join('.'));
    }
    for (let i = 0; i < decodedParts.length - 1; i++) {
      tokens.add(decodedParts.slice(i, i + 2).join('.'));
    }
  }

  // 5. Path segments
  try {
    const parsed = new URL(url.startsWith('http') ? url : 'https://' + url);
    const pathParts = parsed.pathname.split('/').filter(Boolean);
    pathParts.forEach(part => {
      // Only if it looks like a domain (contains a dot)
      if (part.includes('.')) tokens.add(part.toLowerCase());
    });
  } catch {}

  return Array.from(tokens);
}

// Calculate Levenshtein distance
function levenshteinDistance(a, b) {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      matrix[i][j] = b[i-1] === a[j-1]
        ? matrix[i-1][j-1]
        : Math.min(matrix[i-1][j-1] + 1, matrix[i][j-1] + 1, matrix[i-1][j] + 1);
    }
  }
  return matrix[b.length][a.length];
}

// Compare a candidate token against a legitimate domain
// Returns a score 0–1 (1 = identical)
function scorePair(token, legitimateDomain) {
  // Exact match
  if (token === legitimateDomain) return 1.0;

  // Check if the legitimate domain appears verbatim inside the token
  if (token.includes(legitimateDomain)) return 0.95;

  const tokenMain = token.split('.')[0];
  const legitMain = legitimateDomain.split('.')[0];
  const fragments = tokenMain.split('-');
  const bestFragment = Math.max(...fragments.map(frag => {
    const d = levenshteinDistance(frag, legitMain);
    return 1 - d / Math.max(frag.length, legitMain.length);
  }));

  const distance = levenshteinDistance(tokenMain, legitMain);
  const maxLen = Math.max(tokenMain.length, legitMain.length);
  const labelSimilarity = 1 - distance / maxLen;

  // Also check full-string Levenshtein for short domains
  const fullDistance = levenshteinDistance(token, legitimateDomain);
  const fullMaxLen = Math.max(token.length, legitimateDomain.length);
  const fullSimilarity = 1 - fullDistance / fullMaxLen;

  return Math.max(labelSimilarity, fullSimilarity, bestFragment * 0.85);
}

// Find candidates from inverted index for a given token
function findCandidates(token) {
  const trigrams = getTrigrams(token);
  const candidates = new Set();
  trigrams.forEach(tg => {
    if (invertedIndex[tg]) {
      invertedIndex[tg].forEach(d => candidates.add(d));
    }
  });
  return Array.from(candidates);
}

// Main check: given a raw URL, find the best phishing match
function checkUrl(rawUrl) {
  const tokens = extractAllTokens(rawUrl);
  const hostname = extractDomain(rawUrl);

  let bestMatch = null;
  let bestScore = 0;

  tokens.forEach(token => {
    const candidates = findCandidates(token);
    candidates.forEach(legitDomain => {
      const score = scorePair(token, legitDomain);
      // Only alert if the URL is NOT the legitimate domain itself
      if (score > bestScore && hostname !== legitDomain) {
        bestScore = score;
        bestMatch = legitDomain;
      }
    });
  });

  const THRESHOLD = 0.6;
  if (bestScore >= THRESHOLD && bestMatch) {
    return { match: bestMatch, score: bestScore };
  }
  return null;
}

// Listen for tab updates
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    const result = checkUrl(tab.url);
    if (result) {
      const hostname = extractDomain(tab.url);
      //const similarityPercent = Math.round(result.score * 100);
      chrome.notifications.create(`phishingAlert_${Date.now()}`, {
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: 'Phishing Alert!',
        message: `"${hostname}" resembles "${result.match}".\nThis might be a phishing attempt.` //(${similarityPercent}% match)
      });
    }
  }
});

// Handle notification clicks
chrome.notifications.onClicked.addListener(notificationId => {
  if (notificationId.startsWith('phishingAlert_')) {
    chrome.action.openPopup();
    chrome.notifications.clear(notificationId);
  }
});

// Handle messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "checkDomain") {
    const result = checkUrl(request.url);
    const hostname = extractDomain(request.url);
    sendResponse({ suspiciousDomain: hostname, result });
  }
});