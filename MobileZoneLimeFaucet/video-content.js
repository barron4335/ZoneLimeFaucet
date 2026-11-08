// ===========================================================================
// video-content.js — tek seferlik, doğrulanmış play (MAIN world)
// Mises/TrustedHTML hatalarını önlemek için DOM manipülasyonu yapmaz.
// ===========================================================================
(function () {
  'use strict';

  if (window.__lfVideoDone || window.__lfVideoRunning) {
    return;
  }
  window.__lfVideoRunning = true;

  if (window.__lfPlayTimer) clearInterval(window.__lfPlayTimer);
  if (window.__lfCountdownTimer) clearInterval(window.__lfCountdownTimer);
  if (window.__lfVerifyTimer) clearInterval(window.__lfVerifyTimer);

  const isIframe = (() => { try { return window !== window.top; } catch (_) { return true; } })();
  const host = (location.hostname || '').toLowerCase();
  const isYouTubeFrame = host.includes('youtube.com') || host.includes('youtube-nocookie.com');
  const isTopBlog = !isIframe && (host.includes('blogspot.com') || host.includes('blogger.com') || host.includes('playvideoviewtime'));

  if (!isYouTubeFrame && !isTopBlog) {
    window.__lfVideoRunning = false;
    return;
  }

  const isMobileYT = host.includes('m.youtube.com') || (isYouTubeFrame && /m\.youtube|youtube\.com\/watch/.test(location.href));

  let stopped = false;
  let playSucceeded = false;

  async function resolveWatchSeconds() {
    let sec = 0;
    try {
      const ls = localStorage.getItem('lfVideoSeconds');
      if (ls) sec = parseInt(ls, 10) || 0;
    } catch (_) {}
    if (!sec && window.__lfVideoSeconds) sec = Number(window.__lfVideoSeconds) || 0;
    if (!sec || sec < 5) sec = 60;
    if (sec > 300) sec = 300;
    return sec;
  }

  function sendToTop(type, payload) {
    const msg = { source: 'LF_VIDEO', type, ...(payload || {}) };
    try { window.postMessage(msg, '*'); } catch (_) {}
    try { if (window.top && window.top !== window) window.top.postMessage(msg, '*'); } catch (_) {}
  }

  window.addEventListener('message', (ev) => {
    if (!ev.data || ev.data.source !== 'LF_MAIN') return;
    if (ev.data.type === 'STOP_VIDEO') {
      stopped = true;
      window.__lfVideoDone = true;
      if (window.__lfPlayTimer) clearInterval(window.__lfPlayTimer);
      if (window.__lfCountdownTimer) clearInterval(window.__lfCountdownTimer);
      if (window.__lfVerifyTimer) clearInterval(window.__lfVerifyTimer);
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
          simulateClick(el);
          return 'click:' + sel;
        }
      } catch (_) {}
    }
    try {
      const v = document.querySelector('video');
      if (v && v.paused) {
        try { v.muted = true; } catch (_) {}
        const p = v.play();
        if (p && p.catch) p.catch(() => {});
        return 'video.play';
      }
      if (v && !v.paused && v.readyState >= 2) return 'already-playing';
    } catch (_) {}
    return null;
  }

  function tryApiPlay() {
    try {
      if (window.YT && typeof YT.get === 'function') {
        const p = YT.get('video-start');
        if (p && typeof p.playVideo === 'function') {
          try { if (typeof p.mute === 'function') p.mute(); } catch (_) {}
          p.playVideo();
          return 'YT.playVideo';
        }
      }
    } catch (e) {}
    try {
      if (typeof player !== 'undefined' && player && typeof player.playVideo === 'function') {
        try { player.mute && player.mute(); } catch (_) {}
        player.playVideo();
        return 'player.playVideo';
      }
    } catch (_) {}
    return null;
  }

  function isReallyPlaying() {
    if (isYouTubeFrame) {
      try {
        const v = document.querySelector('video');
        if (v && !v.paused && !v.ended && v.readyState >= 2 && v.currentTime > 0.2) {
          return true;
        }
      } catch (_) {}
      return false;
    }
    try {
      if (window.YT && YT.get) {
        const p = YT.get('video-start');
        if (p && typeof p.getPlayerState === 'function') {
          const st = p.getPlayerState();
          if (st === 1) {
            const t = typeof p.getCurrentTime === 'function' ? p.getCurrentTime() : 0;
            if (t > 0.15) return true;
          }
        }
      }
    } catch (_) {}
    return false;
  }

  function startCountdown(forcedTotal) {
    if (playSucceeded) return;
    playSucceeded = true;
    window.__lfVideoDone = true;

    sendToTop('PLAY_CLICKED', { factor: isYouTubeFrame ? 'yt-iframe' : 'yt-api' });

    let total = Number(forcedTotal) || 0;
    if (!total || total < 5) {
      try {
        total = Number(window.__lfVideoSeconds) || Number(localStorage.getItem('lfVideoSeconds')) || 60;
      } catch (_) {
        total = 60;
      }
    }
    total = Math.max(5, Math.min(300, Math.floor(total)));
    let remaining = total;

    // Video düşerse tekrar oynatma denemesi (sayfa içi sayaç yok)
    let rePlayCount = 0;
    window.__lfVerifyTimer = setInterval(() => {
      if (stopped) return;
      if (!isReallyPlaying() && rePlayCount < 8) {
        rePlayCount++;
        if (isYouTubeFrame) tryClickPlayButton();
        else tryApiPlay();
      }
    }, 2000);

    window.__lfCountdownTimer = setInterval(() => {
      if (stopped) {
        clearInterval(window.__lfCountdownTimer);
        clearInterval(window.__lfVerifyTimer);
        return;
      }
      remaining--;
      if (remaining <= 0) {
        clearInterval(window.__lfCountdownTimer);
        clearInterval(window.__lfVerifyTimer);
        sendToTop('VIDEO_FINISHED');
      }
    }, 1000);
  }

  let tries = 0;
  const MAX_TRIES = 20;

  setTimeout(async () => {
    if (stopped || window.__lfVideoDone) return;
    const watchSec = await resolveWatchSeconds();

    if (isMobileYT || host.includes('m.youtube.com')) {
      tryClickPlayButton();
      setTimeout(() => {
        if (stopped || playSucceeded || window.__lfVideoDone) return;
        tryClickPlayButton();
        startCountdown(watchSec);
      }, 2000);
      return;
    }

    window.__lfPlayTimer = setInterval(() => {
      if (stopped || playSucceeded || window.__lfVideoDone) {
        clearInterval(window.__lfPlayTimer);
        return;
      }
      tries++;

      let factor = null;
      if (isYouTubeFrame) {
        factor = tryClickPlayButton();
      } else {
        factor = tryApiPlay();
      }

      if (isReallyPlaying()) {
        clearInterval(window.__lfPlayTimer);
        startCountdown(watchSec);
        return;
      }

      if (tries >= MAX_TRIES) {
        clearInterval(window.__lfPlayTimer);
        if (factor || isYouTubeFrame) {
          startCountdown(watchSec);
        } else {
          window.__lfVideoDone = true;
          sendToTop('VIDEO_FAILED', { reason: 'play_not_found' });
        }
      }
    }, 1000);
  }, 800);
})();