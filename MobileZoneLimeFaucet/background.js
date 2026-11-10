// ===========================================================================
// background.js — Gelişmiş sekme kapatma ve enjeksiyon yönetimi (v1.6.1)
// 3 katmanlı dayanıklılık:
//   1) sender.tab öncelikli kapatma
//   2) chrome.storage.local ile state kalıcılığı (Lemur / mobil uyumlu)
//   3) Tüm video sekmelerini tarayan güçlü fallback
// ===========================================================================

chrome.runtime.onInstalled.addListener(async () => {
  await captureCookies();
  await clearVideoState();
});

let awaitingVideoTab = null;
let currentVideoTab = null;

// ---------------------------------------------------------------------------
// State kalıcılığı (chrome.storage.local) — SW ölse bile ayakta kalır
// Not: session yerine local kullanıldı (Lemur Browser / mobil uyumluluk)
// ---------------------------------------------------------------------------
async function saveVideoState() {
  try {
    await chrome.storage.local.set({
      lfAwaitingVideoTab: awaitingVideoTab,
      lfCurrentVideoTab: currentVideoTab,
    });
  } catch (_) {}
}

async function loadVideoState() {
  try {
    const st = await chrome.storage.local.get(['lfAwaitingVideoTab', 'lfCurrentVideoTab']);
    if (st.lfAwaitingVideoTab !== undefined) awaitingVideoTab = st.lfAwaitingVideoTab;
    if (st.lfCurrentVideoTab !== undefined) currentVideoTab = st.lfCurrentVideoTab;
  } catch (_) {}
}

async function clearVideoState() {
  awaitingVideoTab = null;
  currentVideoTab = null;
  try {
    await chrome.storage.local.remove(['lfAwaitingVideoTab', 'lfCurrentVideoTab']);
  } catch (_) {}
}

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
  await loadVideoState();

  // Sadece AYNI sekme zaten playDone olmuşsa enjeksiyonu atla.
  // Önceki görevden kalan playDone yeni sekmeyi engellemesin.
  if (currentVideoTab && currentVideoTab.videoTabId === tabId && currentVideoTab.playDone) {
    return;
  }

  // Tüm frame'lere enjekte et (iframe içindeki YouTube videoları için önemli)
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

  // Bridge (ISOLATED world)
  try {
    await chrome.scripting.executeScript({ target, files: ['video-bridge.js'] });
  } catch (e) {}

  // Content (MAIN world)
  try {
    await chrome.scripting.executeScript({ target, files: ['video-content.js'], world: 'MAIN' });
  } catch (e) {}
}

// ---------------------------------------------------------------------------
// Güvenli sekme kapatma yardımcısı
// ---------------------------------------------------------------------------
function closeTabSafe(id, mainTabId) {
  if (!id || id === mainTabId) return;
  chrome.tabs.remove(id).then(() => {
    console.log('[BG] Sekme kapatıldı:', id);
  }).catch(() => {
    // Bazı durumlarda remove başarısız olabilir → aktif yapıp tekrar dene
    chrome.tabs.update(id, { active: true }).then(() => {
      setTimeout(() => {
        chrome.tabs.remove(id).catch(() => {
          chrome.tabs.update(id, { url: 'about:blank' }).catch(() => {});
        });
      }, 200);
    }).catch(() => {});
  });
}

function closeAllVideoTabs(mainTabId) {
  chrome.tabs.query({}, (tabs) => {
    (tabs || []).forEach(t => {
      if (t.id === mainTabId) return;
      const u = t.url || t.pendingUrl || '';
      if (isVideoPage(u) || /youtube|youtu\.be|blogspot|blogger|m\.youtube/i.test(u)) {
        closeTabSafe(t.id, mainTabId);
      }
    });
  });
}

chrome.tabs.onCreated.addListener(async (tab) => {
  await loadVideoState();
  if (!awaitingVideoTab) return;
  if (!currentVideoTab || !currentVideoTab.playDone) {
    currentVideoTab = { videoTabId: tab.id, mainTabId: awaitingVideoTab.mainTabId, playDone: false };
    await saveVideoState();
  }
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url && tab.url.includes('limefaucet.com')) {
    await captureCookies();
  }

  await loadVideoState();

  if (awaitingVideoTab && changeInfo.status === 'complete' && tab.url && isVideoPage(tab.url)) {
    if (tabId === awaitingVideoTab.mainTabId) return;

    currentVideoTab = { videoTabId: tabId, mainTabId: awaitingVideoTab.mainTabId, playDone: false };
    awaitingVideoTab = null;
    await saveVideoState();

    try { await chrome.tabs.update(tabId, { active: true }); } catch (_) {}
    await injectVideoScripts(tabId);

    for (let i = 0; i < 2; i++) {
      await new Promise(r => setTimeout(r, 3000));
      await loadVideoState();
      // Sadece aynı sekme ve playDone ise tekrar enjekte etme
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
  (async () => {
    try {
      await loadVideoState();

      if (msg && msg.type === 'TASK_START_VIDEO') {
        // Yeni görev başlarken eski state'i temizle (kritik)
        await clearVideoState();
        awaitingVideoTab = { mainTabId: sender.tab.id, timestamp: Date.now() };
        await saveVideoState();

        setTimeout(async () => {
          await loadVideoState();
          if (awaitingVideoTab && Date.now() - awaitingVideoTab.timestamp > 18000) {
            awaitingVideoTab = null;
            await saveVideoState();
          }
        }, 20000);

        sendResponse({ ok: true });
        return;
      }

      if (msg && msg.type === 'CLOSE_VIDEO_TAB') {
        const mainTabId = sender.tab?.id || (currentVideoTab && currentVideoTab.mainTabId) || null;

        if (currentVideoTab && currentVideoTab.videoTabId) {
          closeTabSafe(currentVideoTab.videoTabId, mainTabId);
        }

        // Güçlü fallback: tüm video sekmelerini kapat
        closeAllVideoTabs(mainTabId);
        [800, 1500, 2500].forEach(delay => setTimeout(() => closeAllVideoTabs(mainTabId), delay));

        await clearVideoState();
        sendResponse({ ok: true });
        return;
      }

      if (msg && msg.type === 'PLAY_CLICKED') {
        if (currentVideoTab) {
          currentVideoTab.playDone = true;
          await saveVideoState();
          if (currentVideoTab.mainTabId) {
            chrome.tabs.sendMessage(currentVideoTab.mainTabId, { type: 'PLAY_CLICKED' }).catch(() => {});
          }
        }
        // sender.tab üzerinden de mainTabId bulunamazsa bile playDone işaretlenmiş olur
        sendResponse({ ok: true });
        return;
      }

      // -----------------------------------------------------------------
      // VIDEO_FINISHED — 3 katmanlı kapatma
      // -----------------------------------------------------------------
      if (msg && msg.type === 'VIDEO_FINISHED') {
        const mainTabId = currentVideoTab?.mainTabId || null;
        const senderTabId = sender.tab?.id || null;

        // Katman 1: Mesajı gönderen sekmeyi (sender.tab) öncelikli kapat
        if (senderTabId) {
          closeTabSafe(senderTabId, mainTabId);
        }

        // Katman 2: Bellekte/storage'da kalan currentVideoTab'ı da kapat
        if (currentVideoTab && currentVideoTab.videoTabId && currentVideoTab.videoTabId !== senderTabId) {
          closeTabSafe(currentVideoTab.videoTabId, mainTabId);
        }

        // Katman 3: Tüm video sekmelerini tarayıp kapat (en güçlü güvenlik ağı)
        closeAllVideoTabs(mainTabId);
        [600, 1400].forEach(delay => setTimeout(() => closeAllVideoTabs(mainTabId), delay));

        // Ana sekmeye haber ver
        if (mainTabId) {
          chrome.tabs.sendMessage(mainTabId, { type: 'VIDEO_FINISHED' }).catch(() => {});
        }

        await clearVideoState();
        sendResponse({ ok: true });
        return;
      }

      // -----------------------------------------------------------------
      // VIDEO_FAILED — aynı 3 katmanlı mantık
      // -----------------------------------------------------------------
      if (msg && msg.type === 'VIDEO_FAILED') {
        const mainTabId = currentVideoTab?.mainTabId || null;
        const senderTabId = sender.tab?.id || null;

        if (senderTabId) {
          closeTabSafe(senderTabId, mainTabId);
        }
        if (currentVideoTab && currentVideoTab.videoTabId && currentVideoTab.videoTabId !== senderTabId) {
          closeTabSafe(currentVideoTab.videoTabId, mainTabId);
        }
        closeAllVideoTabs(mainTabId);

        if (mainTabId) {
          chrome.tabs.sendMessage(mainTabId, {
            type: 'VIDEO_FAILED',
            reason: msg.reason || '',
          }).catch(() => {});
        }

        await clearVideoState();
        sendResponse({ ok: true });
        return;
      }

      if (msg && msg.type === 'FORCE_CAPTURE') {
        captureCookies();
        sendResponse({ ok: true });
        return;
      }

      sendResponse({ ok: false, error: 'Unknown message type' });
    } catch (err) {
      try { sendResponse({ ok: false, error: String(err) }); } catch (_) {}
    }
  })();

  return true; // async response için kanalı açık tut
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  await loadVideoState();
  if (currentVideoTab && currentVideoTab.videoTabId === tabId) {
    const mainTabId = currentVideoTab.mainTabId;
    await clearVideoState();
    if (mainTabId) {
      chrome.tabs.sendMessage(mainTabId, { type: 'VIDEO_TAB_CLOSED' }).catch(() => {});
    }
  }
});
