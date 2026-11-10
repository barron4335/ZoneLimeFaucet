// ===========================================================================
// content.js — 8 Aşamalı Görev Akışı + Dinamik Kur + Kripto Değiştirme
// ===========================================================================
const TASK_LIST_REFRESH_MS = 3000;
const VIDEO_WAIT_SECONDS = 15;

// ===========================================================================
// IndexedDB
// ===========================================================================
function lfGetLocalDateStr(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
function lfOpenDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('LimeFaucetDB', 2);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('cookiesStore')) {
        db.createObjectStore('cookiesStore', { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains('tasksStore')) {
        const s = db.createObjectStore('tasksStore', { keyPath: 'id', autoIncrement: true });
        s.createIndex('date', 'date', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function lfSaveCookies(cookies) {
  try {
    const db = await lfOpenDB();
    return new Promise((res, rej) => {
      const tx = db.transaction('cookiesStore', 'readwrite');
      const r = tx.objectStore('cookiesStore').add({ cookies, timestamp: Date.now() });
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  } catch (e) { console.warn('[LF] saveCookies:', e); }
}
async function lfGetLatestCookieRecord() {
  try {
    const db = await lfOpenDB();
    return new Promise((res, rej) => {
      const tx = db.transaction('cookiesStore', 'readonly');
      const r = tx.objectStore('cookiesStore').openCursor(null, 'prev');
      r.onsuccess = (e) => { const c = e.target.result; res(c ? c.value : null); };
      r.onerror = () => rej(r.error);
    });
  } catch (e) { return null; }
}
async function lfSaveTaskRecord(payload) {
  try {
    const db = await lfOpenDB();
    const now = new Date();
    const record = {
      date: lfGetLocalDateStr(now),
      timestamp: now.getTime(),
      taskText: payload.taskText || '',
      points: Number(payload.points) || 0,
      crypto: payload.crypto || '',
      cryptoReward: Number(payload.cryptoReward) || 0,
      completed: !!payload.completed,
      startedAt: payload.startedAt || now.getTime(),
      finishedAt: payload.finishedAt || now.getTime(),
    };
    return new Promise((res, rej) => {
      const tx = db.transaction('tasksStore', 'readwrite');
      const r = tx.objectStore('tasksStore').add(record);
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  } catch (e) { console.warn('[LF] saveTaskRecord:', e); }
}
async function lfGetTaskRecordsByDate(dateStr) {
  try {
    const db = await lfOpenDB();
    return new Promise((res, rej) => {
      const tx = db.transaction('tasksStore', 'readonly');
      const r = tx.objectStore('tasksStore').index('date').getAll(dateStr);
      r.onsuccess = () => res((r.result || []).sort((a, b) => b.timestamp - a.timestamp));
      r.onerror = () => rej(r.error);
    });
  } catch (e) { return []; }
}

// ===========================================================================
// DOM yardımcıları
// ===========================================================================
function lfSleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function lfIsVisible(el) {
  if (!el) return false;
  const s = window.getComputedStyle(el);
  return s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0'
    && el.offsetWidth > 0 && el.offsetHeight > 0;
}
function lfGetElByXPath(xpath, ctx = document) {
  try { return document.evaluate(xpath, ctx, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue; }
  catch (_) { return null; }
}
function lfEsc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// ===========================================================================
// REACT UYUMLU TIKLAMA SİMÜLATÖRÜ
// ===========================================================================
async function lfSimulateClick(el, label) {
  if (!el) { console.warn(`[LF] ${label}: element null`); return false; }

  try { el.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'center' }); } catch (_) {}
  await lfSleep(400);

  const rect = el.getBoundingClientRect();
  const x = rect.left + Math.max(1, rect.width / 2);
  const y = rect.top + Math.max(1, rect.height / 2);
  console.log(`[LF] ${label} → tag=${el.tagName} class="${(el.className || '').slice(0, 60)}" rect=(${Math.round(rect.left)},${Math.round(rect.top)},${Math.round(rect.width)}x${Math.round(rect.height)})`);

  let realTarget = el;
  try {
    const top = document.elementFromPoint(x, y);
    if (top && (top === el || el.contains(top))) realTarget = top;
  } catch (_) {}

  const chain = [];
  let cur = realTarget;
  for (let i = 0; i < 5 && cur; i++) { chain.push(cur); cur = cur.parentElement; }

  const opts = {
    bubbles: true, cancelable: true, composed: true,
    view: window, clientX: x, clientY: y, button: 0, buttons: 1,
  };

  for (const node of chain) {
    try { node.dispatchEvent(new PointerEvent('pointerover', opts)); node.dispatchEvent(new MouseEvent('mouseover', opts)); } catch (_) {}
  }
  for (const node of chain) {
    try { node.dispatchEvent(new PointerEvent('pointerdown', opts)); node.dispatchEvent(new MouseEvent('mousedown', opts)); } catch (_) {}
  }
  try { if (typeof realTarget.focus === 'function') realTarget.focus(); } catch (_) {}
  await lfSleep(50);
  for (const node of chain) {
    try {
      node.dispatchEvent(new PointerEvent('pointerup', { ...opts, buttons: 0 }));
      node.dispatchEvent(new MouseEvent('mouseup', { ...opts, buttons: 0 }));
      node.dispatchEvent(new MouseEvent('click', { ...opts, buttons: 0 }));
    } catch (_) {}
  }
  try { realTarget.click(); } catch (_) {}
  return true;
}

// ===========================================================================
// SHADOW DOM yardımcıları
// ===========================================================================
function lfGetTasksShadowRoot() {
  const host = document.getElementById('youtube-tasks-widget');
  return host && host.shadowRoot ? host.shadowRoot : null;
}
function lfGetTaskListContainer() {
  const sr = lfGetTasksShadowRoot();
  if (!sr) return null;
  return sr.querySelector('#widget-tasks > div:nth-child(2)');
}
function lfGetAllTaskItems() {
  const container = lfGetTaskListContainer();
  if (!container) return [];
  return Array.from(container.children).filter(el =>
    el.classList && el.classList.contains('list-video__item')
  );
}
function lfGetTaskInfo(item) {
  // Puan: ".mark" içinde "15.7 Points" gibi
  let points = 0;
  const markEl =
    item.querySelector('.list-video__info .mark:not(.mark_timer)') ||
    item.querySelector('.list-video__info p.mark') ||
    item.querySelector('.list-video__item-content .mark');
  if (markEl) {
    const m = (markEl.textContent || '').match(/([\d]+(?:[.,]\d+)?)/);
    if (m) points = parseFloat(m[1].replace(',', '.')) || 0;
  }
  // Metin: görev açıklaması
  const textEl =
    item.querySelector('.list-video__item-text') ||
    item.querySelector('.list-video__item-content > p');
  let text = textEl ? (textEl.textContent || '').trim() : '';
  // Fallback: eski selector
  if (!points) {
    const infoEl = item.querySelector('.list-video__item-content > div > p:nth-child(1)');
    const t = infoEl ? (infoEl.textContent || '').trim() : '';
    const m = t.match(/([\d]+(?:[.,]\d+)?)/);
    if (m) points = parseFloat(m[1].replace(',', '.')) || 0;
    if (!text) text = t;
  }
  return { text, points };
}
function lfGetStartButton(item) {
  return item.querySelector(':scope > button') || item.querySelector('button');
}
function lfIsTaskCompleted(item) {
  const btn = lfGetStartButton(item);
  if (!btn) return true;
  if (btn.disabled) return true;
  const label = (btn.getAttribute('aria-label') || btn.textContent || '').trim().toLowerCase();
  return !label.includes('start');
}
function lfGetCurrentCrypto() {
  const panel = document.getElementById('limefaucet-panel');
  const t = panel?.querySelector('.lf-title');
  if (!t) return '';
  const m = t.textContent.match(/Crypto:\s*([A-Z]+)/i);
  return m ? m[1].toUpperCase() : '';
}

// ===========================================================================
// DİNAMİK KUR HESAPLAMA
// ===========================================================================
function lfGetInfoElements() {
  // Eski XPath (yedek)
  const xp1 = '/html/body/div[1]/div[2]/div/main/div/div[3]/div/div[2]/div[2]/span[1]';
  const xp2 = '/html/body/div[1]/div[2]/div/main/div/div[3]/div/div[2]/div[2]/span[3]';
  let el1 = lfGetElByXPath(xp1);
  let el2 = lfGetElByXPath(xp2);

  // REWARD CONVERSION kartından daha güvenilir okuma
  // Örnek metin: "10 Points ≈ 0.00009497 TON"
  if (!el1 || !el2) {
    const all = Array.from(document.querySelectorAll('div, span, p, section'));
    for (const el of all) {
      const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
      // Kısa bloklarda "X Points" ve coin miktarı birlikte
      if (t.length > 200) continue;
      const m = t.match(/([\d]+(?:[.,]\d+)?)\s*Points?\s*[≈~=]\s*([\d]+(?:[.,]\d+)?)/i);
      if (m) {
        // Sahte element gibi kullanmak için data attribute
        el1 = { textContent: m[1] };
        el2 = { textContent: m[2] };
        break;
      }
    }
  }
  return { el1, el2 };
}
function lfParseNumeric(text) {
  if (!text) return 0;
  // Binlik ayırıcıları temizle, ondalık virgülü noktaya çevir
  let s = String(text).trim();
  // "0.00009497" veya "0,00009497"
  const m = s.match(/([\d]+(?:[.,]\d+)?)/);
  if (!m) return 0;
  return parseFloat(m[1].replace(',', '.')) || 0;
}
function lfGetPointToCryptoRate() {
  try {
    const { el1, el2 } = lfGetInfoElements();
    if (!el1 || !el2) return 0;
    const pointsBase = lfParseNumeric(el1.textContent);
    const cryptoBase = lfParseNumeric(el2.textContent);
    if (!pointsBase || !cryptoBase) return 0;
    const rate = cryptoBase / pointsBase;
    // Mantık dışı oranları reddet (çok büyük/küçük)
    if (!isFinite(rate) || rate <= 0 || rate > 1) return 0;
    return rate;
  } catch (_) { return 0; }
}
function lfCalcReward(points) {
  if (!points || points <= 0) return 0;
  const rate = lfGetPointToCryptoRate();
  if (!rate) return 0;
  // 8 ondalığa yuvarla (floating noise azalt)
  return Math.round(points * rate * 1e8) / 1e8;
}

// ===========================================================================
// 1. INIT
// ===========================================================================
(async function init() {
  const url = window.location.href;
  if (url.includes('limefaucet.com') && !url.includes('/youtube')) {
    await lfCaptureCookies();
    window.location.href = 'https://limefaucet.com/youtube';
    return;
  }
  if (url.includes('/youtube')) {
    await lfSleep(2000);
    let initialCrypto = 'TON';
    const rec = await lfGetLatestCookieRecord();
    if (rec && rec.cookies) {
      const c = rec.cookies.find(x => x.name.toLowerCase().includes('crypto'));
      if (c && c.value) initialCrypto = c.value.toUpperCase();
    }
    const detected = lfDetectCrypto();
    if (detected) initialCrypto = detected;
    lfCreatePanel(initialCrypto);
    setInterval(lfRefreshTaskUI, TASK_LIST_REFRESH_MS);
    lfRefreshTaskUI();

    // Sürekli döngü aktifse sayfa yüklendikten sonra otomatik başlat
    try {
      const st = await chrome.storage.local.get(['lfContinuousMode', 'lfRefreshMinutes']);
      if (st && st.lfRefreshMinutes) {
        lfState.refreshMinutes = Number(st.lfRefreshMinutes) || DEFAULT_REFRESH_MIN;
        const sel = document.querySelector('#lf-refresh-minutes');
        if (sel) sel.value = String(lfState.refreshMinutes);
      }
      if (st && st.lfContinuousMode) {
        console.log('[LF] continuousMode kayıtlı → sayfa hazır, görevler başlatılacak');
        lfState.continuousMode = true;
        lfUpdateTaskControls();
        // Widget/görev listesinin yüklenmesi için ek bekleme
        await lfSleep(4000);
        // Görev var mı diye birkaç kez dene
        for (let attempt = 0; attempt < 8; attempt++) {
          if (lfState.stopRequested) break;
          const items = lfGetAllTaskItems();
          const pending = items.filter(el => !lfIsTaskCompleted(el));
          console.log(`[LF] auto-start deneme #${attempt + 1}: ${pending.length} bekleyen görev`);
          if (pending.length > 0) {
            lfStartTaskRunner();
            break;
          }
          await lfSleep(2000);
        }
        // Hiç görev yoksa yine 5 dk sonra yenile
        if (lfState.continuousMode && !lfState.taskRunnerActive && !lfState.stopRequested) {
          console.log('[LF] Görev yok, 5 dk sonra tekrar denenecek');
          lfSchedulePageRefresh();
        }
      }
    } catch (e) {
      console.warn('[LF] continuousMode kontrol hatası:', e);
    }
  }
})();

async function lfCaptureCookies() {
  const cookies = document.cookie.split(';').map(c => {
    const [name, ...rest] = c.trim().split('=');
    return { name, value: rest.join('=') };
  });
  if (cookies.length) await lfSaveCookies(cookies);
}

function lfDetectCrypto() {
  const xp = '/html/body/div[1]/div[2]/div/div/div/div[2]/button/span[2]';
  const cs = '#root > div.min-h-screen.relative.z-10.flex.items-stretch > div > div > div > div.flex-1.flex.justify-center > button > span.font-bold.text-lime-400';
  let el = lfGetElByXPath(xp) || document.querySelector(cs);
  if (el && el.textContent) return el.textContent.trim().toUpperCase();
  return null;
}

// ===========================================================================
// 2. PANEL
// ===========================================================================
function lfCreatePanel(initialCrypto) {
  if (document.getElementById('limefaucet-panel')) return;
  const panel = document.createElement('div');
  panel.id = 'limefaucet-panel';
  panel.innerHTML = `
    <div class="lf-header">
      <span class="lf-title">Crypto: ${initialCrypto}</span>
      <button class="lf-minimize" title="Küçült">—</button>
    </div>
    <div class="lf-body">
      <button class="lf-change-crypto">Crypto Değiştir</button>
      <div class="lf-info-block">
        <div class="lf-info-row"><span class="lf-info-label">Bilgi:</span><span class="lf-info-value" id="lf-info-1">—</span></div>
        <div class="lf-info-row"><span class="lf-info-label">Değer:</span><span class="lf-info-value highlight" id="lf-info-2">—</span></div>
      </div>
      <div class="lf-crypto-list" style="display:none;"></div>
      <div class="lf-refresh-row">
        <label class="lf-refresh-label">Yenileme (dk)</label>
        <select class="lf-refresh-select" id="lf-refresh-minutes">
          <option value="1">1</option>
          <option value="3">3</option>
          <option value="5" selected>5</option>
          <option value="10">10</option>
          <option value="15">15</option>
          <option value="30">30</option>
        </select>
      </div>
      <div class="lf-task-controls">
        <button class="lf-run-tasks">Tüm Görevleri Çalıştır</button>
        <button class="lf-stop-tasks secondary" style="display:none;">Durdur</button>
      </div>
      <div class="lf-countdown-box" id="lf-countdown-container" style="display:none;">
        <div class="lf-countdown-label">Kalan süre</div>
        <div class="lf-countdown-time" id="lf-countdown-time">00:00</div>
        <div class="lf-countdown-task" id="lf-countdown-task"></div>
      </div>
      <div class="lf-task-section">
        <div class="lf-section-title">Görevler</div>
        <div class="lf-task-list" id="lf-task-list"><div class="lf-empty">Yükleniyor...</div></div>
      </div>
      <div class="lf-history-section">
        <div class="lf-section-title">Geçmiş</div>
        <div class="lf-history-controls">
          <input type="date" class="lf-history-date" id="lf-history-date" />
          <button class="lf-history-show">Göster</button>
        </div>
        <div class="lf-history-summary" id="lf-history-summary"></div>
        <div class="lf-history-list" id="lf-history-list"></div>
      </div>
    </div>`;
  document.body.appendChild(panel);
  lfUpdateInfo();
  lfStartInfoPolling(15000);
  lfMakeDraggable(panel);

  const minBtn = panel.querySelector('.lf-minimize');
  const body = panel.querySelector('.lf-body');
  minBtn.addEventListener('click', () => {
    if (body.style.display === 'none') { body.style.display = 'block'; minBtn.textContent = '—'; }
    else { body.style.display = 'none'; minBtn.textContent = '+'; }
  });

  const changeBtn = panel.querySelector('.lf-change-crypto');
  const cryptList = panel.querySelector('.lf-crypto-list');
  changeBtn.addEventListener('click', () => {
    if (cryptList.style.display === 'none') { lfPopulateCryptoList(cryptList); cryptList.style.display = 'block'; }
    else cryptList.style.display = 'none';
  });

  panel.querySelector('.lf-run-tasks').addEventListener('click', lfStartTaskRunner);
  panel.querySelector('.lf-stop-tasks').addEventListener('click', lfStopTaskRunner);

  // Yenileme aralığı (kullanıcı seçimi)
  const refreshSel = panel.querySelector('#lf-refresh-minutes');
  if (refreshSel) {
    try {
      chrome.storage.local.get(['lfRefreshMinutes'], (st) => {
        const m = Number(st && st.lfRefreshMinutes) || DEFAULT_REFRESH_MIN;
        lfState.refreshMinutes = m;
        refreshSel.value = String(m);
      });
    } catch (_) {
      refreshSel.value = String(DEFAULT_REFRESH_MIN);
    }
    refreshSel.addEventListener('change', () => {
      const m = Number(refreshSel.value) || DEFAULT_REFRESH_MIN;
      lfState.refreshMinutes = m;
      try { chrome.storage.local.set({ lfRefreshMinutes: m }); } catch (_) {}
      console.log('[LF] Yenileme aralığı:', m, 'dk');
    });
  }

  const dateInput = panel.querySelector('#lf-history-date');
  dateInput.value = lfGetLocalDateStr();
  panel.querySelector('.lf-history-show').addEventListener('click', () => lfLoadHistory(dateInput.value));
  lfLoadHistory(dateInput.value);
}

function lfPopulateCryptoList(container) {
  const cryptos = ['DOGE','LTC','BCH','DASH','TRX','USDT','BNB','SOL','XRP','POL','ADA','TON','XLM'];
  container.innerHTML = '';
  cryptos.forEach(sym => {
    const btn = document.createElement('button');
    btn.textContent = sym;
    btn.className = 'lf-crypto-btn';
    btn.addEventListener('click', () => lfHandleCryptoSelect(sym));
    container.appendChild(btn);
  });
}

function lfMakeDraggable(el) {
  const header = el.querySelector('.lf-header');
  let dragging = false, ox = 0, oy = 0;
  header.addEventListener('mousedown', (e) => {
    dragging = true;
    ox = e.clientX - el.getBoundingClientRect().left;
    oy = e.clientY - el.getBoundingClientRect().top;
    el.style.transition = 'none';
  });
  document.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    el.style.left = `${e.clientX - ox}px`;
    el.style.top = `${e.clientY - oy}px`;
  });
  document.addEventListener('mouseup', () => { dragging = false; el.style.transition = ''; });
}

// ===========================================================================
// 3. Bilgi alanları
// ===========================================================================
function lfUpdateInfo() {
  try {
    const i1 = document.getElementById('lf-info-1');
    const i2 = document.getElementById('lf-info-2');
    if (!i1 && !i2) return;
    const { el1, el2 } = lfGetInfoElements();
    if (i1) i1.textContent = el1?.textContent?.trim() || '—';
    if (i2) i2.textContent = el2?.textContent?.trim() || '—';
  } catch (e) { console.warn(e); }
}
let lfInfoPollTimer = null;
function lfStartInfoPolling(duration = 15000) {
  if (lfInfoPollTimer) clearInterval(lfInfoPollTimer);
  const start = Date.now();
  lfInfoPollTimer = setInterval(() => {
    lfUpdateInfo();
    if (Date.now() - start > duration) { clearInterval(lfInfoPollTimer); lfInfoPollTimer = null; }
  }, 500);
  lfUpdateInfo();
}

// ===========================================================================
// 4. KRİPTO DEĞİŞTİRME
// ===========================================================================
async function lfHandleCryptoSelect(symbol) {
  console.log(`[LF] === Kripto değiştir: ${symbol} ===`);

  const s1c = '#root > div.min-h-screen.relative.z-10.flex.items-stretch > div > div > div > div.flex-1.flex.justify-center > button > span.text-lime-400\\/60.text-xs';
  const s1cAlt = '#root > div.min-h-screen.relative.z-10.flex.items-stretch > div > div > div > div.flex-1.flex.justify-center > button > span[class*="text-lime-400"]';
  const s1x = '/html/body/div[1]/div[2]/div/div/div/div[2]/button/span[3]';

  let span = null;
  const start = Date.now();
  while (Date.now() - start < 5000) {
    span = document.querySelector(s1c) || document.querySelector(s1cAlt) || lfGetElByXPath(s1x);
    if (span) break;
    await lfSleep(200);
  }
  if (!span) { console.warn('[LF] Crypto span BULUNAMADI'); return; }

  let clickable = span;
  let cur = span;
  for (let i = 0; i < 6 && cur; i++) {
    if (cur.tagName === 'BUTTON' || cur.getAttribute('role') === 'button') {
      clickable = cur;
      break;
    }
    cur = cur.parentElement;
  }

  await lfSimulateClick(clickable, 'Change Button');
  await lfSleep(800);

  const mc = '#root > div.min-h-screen.relative.z-10.flex.items-stretch > div > div > div.fixed.inset-0.z-50.bg-black\\/60.backdrop-blur-sm.flex.items-center.justify-center.p-4 > div';
  const mx = '/html/body/div/div[2]/div/div/div[2]/div';

  let modal = null;
  const ms = Date.now();
  while (Date.now() - ms < 5000) {
    modal = document.querySelector(mc) || lfGetElByXPath(mx);
    if (modal) break;
    await lfSleep(200);
  }

  if (!modal) {
    console.warn('[LF] Modal açılmadı, ikinci deneme...');
    try { span.click(); } catch (_) {}
    await lfSleep(300);
    try { clickable.click(); } catch (_) {}
    await lfSleep(1500);
    modal = document.querySelector(mc) || lfGetElByXPath(mx);
    if (!modal) { console.warn('[LF] Modal hala açılmadı, İPTAL'); return; }
  }

  const allButtons = modal.querySelectorAll('button');
  let targetBtn = null;
  for (const b of allButtons) {
    const txt = (b.textContent || '').trim().toUpperCase();
    if (txt === symbol) { targetBtn = b; break; }
  }

  if (!targetBtn) { console.warn(`[LF] "${symbol}" bulunamadı`); return; }

  await lfSimulateClick(targetBtn, `${symbol} Button`);
  await lfSleep(2500);

  const t = document.querySelector('#limefaucet-panel .lf-title');
  if (t) t.textContent = `Crypto: ${symbol}`;
  console.log(`[LF] ${symbol} seçildi!`);
  // Kur / coin değişti → görev listesi + geçmiş özeti güncelle
  try { lfRefreshTaskUI(); } catch (_) {}
  try {
    const dateInput = document.querySelector('#lf-history-date');
    lfLoadHistory(dateInput ? dateInput.value : lfGetLocalDateStr());
  } catch (_) {}
  try { lfUpdateInfo(); } catch (_) {}
}

// ===========================================================================
// 5. Görev listesi paneli
// ===========================================================================
function lfRefreshTaskUI() {
  const listEl = document.getElementById('lf-task-list');
  if (!listEl) return;
  const tasks = lfGetAllTaskItems();
  if (tasks.length === 0) {
    listEl.innerHTML = '<div class="lf-empty">Görev bulunamadı.</div>';
    return;
  }
  const crypto = lfGetCurrentCrypto() || '?';
  listEl.innerHTML = '';
  tasks.forEach((el, i) => {
    const info = lfGetTaskInfo(el);
    const reward = lfCalcReward(info.points);
    const completed = lfIsTaskCompleted(el);
    const item = document.createElement('div');
    item.className = 'lf-task-item' + (completed ? ' completed' : '');
    item.innerHTML = `
      <div class="lf-task-row">
        <span class="lf-task-num">Görev - ${i + 1}</span>
        <span class="lf-task-text" title="${lfEsc(info.text)}">${lfEsc(info.text || '(puan yok)')}</span>
      </div>
      <div class="lf-task-row">
        <span class="lf-task-reward">≈ ${reward.toFixed(6)} ${lfEsc(crypto)}</span>
        <span class="lf-task-status ${completed ? 'done' : 'pending'}">${completed ? 'Tamamlandı' : 'Bekliyor'}</span>
      </div>`;
    listEl.appendChild(item);
  });
}

function lfUpdateTaskControls() {
  const panel = document.getElementById('limefaucet-panel');
  if (!panel) return;
  const run = panel.querySelector('.lf-run-tasks');
  const stop = panel.querySelector('.lf-stop-tasks');
  if (!run || !stop) return;
  // Döngü aktifken (görev çalışıyor VEYA 5dk bekleniyor) Durdur görünür kalır
  const loopActive = !!(lfState.taskRunnerActive || lfState.continuousMode);
  if (loopActive) {
    run.style.display = 'none';
    stop.style.display = 'block';
  } else {
    run.style.display = 'block';
    stop.style.display = 'none';
  }
}

// ===========================================================================
// 6. GÖREV YÜRÜTÜCÜ — 8 AŞAMA
// ===========================================================================
const DEFAULT_REFRESH_MIN = 5;
const lfState = {
  taskRunnerActive: false,
  stopRequested: false,
  continuousMode: false,
  reloadTimer: null,
  reloadCountdownInterval: null,
  refreshMinutes: DEFAULT_REFRESH_MIN,
};

function lfGetRefreshMs() {
  const m = Number(lfState.refreshMinutes) || DEFAULT_REFRESH_MIN;
  return Math.max(1, m) * 60 * 1000;
}

function lfSetContinuous(enabled) {
  lfState.continuousMode = !!enabled;
  try {
    chrome.storage.local.set({ lfContinuousMode: !!enabled });
  } catch (_) {}
  console.log('[LF] continuousMode =', lfState.continuousMode);
  lfUpdateTaskControls();
}

function lfClearReloadTimer() {
  if (lfState.reloadTimer) {
    clearTimeout(lfState.reloadTimer);
    lfState.reloadTimer = null;
  }
  if (lfState.reloadCountdownInterval) {
    clearInterval(lfState.reloadCountdownInterval);
    lfState.reloadCountdownInterval = null;
  }
}

function lfFormatMMSS(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

function lfSchedulePageRefresh() {
  lfClearReloadTimer();
  if (!lfState.continuousMode || lfState.stopRequested) return;
  const mins = Number(lfState.refreshMinutes) || DEFAULT_REFRESH_MIN;
  let remaining = Math.max(1, mins) * 60; // saniye
  console.log(`[LF] Görev turu bitti. ${mins} dk geri sayım başlıyor (döngü aktif)...`);

  const box = document.getElementById('lf-countdown-container');
  const time = document.getElementById('lf-countdown-time');
  const taskEl = document.getElementById('lf-countdown-task');
  const labelEl = box ? box.querySelector('.lf-countdown-label') : null;

  try {
    if (box && time) {
      box.style.display = 'block';
      time.style.fontSize = '28px';
      time.style.color = '#a3e635';
      time.textContent = lfFormatMMSS(remaining);
      if (labelEl) labelEl.textContent = 'Yenilemeye kalan';
      if (taskEl) taskEl.textContent = 'Durdurmak için Durdur butonuna basın';
    }
  } catch (_) {}

  lfUpdateTaskControls();

  lfState.reloadCountdownInterval = setInterval(() => {
    if (!lfState.continuousMode || lfState.stopRequested) {
      lfClearReloadTimer();
      return;
    }
    remaining--;
    try {
      if (time) time.textContent = lfFormatMMSS(remaining);
    } catch (_) {}

    if (remaining <= 0) {
      lfClearReloadTimer();
      try {
        if (time) {
          time.style.fontSize = '14px';
          time.textContent = 'Sayfa yenileniyor...';
        }
        if (labelEl) labelEl.textContent = 'Bildirim';
        if (taskEl) taskEl.textContent = 'Yeni görevler kontrol edilecek';
      } catch (_) {}
      console.log('[LF] Geri sayım bitti → sayfa yenileniyor');
      // Kısa bildirim sonrası yenile
      setTimeout(() => {
        if (!lfState.continuousMode || lfState.stopRequested) return;
        window.location.reload();
      }, 800);
    }
  }, 1000);
}

async function lfStartTaskRunner() {
  if (lfState.taskRunnerActive) return;
  lfState.taskRunnerActive = true;
  lfState.stopRequested = false;
  lfSetContinuous(true); // Run = sürekli döngü başlat
  lfClearReloadTimer();
  lfUpdateTaskControls();
  try {
    await lfRunAllTasks();
  } catch (e) {
    console.error('[LF] Görev hatası:', e);
  } finally {
    lfState.taskRunnerActive = false;
    lfUpdateTaskControls();
    // Durdurulmadıysa 5 dk sonra yenile
    if (lfState.continuousMode && !lfState.stopRequested) {
      lfSchedulePageRefresh();
    } else {
      lfSetContinuous(false);
      lfClearReloadTimer();
    }
  }
}

function lfStopTaskRunner() {
  console.log('[LF] Durdur istendi — döngü kapatılıyor');
  lfState.stopRequested = true;
  lfSetContinuous(false);
  lfClearReloadTimer();
  lfUpdateTaskControls();
  try { chrome.runtime.sendMessage({ type: 'CLOSE_VIDEO_TAB' }).catch(() => {}); } catch (_) {}
  // Panel bilgisini temizle
  try {
    const box = document.getElementById('lf-countdown-container');
    if (box) box.style.display = 'none';
  } catch (_) {}
}

async function lfScrollPageToBottom() {
  try { window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }); } catch (_) {}
  await lfSleep(1200);
  try { window.scrollTo(0, document.body.scrollHeight); } catch (_) {}
  await lfSleep(800);
}

async function lfScrollShadowToBottom() {
  const sr = lfGetTasksShadowRoot();
  if (!sr) return;
  const scroller = sr.querySelector('.content__container');
  if (scroller) {
    try { scroller.scrollTop = scroller.scrollHeight; } catch (_) {}
    await lfSleep(800);
    try { scroller.scrollTop = scroller.scrollHeight; } catch (_) {}
  }
  await lfSleep(1200);
}

function lfReadAndDisplayTasks() {
  lfRefreshTaskUI();
  return lfGetAllTaskItems();
}

function lfWaitForOpenVideoButton(timeout = 6000) {
  return new Promise((resolve) => {
    const start = Date.now();
    const timer = setInterval(() => {
      if (lfState.stopRequested) { clearInterval(timer); resolve(null); return; }
      const sr = lfGetTasksShadowRoot();
      const candidates = [];
      if (sr) sr.querySelectorAll('button').forEach(b => candidates.push(b));
      document.querySelectorAll('button').forEach(b => candidates.push(b));
      for (const b of candidates) {
        const txt = (b.textContent || '').trim();
        if (/open\s*video/i.test(txt) && lfIsVisible(b)) {
          clearInterval(timer); resolve(b); return;
        }
      }
      if (Date.now() - start > timeout) { clearInterval(timer); resolve(null); }
    }, 200);
  });
}

function lfWaitForPlayClick(timeout = 25000) {
  return new Promise((resolve) => {
    let resolved = false;
    const cleanup = () => {
      if (resolved) return true;
      resolved = true;
      chrome.runtime.onMessage.removeListener(handler);
      clearInterval(checker);
      return false;
    };
    const handler = (msg) => {
      if (msg && msg.type === 'PLAY_CLICKED' && !resolved) {
        if (cleanup()) return;
        resolve('clicked');
      }
    };
    chrome.runtime.onMessage.addListener(handler);
    const start = Date.now();
    const checker = setInterval(() => {
      if (lfState.stopRequested && !resolved) {
        if (cleanup()) return;
        resolve('stopped');
      } else if (Date.now() - start > timeout && !resolved) {
        if (cleanup()) return;
        resolve('timeout');
      }
    }, 300);
  });
}

function lfWaitForVideoFinished(timeout = 30000) {
  return new Promise((resolve) => {
    let resolved = false;
    const cleanup = () => {
      if (resolved) return true;
      resolved = true;
      chrome.runtime.onMessage.removeListener(handler);
      clearInterval(checker);
      return false;
    };
    const handler = (msg) => {
      if (!msg || resolved) return;
      if (msg.type === 'VIDEO_FINISHED') { if (cleanup()) return; resolve('finished'); }
      else if (msg.type === 'VIDEO_FAILED') { if (cleanup()) return; resolve('failed'); }
      else if (msg.type === 'VIDEO_TAB_CLOSED') { if (cleanup()) return; resolve('closed'); }
    };
    chrome.runtime.onMessage.addListener(handler);
    const start = Date.now();
    const checker = setInterval(() => {
      if (lfState.stopRequested && !resolved) {
        if (cleanup()) return;
        resolve('stopped');
      } else if (Date.now() - start > timeout && !resolved) {
        if (cleanup()) return;
        resolve('timeout');
      }
    }, 300);
  });
}

function lfShowCompletionMessage(taskNum, points, cryptoReward, crypto) {
  const box = document.getElementById('lf-countdown-container');
  const time = document.getElementById('lf-countdown-time');
  const taskEl = document.getElementById('lf-countdown-task');
  if (!box || !time) return;
  box.style.display = 'block';
  time.style.fontSize = '12px';
  time.style.color = '#a3e635';
  time.textContent = `Görev - ${taskNum} tamamlandı. ${points} puan kazanıldı. ≈ ${cryptoReward.toFixed(6)} ${crypto} kazanıldı.`;
  if (taskEl) taskEl.textContent = '';
  setTimeout(() => {
    if (box.style.display !== 'none') box.style.display = 'none';
    time.style.fontSize = '';
  }, 4000);
}

async function lfProcessSingleTask(item, index, taskId) {
  const info = lfGetTaskInfo(item);
  const button = lfGetStartButton(item);
  if (!button) return false;

  const startedAt = Date.now();
  const taskNum = index + 1;

  const listEl = document.getElementById('lf-task-list');
  if (listEl && listEl.children[index]) listEl.children[index].classList.add('running');

  // AŞAMA 4: Start tıkla
  try { button.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (_) {}
  await lfSleep(300);
  try { button.click(); } catch (_) {}
  console.log(`[LF] Aşama 4 - Görev #${taskNum} Start tıklandı`);

  if (lfState.stopRequested) {
    if (listEl && listEl.children[index]) listEl.children[index].classList.remove('running');
    return false;
  }

  const openBtn = await lfWaitForOpenVideoButton(6000);
  if (!openBtn) {
    console.warn(`[LF] Görev #${taskNum}: "Open video" bulunamadı`);
    await lfSaveTaskRecord({
      taskText: info.text, points: info.points,
      crypto: lfGetCurrentCrypto(), cryptoReward: 0,
      completed: false, startedAt, finishedAt: Date.now(),
    });
    if (listEl && listEl.children[index]) listEl.children[index].classList.remove('running');
    return false;
  }

  try { await chrome.runtime.sendMessage({ type: 'TASK_START_VIDEO' }); } catch (_) {}
  try { openBtn.click(); } catch (_) {}
  console.log(`[LF] Aşama 4 - "Open video" tıklandı`);

  console.log(`[LF] Aşama 5-6 - Yeni sekme bekleniyor`);
  const playResult = await lfWaitForPlayClick(25000);

  if (playResult === 'stopped') {
    console.warn(`[LF] Görev #${taskNum}: durduruldu (play aşaması)`);
    try { await chrome.runtime.sendMessage({ type: 'CLOSE_VIDEO_TAB' }); } catch (_) {}
    if (listEl && listEl.children[index]) listEl.children[index].classList.remove('running');
    return false;
  }
  if (playResult === 'timeout') {
    console.warn(`[LF] Görev #${taskNum}: play sinyali gelmedi`);
    try { await chrome.runtime.sendMessage({ type: 'CLOSE_VIDEO_TAB' }); } catch (_) {}
    await lfSaveTaskRecord({
      taskText: info.text, points: info.points,
      crypto: lfGetCurrentCrypto(), cryptoReward: 0,
      completed: false, startedAt, finishedAt: Date.now(),
    });
    if (listEl && listEl.children[index]) listEl.children[index].classList.remove('running');
    return false;
  }

  console.log(`[LF] Aşama 7 - Yeni sekmede countdown başladı, bekleniyor`);
  const finishResult = await lfWaitForVideoFinished(30000);

  if (finishResult === 'stopped') {
    console.warn(`[LF] Görev #${taskNum}: durduruldu (countdown aşaması)`);
    try { await chrome.runtime.sendMessage({ type: 'CLOSE_VIDEO_TAB' }); } catch (_) {}
    if (listEl && listEl.children[index]) listEl.children[index].classList.remove('running');
    return false;
  }
  if (finishResult === 'failed' || finishResult === 'timeout') {
    console.warn(`[LF] Görev #${taskNum}: video tamamlanamadı (${finishResult})`);
    try { await chrome.runtime.sendMessage({ type: 'CLOSE_VIDEO_TAB' }); } catch (_) {}
    await lfSaveTaskRecord({
      taskText: info.text, points: info.points,
      crypto: lfGetCurrentCrypto(), cryptoReward: 0,
      completed: false, startedAt, finishedAt: Date.now(),
    });
    if (listEl && listEl.children[index]) listEl.children[index].classList.remove('running');
    return false;
  }

  // AŞAMA 8: Başarılı — kayıt + sıradaki göreve geç
  console.log(`[LF] Aşama 8 - Video bitti (${finishResult}), görev tamamlandı`);

  const crypto = lfGetCurrentCrypto();
  const cryptoReward = lfCalcReward(info.points);
  lfShowCompletionMessage(taskNum, info.points, cryptoReward, crypto);

  await lfSaveTaskRecord({
    taskText: info.text, points: info.points,
    crypto, cryptoReward,
    completed: true, startedAt, finishedAt: Date.now(),
  });

  if (listEl && listEl.children[index]) {
    listEl.children[index].classList.remove('running');
    listEl.children[index].classList.add('completed');
    const st = listEl.children[index].querySelector('.lf-task-status');
    if (st) { st.textContent = 'Tamamlandı'; st.className = 'lf-task-status done'; }
  }
  lfLoadHistory(lfGetLocalDateStr());
  return true;
}

async function lfRunAllTasks() {
  console.log('[LF] Aşama 1 - Sayfa aşağı kaydırılıyor');
  await lfScrollPageToBottom();

  console.log('[LF] Aşama 2 - Shadow root içi kaydırılıyor');
  await lfScrollShadowToBottom();

  console.log('[LF] Aşama 3 - Görevler okunuyor');
  const items = lfReadAndDisplayTasks();
  if (items.length === 0) { console.warn('[LF] Görev bulunamadı.'); return; }

  const taskIds = items.map(el => el.getAttribute('data-task-id') || '').filter(Boolean);
  for (let i = 0; i < taskIds.length; i++) {
    if (lfState.stopRequested) break;
    const id = taskIds[i];
    const freshItems = lfGetAllTaskItems();
    const item = freshItems.find(el => el.getAttribute('data-task-id') === id);
    if (!item) { console.warn(`[LF] Görev ${id} kayboldu, atlanıyor`); continue; }
    if (lfIsTaskCompleted(item)) { console.log(`[LF] Görev ${id} zaten tamamlandı, atlanıyor`); continue; }
    await lfProcessSingleTask(item, i, id);
    await lfSleep(1000);
  }
  lfRefreshTaskUI();
}

// ===========================================================================
// 7. Geçmiş
// ===========================================================================
async function lfLoadHistory(dateStr) {
  const listEl = document.getElementById('lf-history-list');
  const sumEl = document.getElementById('lf-history-summary');
  if (!listEl || !sumEl) return;
  try {
    const records = await lfGetTaskRecordsByDate(dateStr);
    if (!records || records.length === 0) {
      sumEl.textContent = 'Bu tarihte kayıt yok.';
      listEl.innerHTML = '';
      return;
    }
    const doneRecords = records.filter(r => r.completed);
    const failRecords = records.filter(r => !r.completed);
    const done = doneRecords.length;
    const fail = failRecords.length;
    // Puan: tüm kayıtlardan (bilgi amaçlı) + sadece başarılı
    const totalPAll = records.reduce((s, r) => s + (Number(r.points) || 0), 0);
    const totalPDone = doneRecords.reduce((s, r) => s + (Number(r.points) || 0), 0);
    // Coin: SADECE başarılı görevlerin kayıtlı ödülü (orijinal coin ile)
    const totalCStored = doneRecords.reduce((s, r) => s + (Number(r.cryptoReward) || 0), 0);
    // Güncel seçili coin + güncel kur ile yeniden hesap
    const currentCrypto = lfGetCurrentCrypto() || '';
    const rate = lfGetPointToCryptoRate();
    const totalCRecalc = rate ? Math.round(totalPDone * rate * 1e8) / 1e8 : 0;
    // Özet satırında HER ZAMAN güncel coin adını kullan (POL seçildiyse POL yazar)
    const cryptoLabel = currentCrypto || doneRecords.find(r => r.crypto)?.crypto || records.find(r => r.crypto)?.crypto || '';
    const totalC = totalCRecalc || totalCStored;
    sumEl.textContent = `${records.length} görev (${done} başarılı, ${fail} başarısız) · ${totalPDone.toFixed(1)} P · ≈ ${totalC.toFixed(8)} ${cryptoLabel}`;
    listEl.innerHTML = '';
    records.forEach(r => {
      const dt = new Date(r.timestamp);
      const item = document.createElement('div');
      item.className = 'lf-history-item' + (r.completed ? '' : ' failed');
      item.innerHTML = `
        <div class="lf-history-row">
          <span class="lf-history-time">${dt.toLocaleDateString('tr-TR')} ${dt.toLocaleTimeString('tr-TR')}</span>
          <span class="lf-history-status ${r.completed ? 'done' : 'fail'}">${r.completed ? '✓' : '✗'}</span>
        </div>
        <div class="lf-history-row"><span class="lf-history-text">${lfEsc(r.taskText || '(metin yok)')}</span></div>
        <div class="lf-history-row">
          <span class="lf-history-points">${r.points} P</span>
          <span class="lf-history-reward">≈ ${r.cryptoReward.toFixed(6)} ${lfEsc(r.crypto || '')}</span>
        </div>`;
      listEl.appendChild(item);
    });
  } catch (e) {
    sumEl.textContent = 'Yükleme hatası.';
    listEl.innerHTML = '';
  }
}

// ===========================================================================
// 8. Mesaj dinleyici
// ===========================================================================
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  try {
    if (msg.type === 'GET_PANEL_STATE') {
      sendResponse({ crypto: lfGetCurrentCrypto() || null });
      return true;
    }
    if (msg.type === 'GET_INFO_STATE') {
      const { el1, el2 } = lfGetInfoElements();
      sendResponse({ info1: el1?.textContent?.trim() || '', info2: el2?.textContent?.trim() || '' });
      return true;
    }
    if (msg.type === 'GET_DB_STATE') {
      lfGetLatestCookieRecord().then(r => sendResponse({ record: r })).catch(() => sendResponse({ record: null }));
      return true;
    }
    if (msg.type === 'CAPTURE_COOKIES') {
      (async () => {
        try { await lfCaptureCookies(); sendResponse({ ok: true }); }
        catch (e) { sendResponse({ ok: false, error: String(e) }); }
      })();
      return true;
    }
    if (msg.type === 'CLEAR_DB') {
      (async () => {
        try {
          const db = await lfOpenDB();
          const tx = db.transaction(['cookiesStore', 'tasksStore'], 'readwrite');
          tx.objectStore('cookiesStore').clear();
          tx.objectStore('tasksStore').clear();
          tx.oncomplete = () => sendResponse({ ok: true });
          tx.onerror = () => sendResponse({ ok: false, error: String(tx.error) });
        } catch (e) {
          sendResponse({ ok: false, error: String(e) });
        }
      })();
      return true;
    }
    if (msg.type === 'RUN_TASKS') { lfStartTaskRunner(); sendResponse({ ok: true }); return true; }
    if (msg.type === 'STOP_TASKS') {
      lfStopTaskRunner();
      sendResponse({ ok: true });
      return true;
    }
    if (msg.type === 'PLAY_CLICKED') { sendResponse({ ok: true }); return true; }
    sendResponse({ ok: false });
    return true;
  } catch (e) {
    try { sendResponse({ ok: false, error: String(e) }); } catch (_) {}
    return true;
  }
});

// ===========================================================================
// 9. postMessage dinleyicisi — MAIN world'deki video-content.js'ten gelir
// ===========================================================================
console.log('[LF] postMessage dinleyicisi kuruldu (source: LF_VIDEO bekleniyor)');
window.addEventListener('message', (ev) => {
  // Her postMessage'ı logla (debug için)
  if (ev.data && ev.data.source) {
    console.log('[LF] postMessage alındı → source:', ev.data.source, '| type:', ev.data.type);
  }

  if (!ev.data || ev.data.source !== 'LF_VIDEO') return;
  const t = ev.data.type;
  console.log('[LF] LF_VIDEO mesajı yakalandı:', t);

  if (t === 'PLAY_CLICKED' || t === 'VIDEO_FINISHED' || t === 'VIDEO_FAILED') {
    try {
      chrome.runtime.sendMessage({ type: t, reason: ev.data.reason || '' })
        .then(() => console.log('[LF] background\'a iletildi:', t))
        .catch((err) => console.warn('[LF] background\'a iletim hatası:', err));
    } catch (err) {
      console.warn('[LF] sendMessage throw:', err);
    }
  }
});
