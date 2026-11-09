// ===========================================================================
// video-content.js — Sekme içi Overlay + Doğrulanmış Play (MAIN world)
// ===========================================================================
(function () {
  'use strict';

  if (window.__lfVideoDone || window.__lfVideoRunning) return;
  window.__lfVideoRunning = true;

  const isTop = (window === window.top);
  const host = (location.hostname || '').toLowerCase();
  
  // Sadece video sitelerinde çalış
  const isVideoSite = host.includes('youtube.com') || host.includes('youtu.be') || host.includes('blogspot.com') || host.includes('blogger.com') || host.includes('playvideoviewtime');
  
  if (!isVideoSite) {
    window.__lfVideoRunning = false;
    return;
  }

  let stopped = false;
  let countdownStarted = false;
  let countdownInterval = null;
  let remainingSec = 60;

  // --- 1. EKRANA ÇİZİLECEK OVERLAY (Sadece en üst pencereyse çiz) ---
  function createOverlay() {
    if (!isTop) return;
    if (document.getElementById('lf-video-overlay')) return;

    const overlay = document.createElement('div');
    overlay.id = 'lf-video-overlay';
    overlay.style.cssText = `
      position: fixed !important;
      top: 20px !important;
      right: 20px !important;
      background: rgba(20, 20, 20, 0.95) !important;
      border: 2px solid #84cc16 !important;
      border-radius: 12px !important;
      padding: 15px 25px !important;
      z-index: 2147483647 !important; /* Maksimum z-index */
      font-family: system-ui, -apple-system, sans-serif !important;
      color: #a3e635 !important;
      text-align: center !important;
      box-shadow: 0 4px 20px rgba(0,0,0,0.8) !important;
      pointer-events: none !important; /* Tıklamaları engellememesi için */
    `;

    const title = document.createElement('div');
    title.textContent = 'Video İzleniyor';
    title.style.cssText = 'font-size: 14px !important; color: #9ca3af !important; margin-bottom: 5px !important; letter-spacing: 1px;';

    const timer = document.createElement('div');
    timer.id = 'lf-overlay-timer';
    timer.textContent = '00:00';
    timer.style.cssText = 'font-size: 38px !important; font-weight: bold !important; font-family: ui-monospace, "SF Mono", monospace !important; color: #39ff14 !important; text-shadow: 0 0 10px #39ff14, 0 0 20px #39ff14 !important;';

    overlay.appendChild(title);
    overlay.appendChild(timer);
    document.body.appendChild(overlay);
  }

  function updateOverlay(sec) {
    if (!isTop) return;
    const timerEl = document.getElementById('lf-overlay-timer');
    if (timerEl) {
      const m = Math.floor(sec / 60);
      const s = sec % 60;
      timerEl.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }
  }

  // --- 2. MESAJLAŞMA (Iframe ise ana pencereye haber ver) ---
  function sendToTop(type, payload) {
    const msg = { source: 'LF_VIDEO', type, ...(payload || {}) };
    if (isTop) {
        try { window.postMessage(msg, '*'); } catch (_) {}
    } else {
        try { window.top.postMessage(msg, '*'); } catch (_) {}
    }
  }

  window.addEventListener('message', (ev) => {
    if (!ev.data || ev.data.source !== 'LF_VIDEO') return;
    
    // Durdurma sinyali
    if (ev.data.type === 'STOP_VIDEO') {
      stopped = true;
      window.__lfVideoDone = true;
      if (countdownInterval) clearInterval(countdownInterval);
      const overlay = document.getElementById('lf-video-overlay');
      if (overlay) overlay.style.display = 'none';
    }
    
    // Iframe'den "oynatıldı" sinyali geldiyse sayacı başlat
    if (ev.data.type === 'PLAY_CLICKED' && isTop && !countdownStarted) {
        startCountdown(ev.data.seconds || 60);
    }
  });

  // --- 3. VİDEO TIKLAMA VE OYNATMA MANTIĞI ---
  function simulateClick(el) {
    if (!el) return false;
    try {
      el.scrollIntoView({ behavior: 'instant', block: 'center' });
      const rect = el.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      const opts = { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y, button: 0, buttons: 1 };
      try { el.dispatchEvent(new PointerEvent('pointerdown', opts)); } catch (_) {}
      try { el.dispatchEvent(new MouseEvent('mousedown', opts)); } catch (_) {}
      try { el.dispatchEvent(new PointerEvent('pointerup', opts)); } catch (_) {}
      try { el.dispatchEvent(new MouseEvent('mouseup', opts)); } catch (_) {}
      try { el.dispatchEvent(new MouseEvent('click', opts)); } catch (_) {}
      try { el.click(); } catch (_) {}
      return true;
    } catch (_) { return false; }
  }

  function tryClickPlayButton() {
    const selectors = [
      'button.ytp-large-play-button', '.ytp-large-play-button',
      'button.ytp-play-button', '.ytp-cued-thumbnail-overlay-image',
      'button[aria-label*="Play"]', 'button[title*="Play"]', 'button[aria-label*="Oynat"]'
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.offsetWidth > 5) { simulateClick(el); return true; }
    }
    const v = document.querySelector('video');
    if (v && v.paused) { try { v.muted = true; } catch(_){} v.play().catch(()=>{}); return true; }
    return false;
  }

  function isReallyPlaying() {
    try {
      const v = document.querySelector('video');
      if (v && !v.paused && !v.ended && v.readyState >= 2 && v.currentTime > 0.2) {
        return true;
      }
    } catch (_) {}
    return false;
  }

  // --- 4. SAYAÇ BAŞLATMA ---
  function startCountdown(seconds) {
    if (!isTop || countdownStarted) return;
    countdownStarted = true;
    window.__lfVideoDone = true;

    createOverlay();
    sendToTop('PLAY_CLICKED'); // Background'a "Başladı" sinyali gönder

    remainingSec = Math.max(5, Math.min(300, Number(seconds) || 60));
    updateOverlay(remainingSec);

    countdownInterval = setInterval(() => {
      if (stopped) { clearInterval(countdownInterval); return; }
      remainingSec--;
      updateOverlay(remainingSec);
      
      if (remainingSec <= 0) {
        clearInterval(countdownInterval);
        sendToTop('VIDEO_FINISHED'); // Süre bitti, Background'a haber ver
      }
    }, 1000);
  }

  // --- 5. BAŞLATICI DÖNGÜ ---
  setTimeout(() => {
    if (stopped) return;
    // Süreyi localStorage veya window değişkeninden al
    const watchSec = Number(localStorage.getItem('lfVideoSeconds')) || Number(window.__lfVideoSeconds) || 60;

    if (isTop) {
        createOverlay();
        updateOverlay(watchSec);
    }

    let tries = 0;
    const MAX_TRIES = 20; // En fazla 20 saniye oynatmayı dene
    
    const playTimer = setInterval(() => {
        if (stopped || window.__lfVideoDone) {
            clearInterval(playTimer);
            return;
        }
        tries++;

        const clicked = tryClickPlayButton();
        
        if (isReallyPlaying()) {
            clearInterval(playTimer);
            if (isTop) {
                startCountdown(watchSec);
            } else {
                // Eğer iframe içindeysek, ana pencereye "başladı" mesajı gönder
                window.top.postMessage({ source: 'LF_VIDEO', type: 'PLAY_CLICKED', seconds: watchSec }, '*');
            }
            return;
        }

        // 20 saniye boyunca oynamadıysa zorla başlat (bazen video elementini okumak engellenir)
        if (tries >= MAX_TRIES) {
            clearInterval(playTimer);
            if (clicked || isTop) {
                 if (isTop) startCountdown(watchSec);
                 else window.top.postMessage({ source: 'LF_VIDEO', type: 'PLAY_CLICKED', seconds: watchSec }, '*');
            } else {
                 sendToTop('VIDEO_FAILED', { reason: 'play_not_found' });
            }
        }
    }, 1000);

  }, 800);
})();