document.addEventListener('DOMContentLoaded', function () {
  const resultsEl = document.getElementById('results');
  const domainDisplay = document.getElementById('domain-display');
  const headerShield = document.getElementById('header-shield');

  document.getElementById('close-btn').addEventListener('click', () => window.close());

  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    const currentUrl = tabs[0].url;

    chrome.runtime.sendMessage({ action: "checkDomain", url: currentUrl }, function (response) {
      const domain = response.suspiciousDomain;
      const result = response.result;

      domainDisplay.textContent = domain;

      if (!result) {
        headerShield.innerHTML = `<path d="M10 2L3 5v5c0 4.4 3 8.1 7 9 4-0.9 7-4.6 7-9V5L10 2z" fill="#e8f5e9" stroke="#27ae60" stroke-width="1.2"/>`;
        resultsEl.innerHTML = `
          <div class="status-safe">
            <div class="status-icon-safe">
              <svg viewBox="0 0 24 24" fill="none" width="20" height="20">
                <path d="M5 13l4 4L19 7" stroke="#27ae60" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </div>
            <div class="status-label safe">No threats detected</div>
            <div class="status-sub">This domain looks legitimate</div>
          </div>`;
      } else {
        const pct = Math.round(result.score * 100);
        headerShield.innerHTML = `<path d="M10 2L3 5v5c0 4.4 3 8.1 7 9 4-0.9 7-4.6 7-9V5L10 2z" fill="#fde8e8" stroke="#c0392b" stroke-width="1.2"/>`;
        resultsEl.innerHTML = `
          <div class="status-warn">
            <div class="warn-top">
              <div class="warn-icon">
                <svg viewBox="0 0 24 24" fill="none" width="18" height="18">
                  <path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
                    stroke="#c0392b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </div>
              <div>
                <div class="warn-title">Phishing suspected</div>
                <div class="warn-sub">This link may be impersonating a trusted site</div>
              </div>
            </div>
            <div class="match-row">
              <div>
                <div class="match-label">Resembles</div>
                <div class="match-domain">${result.match}</div>
              </div>
              <div class="match-pill">${pct}% match</div>
            </div>
          </div>`;
      }
    });
  });
});
