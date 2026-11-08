// ===========================================================================
// video-bridge.js — ISOLATED world bridge
// MAIN world (video-content.js) → postMessage → burada → chrome.runtime
// ===========================================================================
(function () {
  'use strict';

  if (window.__lfBridgeInstalled) return;
  window.__lfBridgeInstalled = true;

  console.log('[LF-BRIDGE] Isolated bridge yüklendi | URL:', location.href, '| frame:', window === window.top ? 'top' : 'iframe');

  // MAIN world'den gelen postMessage'ları background'a ilet
  window.addEventListener('message', (ev) => {
    if (!ev.data || ev.data.source !== 'LF_VIDEO') return;
    const type = ev.data.type;
    console.log('[LF-BRIDGE] MAIN → runtime iletiliyor:', type);
    try {
      chrome.runtime.sendMessage({
        type: type,
        reason: ev.data.reason || '',
        factor: ev.data.factor || null
      }).catch((err) => {
        console.warn('[LF-BRIDGE] sendMessage hatası:', err && err.message);
      });
    } catch (e) {
      console.warn('[LF-BRIDGE] runtime erişim hatası:', e);
    }
  });

  // Background'dan gelen STOP_VIDEO'yu MAIN world'e ilet
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg && msg.type === 'STOP_VIDEO') {
      console.log('[LF-BRIDGE] STOP_VIDEO alındı, MAIN\'e postMessage');
      try {
        window.postMessage({ source: 'LF_MAIN', type: 'STOP_VIDEO' }, '*');
      } catch (_) {}
      sendResponse({ ok: true });
      return true;
    }
    // Diğer mesajlar için de yanıt ver (port closed hatasını azaltmak için)
    sendResponse({ ok: true });
    return true;
  });
})();
