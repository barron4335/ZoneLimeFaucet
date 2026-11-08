// ===========================================================================
// background.js — Gelişmiş sekme kapatma
// ===========================================================================

chrome.runtime.onInstalled.addListener(async () => {
  await captureCookies();
});

let awaitingVideoTab = null;
let currentVideoTab = null;

function isVideoPage(url) {
  if (!url) return false;
  const u = url.toLowerCase();
  return (
    u.includes('youtube.com') || u.includes('m.youtube.com') || u.includes('youtu.be') ||
    u.includes('blogspot.com') || u.includes('blogger.com') ||
    u.includes('/embed/') || u.includes('youtube-nocookie.com') ||
    (u.includes('video') && (u.includes('play') || u.includes('watch') || u.includes('embed')))
  );
}

async function injectVideoScripts(tabId, frameIds = null) {
  if (currentVideoTab && currentVideoTab.playDone) return;
  const target = frameIds ? { tabId, frameIds } : { tabId, allFrames: true };

  let watchSec = 60;
  try {
    const st = await chrome.storage.local.get(['lfVideoSeconds']);
    if (st && st.lfVideoSeconds) watchSec = Number(st.lfVideoSeconds) || 60;
  } catch (_) {}
  
  try {
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: false },
      world: 'MAIN',
      func: (sec) => {
        try { window.__lfVideoSeconds = sec; localStorage.setItem('lfVideoSeconds', String(sec)); } catch (_) {}
      },
      args: [watchSec],
    });
  } catch (e) {}

  try {
    await chrome.scripting.executeScript({ target, files: ['video-bridge.js'] });
  } catch (e) {}

  try {
    await chrome.scripting.executeScript({ target, files: ['video-content.js'], world: 'MAIN' });
  } catch (e) {}
}

chrome.tabs.onCreated.addListener(async (tab) => {
  if (!awaitingVideoTab) return;
  if (!currentVideoTab || !currentVideoTab.playDone) {
    currentVideoTab = { videoTabId: tab.id, mainTabId: awaitingVideoTab.mainTabId, playDone: false };
  }
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url && tab.url.includes('limefaucet.com')) {
    await captureCookies();
  }

  if (awaitingVideoTab && changeInfo.status === 'complete' && tab.url && isVideoPage(tab.url)) {
    if (tabId === awaitingVideoTab.mainTabId) return;
    currentVideoTab = { videoTabId: tabId, mainTabId: awaitingVideoTab.mainTabId, playDone: false };
    awaitingVideoTab = null;

    try { await chrome.tabs.update(tabId, { active: true }); } catch (_) {}
    await injectVideoScripts(tabId);

    for (let i = 0; i < 2; i++) {
      await new Promise(r => setTimeout(r, 3000));
      if (!currentVideoTab || currentVideoTab.videoTabId !== tabId || currentVideoTab.playDone) break;
      try { await injectVideoScripts(tabId); } catch (e) {}
    }
  }
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
      func: (cookieData) => { if (typeof lfSaveCookies === 'function') lfSaveCookies(cookieData); },
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
      setTimeout(() => {
        if (awaitingVideoTab && Date.now() - awaitingVideoTab.timestamp > 18000) awaitingVideoTab = null;
      }, 20000);
      sendResponse({ ok: true });
      return true;
    }

    if (msg && msg.type === 'CLOSE_VIDEO_TAB') {
      const mainTabId = sender.tab?.id;
      console.log('[BG] CLOSE_VIDEO_TAB alındı, mainTabId:', mainTabId);

      const closeTab = (id) => {
        if (!id || id === mainTabId) return;
        chrome.tabs.remove(id).then(() => {
          console.log('[BG] Sekme kapatıldı:', id);
        }).catch((e) => {
          console.warn('[BG] Normal kapatma başarısız (Mises), aktifleştirip denenecek:', id);
          chrome.tabs.update(id, { active: true }).then(() => {
            setTimeout(() => {
              chrome.tabs.remove(id).then(() => {
                console.log('[BG] Sekme yedek yöntemle kapatıldı:', id);
              }).catch(err => {
                console.warn('[BG] Sekme kapatılamadı, boş sayfaya yönlendiriliyor:', id);
                // Son çare: Boş sayfaya yönlendirerek YouTube'un arka planda çalışmasını engelle
                chrome.tabs.update(id, { url: 'about:blank' }).catch(() => {});
              });
            }, 200);
          }).catch(() => {});
        });
      };

      if (currentVideoTab && currentVideoTab.videoTabId) {
        closeTab(currentVideoTab.videoTabId);
      }

      const closeAllVideoTabs = () => {
        chrome.tabs.query({}, (tabs) => {
          (tabs || []).forEach(t => {
            if (t.id === mainTabId) return;
            const u = t.url || t.pendingUrl || '';
            if (isVideoPage(u) || /youtube|youtu\.be|blogspot|blogger|m\.youtube/i.test(u)) {
              closeTab(t.id);
            }
          });
        });
      };

      closeAllVideoTabs();
      // Gecikmeli denemeler (Mises için)
      [800, 1500, 2500].forEach(delay => setTimeout(closeAllVideoTabs, delay));

      currentVideoTab = null;
      awaitingVideoTab = null;
      sendResponse({ ok: true });
      return true;
    }

    if (msg && msg.type === 'PLAY_CLICKED') {
      if (currentVideoTab) {
        currentVideoTab.playDone = true;
        if (currentVideoTab.mainTabId) {
          chrome.tabs.sendMessage(currentVideoTab.mainTabId, { type: 'PLAY_CLICKED' }).catch(() => {});
        }
      }
      sendResponse({ ok: true });
      return true;
    }

    if (msg && msg.type === 'VIDEO_FINISHED') {
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