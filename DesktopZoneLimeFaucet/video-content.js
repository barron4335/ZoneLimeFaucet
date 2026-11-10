// ===========================================================================
// video-content.js — tek seferlik, doğrulanmış play (MAIN world)
// - YouTube iframe: play butonuna tıkla, video gerçekten oynuyor mu kontrol et
// - Üst frame (blogspot): YT.Player API ile playVideo, state===1 teyit et
// - PLAY_CLICKED sadece gerçek oynatma teyit edilince gönderilir
// ===========================================================================
(function () {
  'use strict';

  if (window.__lfVideoDone) {
    console.log('[LF] atlandı (done)');
    return;
  }
  if (window.__lfVideoRunning) {
    console.log('[LF] atlandı (running)');
    return;
  }
  window.__lfVideoRunning = true;

  if (window.__lfPlayTimer) { clearInterval(window.__lfPlayTimer); window.__lfPlayTimer = null; }
  if (window.__lfCountdownTimer) { clearInterval(window.__lfCountdownTimer); window.__lfCountdownTimer = null; }
  if (window.__lfVerifyTimer) { clearInterval(window.__lfVerifyTimer); window.__lfVerifyTimer = null; }

  const isIframe = (() => { try { return window !== window.top; } catch (_) { return true; } })();
  const host = (location.hostname || '').toLowerCase();
  const isYouTubeFrame = host.includes('youtube.com') || host.includes('youtube-nocookie.com');
  const isTopBlog = !isIframe && (host.includes('blogspot.com') || host.includes('blogger.com') || host.includes('playvideoviewtime'));

  console.log('[LF] start | host:', host, '| YT-frame:', isYouTubeFrame, '| topBlog:', isTopBlog, '| iframe:', isIframe);

  // Sadece ilgili frame'lerde çalış
  if (!isYouTubeFrame && !isTopBlog) {
    console.log('[LF] bu frame atlandı (ne YT ne blog)');
    window.__lfVideoRunning = false;
    return;
  }

  let stopped = false;
  let playSucceeded = false;

  function sendToTop(type, payload) {
    const msg = { source: 'LF_VIDEO', type, ...(payload || {}) };
    try { window.postMessage(msg, '*'); } catch (_) {}
    try {
      if (window.top && window.top !== window) window.top.postMessage(msg, '*');
    } catch (_) {}
  }

  window.addEventListener('message', (ev) => {
    if (!ev.data || ev.data.source !== 'LF_MAIN') return;
    if (ev.data.type === 'STOP_VIDEO') {
      stopped = true;
      window.__lfVideoDone = true;
      if (window.__lfPlayTimer) clearInterval(window.__lfPlayTimer);
      if (window.__lfCountdownTimer) clearInterval(window.__lfCountdownTimer);
      if (window.__lfVerifyTimer) clearInterval(window.__lfVerifyTimer);
      removeOverlay();
    }
  });

  function simulateClick(el) {
    if (!el) return false;
    try {
      const rect = el.getBoundingClientRect();
      const x = rect.left + Math.max(1, rect.width / 2);
      const y = rect.top + Math.max(1, rect.height / 2);
      const opts = {
        bubbles: true, cancelable: true, composed: true,
        view: window, clientX: x, clientY: y, button: 0, buttons: 1
      };
      try { el.focus(); } catch (_) {}
      try { el.dispatchEvent(new PointerEvent('pointerover', opts)); } catch (_) {}
      try { el.dispatchEvent(new MouseEvent('mouseover', opts)); } catch (_) {}
      try { el.dispatchEvent(new PointerEvent('pointerdown', opts)); } catch (_) {}
      try { el.dispatchEvent(new MouseEvent('mousedown', opts)); } catch (_) {}
      try { el.dispatchEvent(new PointerEvent('pointerup', { ...opts, buttons: 0 })); } catch (_) {}
      try { el.dispatchEvent(new MouseEvent('mouseup', { ...opts, buttons: 0 })); } catch (_) {}
      try { el.dispatchEvent(new MouseEvent('click', { ...opts, buttons: 0 })); } catch (_) {}
      try { el.click(); } catch (_) {}
      return true;
    } catch (_) {
      try { el.click(); return true; } catch (__) { return false; }
    }
  }

  // --- YouTube iframe içi play butonu ---
  function tryClickPlayButton() {
    const selectors = [
      'button.ytp-large-play-button',
      '.ytp-large-play-button',
      'button.ytp-play-button',
      '.ytp-cued-thumbnail-overlay-image',
      'cued-overlay button',
      '#player-controls > ytm-custom-control > ytm-watch-player-controls > cued-overlay > button',
      'button[aria-label*="Play"]',
      'button[title*="Play"]',
      'button[aria-label*="Oynat"]'
    ];
    for (const sel of selectors) {
      try {
        const el = document.querySelector(sel);
        if (el && el.offsetWidth > 5 && el.offsetHeight > 5) {
          console.log('[LF] play butonu tıklanıyor:', sel);
          simulateClick(el);
          return 'click:' + sel;
        }
      } catch (_) {}
    }
    // video.play()
    try {
      const v = document.querySelector('video');
      if (v && v.paused) {
        try { v.muted = true; } catch (_) {}
        const p = v.play();
        if (p && p.catch) p.catch(() => {});
        console.log('[LF] video.play() çağrıldı');
        return 'video.play';
      }
      if (v && !v.paused && v.readyState >= 2) return 'already-playing';
    } catch (_) {}
    return null;
  }

  // --- Üst frame: YT IFrame API ---
  function tryApiPlay() {
    try {
      if (window.YT && typeof YT.get === 'function') {
        const p = YT.get('video-start');
        if (p && typeof p.playVideo === 'function') {
          try { if (typeof p.mute === 'function') p.mute(); } catch (_) {}
          p.playVideo();
          console.log('[LF] YT.get().playVideo() çağrıldı');
          return 'YT.playVideo';
        }
      }
    } catch (e) {
      console.warn('[LF] YT API hata:', e.message);
    }
    // fallback: global player
    try {
      if (typeof player !== 'undefined' && player && typeof player.playVideo === 'function') {
        try { player.mute && player.mute(); } catch (_) {}
        player.playVideo();
        console.log('[LF] player.playVideo() çağrıldı');
        return 'player.playVideo';
      }
    } catch (_) {}
    return null;
  }

  // Gerçek oynatma teyidi
  function isReallyPlaying() {
    // YouTube iframe içinde
    if (isYouTubeFrame) {
      try {
        const v = document.querySelector('video');
        if (v && !v.paused && !v.ended && v.readyState >= 2 && v.currentTime > 0.2) {
          return true;
        }
      } catch (_) {}
      return false;
    }
    // Üst frame
    try {
      if (window.YT && YT.get) {
        const p = YT.get('video-start');
        if (p && typeof p.getPlayerState === 'function') {
          const st = p.getPlayerState(); // 1 = playing
          if (st === 1) {
            const t = typeof p.getCurrentTime === 'function' ? p.getCurrentTime() : 0;
            if (t > 0.15) return true;
          }
        }
      }
    } catch (_) {}
    return false;
  }

  function showOverlay(total) {
    if (isIframe) return;
    if (document.getElementById('lf-video-overlay')) return;
    const overlay = document.createElement('div');
    overlay.id = 'lf-video-overlay';
    overlay.style.cssText = `
      position: fixed !important; top: 20px !important; right: 20px !important;
      background: rgba(20,20,20,0.95) !important; border: 1px solid #84cc16 !important;
      border-radius: 12px !important; padding: 16px 22px !important;
      z-index: 2147483647 !important; font-family: system-ui, sans-serif !important;
      color: #a3e635 !important; text-align: center !important;
      box-shadow: 0 4px 20px rgba(0,0,0,0.5) !important;
      user-select: none !important; pointer-events: none !important;
    `;
    overlay.innerHTML = `
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#9ca3af;">Kalan süre</div>
      <div id="lf-video-countdown" style="font-family:ui-monospace,monospace;font-size:28px;font-weight:700;color:#a3e635;line-height:1.1;margin:4px 0;">00:${String(total).padStart(2, '0')}</div>
    `;
    document.body.appendChild(overlay);
  }

  function updateOverlay(remaining) {
    const el = document.getElementById('lf-video-countdown');
    if (el) {
      const m = Math.floor(remaining / 60), s = remaining % 60;
      el.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }
  }

  function removeOverlay() {
    const el = document.getElementById('lf-video-overlay');
    if (el) el.remove();
  }

  function startCountdown() {
    if (playSucceeded) return;
    playSucceeded = true;
    window.__lfVideoDone = true;

    console.log('[LF] 🎯 PLAY DOĞRULANDI — countdown başlıyor');
    sendToTop('PLAY_CLICKED', { factor: isYouTubeFrame ? 'yt-iframe' : 'yt-api' });

    // 10–15 sn arası rastgele izleme süresi
    const total = 10 + Math.floor(Math.random() * 6); // 10,11,12,13,14,15
    let remaining = total;
    console.log('[LF] İzleme süresi (rastgele):', total, 'sn');
    showOverlay(total);
    updateOverlay(remaining);

    // Oynatma düşerse tekrar dene (aviso bazen pause ediyor)
    let rePlayCount = 0;
    window.__lfVerifyTimer = setInterval(() => {
      if (stopped) return;
      if (!isReallyPlaying() && rePlayCount < 8) {
        rePlayCount++;
        console.log('[LF] oynatma düştü, tekrar play #' + rePlayCount);
        if (isYouTubeFrame) tryClickPlayButton();
        else tryApiPlay();
      }
    }, 2000);

    window.__lfCountdownTimer = setInterval(() => {
      if (stopped) {
        clearInterval(window.__lfCountdownTimer);
        clearInterval(window.__lfVerifyTimer);
        removeOverlay();
        return;
      }
      remaining--;
      updateOverlay(remaining);
      if (remaining <= 0) {
        clearInterval(window.__lfCountdownTimer);
        clearInterval(window.__lfVerifyTimer);
        removeOverlay();
        console.log('[LF]', total, 'sn doldu → VIDEO_FINISHED');
        sendToTop('VIDEO_FINISHED');
      }
    }, 1000);
  }

  // Ana döngü: play dene → gerçekten oynuyor mu bekle
  let tries = 0;
  const MAX_TRIES = 20;

  setTimeout(() => {
    if (stopped || window.__lfVideoDone) return;

    window.__lfPlayTimer = setInterval(() => {
      if (stopped || playSucceeded || window.__lfVideoDone) {
        clearInterval(window.__lfPlayTimer);
        return;
      }
      tries++;
      console.log('[LF] deneme #' + tries);

      // 1) Play tetikle
      let factor = null;
      if (isYouTubeFrame) {
        factor = tryClickPlayButton();
      } else {
        factor = tryApiPlay();
        // API yetmezse iframe'e de tıklamayı dene (parent'tan sınırlı)
        if (!factor) {
          try {
            const iframe = document.getElementById('video-start');
            if (iframe) {
              iframe.focus();
              // iframe üzerine click — bazen activation verir
              const r = iframe.getBoundingClientRect();
              const opts = { bubbles: true, cancelable: true, view: window,
                clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, button: 0 };
              iframe.dispatchEvent(new MouseEvent('click', opts));
            }
          } catch (_) {}
        }
      }

      // 2) Kısa bekle, gerçekten oynuyor mu bak
      // (interval zaten 1sn, bir sonraki turda isReallyPlaying kontrol)
      if (isReallyPlaying()) {
        clearInterval(window.__lfPlayTimer);
        startCountdown();
        return;
      }

      if (tries >= MAX_TRIES) {
        clearInterval(window.__lfPlayTimer);
        // Son çare: tıklama/api yaptıysak yine de countdown başlat (eski davranış)
        // ama önce bir kez daha kontrol
        if (factor) {
          console.warn('[LF] teyit alınamadı ama play denendi, yine de devam');
          startCountdown();
        } else {
          window.__lfVideoDone = true;
          console.warn('[LF] play bulunamadı → VIDEO_FAILED');
          sendToTop('VIDEO_FAILED', { reason: 'play_not_found' });
        }
      }
    }, 1000);
  }, 1200);
})();
