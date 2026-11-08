// ===========================================================================
// background.js — iyileştirilmiş yeni sekme yakalama + dual injection
// PLAY_CLICKED sonrası enjeksiyon durur (player reset önlenir)
// ===========================================================================

chrome.runtime.onInstalled.addListener(async () => {
  await captureCookies();
});

let awaitingVideoTab = null;   // { mainTabId, timestamp }
let currentVideoTab = null;    // { videoTabId, mainTabId, playDone: bool }

function isVideoPage(url) {
  if (!url) return false;
  const u = url.toLowerCase();
  return (
    u.includes('youtube.com') ||
    u.includes('youtu.be') ||
    u.includes('videotimeplaywatch.blogspot.com') ||
    u.includes('blogspot.com') ||
    u.includes('blogger.com') ||
    u.includes('/embed/') ||
    u.includes('ytimg.com') ||
    u.includes('googleusercontent.com') ||
    (u.includes('video') && (u.includes('play') || u.includes('watch') || u.includes('embed')))
  );
}

/** Bridge (ISOLATED) + video-content (MAIN) enjekte et */
async function injectVideoScripts(tabId, frameIds = null) {
  // Play zaten başarılı olduysa bir daha enjekte etme
  if (currentVideoTab && currentVideoTab.playDone) {
    console.log('[BG] Play zaten tamam, enjeksiyon atlandı');
    return;
  }

  const target = frameIds
    ? { tabId, frameIds }
    : { tabId, allFrames: true };

  // 1) Önce isolated bridge
  try {
    const bridgeRes = await chrome.scripting.executeScript({
      target,
      files: ['video-bridge.js'],
    });
    const bridgeCount = bridgeRes ? bridgeRes.length : 0;
    console.log(`[BG] Bridge enjeksiyon: ${bridgeCount} frame`);
  } catch (e) {
    console.warn('[BG] Bridge enjeksiyon hatası:', e && e.message ? e.message : e);
  }

  // 2) Sonra MAIN world video-content
  try {
    const mainRes = await chrome.scripting.executeScript({
      target,
      files: ['video-content.js'],
      world: 'MAIN',
    });
    const mainCount = mainRes ? mainRes.length : 0;
    console.log(`[BG] MAIN video-content enjeksiyon: ${mainCount} frame`);
  } catch (e) {
    console.warn('[BG] MAIN enjeksiyon hatası:', e && e.message ? e.message : e);
  }
}

// Yeni sekme oluşturulduğunda
chrome.tabs.onCreated.addListener(async (tab) => {
  if (!awaitingVideoTab) return;
  console.log('[BG] onCreated → potansiyel video sekmesi ID:', tab.id, 'pendingUrl:', tab.pendingUrl || tab.url);
});

// Sekme güncellendiğinde
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url && tab.url.includes('limefaucet.com')) {
    await captureCookies();
  }

  if (awaitingVideoTab && changeInfo.status === 'complete' && tab.url && isVideoPage(tab.url)) {
    if (tabId === awaitingVideoTab.mainTabId) return;

    console.log('[BG] Video sekmesi yakalandı! ID:', tabId, 'URL:', tab.url);

    currentVideoTab = {
      videoTabId: tabId,
      mainTabId: awaitingVideoTab.mainTabId,
      playDone: false
    };
    awaitingVideoTab = null;

    // Focus
    try {
      await chrome.tabs.update(tabId, { active: true });
    } catch (_) {}

    // Tek seferlik ana enjeksiyon
    await injectVideoScripts(tabId);

    // Sadece 2 yedek (daha az agresif) — playDone olursa durur
    for (let i = 0; i < 2; i++) {
      await new Promise(r => setTimeout(r, 3000));
      if (!currentVideoTab || currentVideoTab.videoTabId !== tabId || currentVideoTab.playDone) {
        console.log('[BG] Yedek enjeksiyon iptal (playDone veya tab değişti)');
        break;
      }
      try {
        await injectVideoScripts(tabId);
        console.log(`[BG] Yedek enjeksiyon #${i + 1} tamam`);
      } catch (e) {
        console.warn(`[BG] Yedek enjeksiyon #${i + 1} başarısız:`, e && e.message ? e.message : e);
      }
    }
  }
});

// iframe / frame yüklenmeleri
chrome.webNavigation.onCompleted.addListener(async (details) => {
  if (!currentVideoTab) return;
  if (details.tabId !== currentVideoTab.videoTabId) return;
  if (currentVideoTab.playDone) return; // play olduktan sonra hiç enjekte etme

  const frameUrl = details.url || '';
  const isYt = frameUrl.includes('youtube.com') || frameUrl.includes('youtu.be') || frameUrl.includes('/embed/');

  if (details.frameId === 0 || isYt) {
    console.log('[BG] Frame yüklendi:', frameUrl.slice(0, 80), 'frameId:', details.frameId);
    try {
      // frameId 0 için allFrames, diğerleri için spesifik
      await injectVideoScripts(details.tabId, details.frameId === 0 ? null : [details.frameId]);
      console.log('[BG] Frame enjeksiyon başarılı → frameId:', details.frameId);
    } catch (e) {
      console.warn('[BG] Frame enjeksiyon hatası:', e && e.message ? e.message : e);
    }
  }
});

chrome.webNavigation.onCreatedNavigationTarget.addListener(async (details) => {
  if (!awaitingVideoTab) return;
  console.log('[BG] onCreatedNavigationTarget → tabId:', details.tabId, 'url:', details.url);
});

async function captureCookies() {
  try {
    const tabs = await chrome.tabs.query({ url: '*://*.limefaucet.com/*' });
    if (tabs.length === 0) return;
    const cookies = await chrome.cookies.getAll({ domain: 'limefaucet.com' });
    if (cookies.length === 0) return;
    const activeTab = tabs[0];
    await chrome.scripting.executeScript({
      target: { tabId: activeTab.id },
      func: (cookieData) => {
        if (typeof lfSaveCookies === 'function') lfSaveCookies(cookieData);
      },
      args: [cookies],
    });
  } catch (err) {
    console.error('Çerez yakalama hatası:', err);
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  try {
    if (msg && msg.type === 'TASK_START_VIDEO') {
      awaitingVideoTab = { mainTabId: sender.tab.id, timestamp: Date.now() };
      console.log('[BG] Video sekmesi bekleniyor... mainTabId:', sender.tab.id);

      setTimeout(() => {
        if (awaitingVideoTab && Date.now() - awaitingVideoTab.timestamp > 18000) {
          console.warn('[BG] awaitingVideoTab timeout, temizleniyor');
          awaitingVideoTab = null;
        }
      }, 20000);

      sendResponse({ ok: true });
      return true;
    }

    if (msg && msg.type === 'CLOSE_VIDEO_TAB') {
      if (currentVideoTab) {
        chrome.tabs.sendMessage(currentVideoTab.videoTabId, { type: 'STOP_VIDEO' }).catch(() => {});
        chrome.tabs.remove(currentVideoTab.videoTabId).catch(() => {});
        currentVideoTab = null;
      } else {
        const mainTabId = sender.tab?.id;
        chrome.tabs.query({}, (tabs) => {
          tabs.forEach(t => {
            if (t.id !== mainTabId && isVideoPage(t.url)) {
              chrome.tabs.sendMessage(t.id, { type: 'STOP_VIDEO' }).catch(() => {});
              chrome.tabs.remove(t.id).catch(() => {});
            }
          });
        });
      }
      sendResponse({ ok: true });
      return true;
    }

    if (msg && msg.type === 'PLAY_CLICKED') {
      console.log('[BG] PLAY_CLICKED alındı → mainTab\'a iletiliyor, enjeksiyonlar durduruluyor');
      if (currentVideoTab) {
        currentVideoTab.playDone = true; // kritik: bundan sonra enjeksiyon yok
        if (currentVideoTab.mainTabId) {
          chrome.tabs.sendMessage(currentVideoTab.mainTabId, { type: 'PLAY_CLICKED' }).catch(() => {});
        }
      }
      sendResponse({ ok: true });
      return true;
    }

    if (msg && msg.type === 'VIDEO_FINISHED') {
      console.log('[BG] VIDEO_FINISHED alındı');
      if (currentVideoTab) {
        const mainTabId = currentVideoTab.mainTabId;
        chrome.tabs.remove(currentVideoTab.videoTabId).catch(() => {});
        currentVideoTab = null;
        chrome.tabs.sendMessage(mainTabId, { type: 'VIDEO_FINISHED' }).catch(() => {});
      }
      sendResponse({ ok: true });
      return true;
    }

    if (msg && msg.type === 'VIDEO_FAILED') {
      console.log('[BG] VIDEO_FAILED alındı:', msg.reason);
      if (currentVideoTab) {
        const mainTabId = currentVideoTab.mainTabId;
        chrome.tabs.remove(currentVideoTab.videoTabId).catch(() => {});
        currentVideoTab = null;
        chrome.tabs.sendMessage(mainTabId, { type: 'VIDEO_FAILED', reason: msg.reason || '' }).catch(() => {});
      }
      sendResponse({ ok: true });
      return true;
    }

    if (msg && msg.type === 'FORCE_CAPTURE') {
      captureCookies();
      sendResponse({ ok: true });
      return true;
    }

    sendResponse({ ok: false, error: 'Unknown message type' });
    return true;
  } catch (err) {
    try { sendResponse({ ok: false, error: String(err) }); } catch (_) {}
    return true;
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  if (currentVideoTab && currentVideoTab.videoTabId === tabId) {
    const mainTabId = currentVideoTab.mainTabId;
    currentVideoTab = null;
    chrome.tabs.sendMessage(mainTabId, { type: 'VIDEO_TAB_CLOSED' }).catch(() => {});
  }
});
