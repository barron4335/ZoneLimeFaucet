// ===========================================================================
// content.js — 8 Aşamalı Görev Akışı + Dinamik Kur + Kripto Değiştirme
// ===========================================================================
const TASK_LIST_REFRESH_MS = 3000;
const VIDEO_WAIT_SECONDS = 15;

let lfVideoWaitResolver = null; // Video bitişini bekleyen kilit (Promise)

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

// ===========================================================================
// REACT UYUMLU TIKLAMA SİMÜLATÖRÜ
// ===========================================================================
async function lfSimulateClick(el, label) {
  if (!el) { console.warn(`[LF] ${label}: element null`); return false; }
  try { el.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'center' }); } catch (_) {}
  await lfSleep(300);
  const rect = el.getBoundingClientRect();
  const x = rect.left + Math.max(1, rect.width / 2);
  const y = rect.top + Math.max(1, rect.height / 2);
  const opts = { bubbles: true, cancelable: true, composed: true, view: window, clientX: x, clientY: y, button: 0, buttons: 1 };
  try { el.focus(); } catch (_) {}
  try { el.dispatchEvent(new PointerEvent('pointerdown', opts)); } catch (_) {}
  try { el.dispatchEvent(new MouseEvent('mousedown', opts)); } catch (_) {}
  await lfSleep(50);
  try { el.dispatchEvent(new PointerEvent('pointerup', { ...opts, buttons: 0 })); } catch (_) {}
  try { el.dispatchEvent(new MouseEvent('mouseup', { ...opts, buttons: 0 })); } catch (_) {}
  try { el.click(); } catch (_) {}
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
  let points = 0;
  const markEl = item.querySelector('.list-video__info .mark:not(.mark_timer)') || item.querySelector('.list-video__info p.mark:not(.mark_timer)') || item.querySelector('.list-video__item-content .mark:not(.mark_timer)');
  if (markEl) {
    const m = (markEl.textContent || '').match(/([\d]+(?:[.,]\d+)?)/);
    if (m) points = parseFloat(m[1].replace(',', '.')) || 0;
  }
  const textEl = item.querySelector('.list-video__item-text') || item.querySelector('.list-video__item-content > p');
  let text = textEl ? (textEl.textContent || '').trim() : '';
  if (!points) {
    const infoEl = item.querySelector('.list-video__item-content > div > p:nth-child(1)');
    const t = infoEl ? (infoEl.textContent || '').trim() : '';
    const m = t.match(/([\d]+(?:[.,]\d+)?)/);
    if (m) points = parseFloat(m[1].replace(',', '.')) || 0;
    if (!text) text = t;
  }
  let seconds = 0;
  const timerEl = item.querySelector('p.mark.mark_timer') || item.querySelector('.mark.mark_timer') || item.querySelector('.mark_timer') || item.querySelector('.icon-clock') || item.querySelector('[class*="mark_timer"]');
  if (timerEl) {
    const tm = (timerEl.textContent || '').match(/(\d+)\s*sec/i) || (timerEl.textContent || '').match(/(\d+)/);
    if (tm) seconds = parseInt(tm[1], 10) || 0;
  }
  if (!seconds) {
    const allText = (item.textContent || '');
    const tm2 = allText.match(/(\d+)\s*sec/i);
    if (tm2) seconds = parseInt(tm2[1], 10) || 0;
  }
  if (!seconds || seconds < 5) seconds = 60;
  if (seconds > 300) seconds = 300;
  return { text, points, seconds };
}
function lfGetStartButton(item) {
  return item.querySelector(':scope > button') || item.querySelector('button');
}
function lfGetCheckButton(item) {
  const buttons = item.querySelectorAll('button');
  for (const b of buttons) {
    const t = (b.textContent || b.getAttribute('aria-label') || '').trim().toLowerCase();
    if (/check|verify|confirm|kontrol|doğrula/.test(t)) return b;
  }
  for (const b of buttons) {
    const t = (b.textContent || '').trim().toLowerCase();
    if (t && !t.includes('start') && !t.includes('completed') && !t.includes('tamam')) {
      if (lfIsVisible(b)) return b;
    }
  }
  return null;
}
async function lfWaitAndClickCheck(item, timeout = 12000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (lfState.stopRequested) return false;
    const btn = lfGetCheckButton(item);
    if (btn && lfIsVisible(btn)) {
      try { btn.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (_) {}
      await lfSleep(300);
      try { btn.click(); } catch (_) {}
      console.log('[LF] Check butonu tıklandı:', (btn.textContent || '').trim());
      return true;
    }
    await lfSleep(500);
  }
  console.warn('[LF] Check butonu bulunamadı (timeout)');
  return false;
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
  const xp1 = '/html/body/div[1]/div[2]/div/main/div/div[3]/div/div[2]/div[2]/span[1]';
  const xp2 = '/html/body/div[1]/div[2]/div/main/div/div[3]/div/div[2]/div[2]/span[3]';
  let el1 = lfGetElByXPath(xp1);
  let el2 = lfGetElByXPath(xp2);
  if (!el1 || !el2) {
    const all = Array.from(document.querySelectorAll('div, span, p, section'));
    for (const el of all) {
      const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (t.length > 200) continue;
      const m = t.match(/([\d]+(?:[.,]\d+)?)\s*Points?\s*[≈~=]\s*([\d]+(?:[.,]\d+)?)/i);
      if (m) {
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
  let s = String(text).trim();
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
    if (!isFinite(rate) || rate <= 0 || rate > 1) return 0;
    return rate;
  } catch (_) { return 0; }
}
function lfCalcReward(points) {
  if (!points || points <= 0) return 0;
  const rate = lfGetPointToCryptoRate();
  if (!rate) return 0;
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

    try {
      const st = await chrome.storage.local.get(['lfContinuousMode', 'lfRefreshMinutes']);
      if (st && st.lfRefreshMinutes) {
        lfState.refreshMinutes = Number(st.lfRefreshMinutes) || DEFAULT_REFRESH_MIN;
        const sel = document.querySelector('#lf-refresh-minutes');
        if (sel) sel.value = String(lfState.refreshMinutes);
      }
      if (st && st.lfContinuousMode) {
        lfState.continuousMode = true;
        lfUpdateTaskControls();
        await lfSleep(4000);
        for (let attempt = 0; attempt < 8; attempt++) {
          if (lfState.stopRequested) break;
          const items = lfGetAllTaskItems();
          const pending = items.filter(el => !lfIsTaskCompleted(el));
          if (pending.length > 0) {
            lfStartTaskRunner();
            break;
          }
          await lfSleep(2000);
        }
        if (lfState.continuousMode && !lfState.taskRunnerActive && !lfState.stopRequested) {
          lfSchedulePageRefresh();
        }
      }
    } catch (e) {}
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
          <option value="1">1</option><option value="3">3</option><option value="5" selected>5</option>
          <option value="10">10</option><option value="15">15</option><option value="30">30</option>
        </select>
      </div>
      <div class="lf-task-controls">
        <button class="lf-run-tasks">Tüm Görevleri Çalıştır</button>
        <button class="lf-stop-tasks secondary" style="display:none;">Durdur</button>
      </div>
      <div class="lf-countdown-box" id="lf-countdown-container" style="display:none;">
        <div class="lf-countdown-label">Durum</div>
        <div class="lf-countdown-time" id="lf-countdown-time" style="font-size: 16px; margin: 10px 0;">Video sekmesinde izleniyor...</div>
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

  const refreshSel = panel.querySelector('#lf-refresh-minutes');
  if (refreshSel) {
    try {
      chrome.storage.local.get(['lfRefreshMinutes'], (st) => {
        const m = Number(st && st.lfRefreshMinutes) || DEFAULT_REFRESH_MIN;
        lfState.refreshMinutes = m;
        refreshSel.value = String(m);
      });
    } catch (_) { refreshSel.value = String(DEFAULT_REFRESH_MIN); }
    refreshSel.addEventListener('change', () => {
      const m = Number(refreshSel.value) || DEFAULT_REFRESH_MIN;
      lfState.refreshMinutes = m;
      try { chrome.storage.local.set({ lfRefreshMinutes: m }); } catch (_) {}
    });
  }

  const dateInput = panel.querySelector('#lf-history-date');
  dateInput.value = lfGetLocalDateStr();
  panel.querySelector('.lf-history-show').addEventListener('click', () => lfLoadHistory(dateInput.value));
  lfLoadHistory(dateInput.value);
}

function lfPopulateCryptoList(container) {
  const cryptos = ['DOGE','LTC','BCH','DASH','TRX','USDT','BNB','SOL','XRP','POL','ADA','TON','XLM'];
  container.replaceChildren();
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
  } catch (e) {}
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
  if (!span) return;

  let clickable = span;
  let cur = span;
  for (let i = 0; i < 6 && cur; i++) {
    if (cur.tagName === 'BUTTON' || cur.getAttribute('role') === 'button') { clickable = cur; break; }
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
    try { span.click(); } catch (_) {}
    await lfSleep(300);
    try { clickable.click(); } catch (_) {}
    await lfSleep(1500);
    modal = document.querySelector(mc) || lfGetElByXPath(mx);
    if (!modal) return;
  }

  const allButtons = modal.querySelectorAll('button');
  let targetBtn = null;
  for (const b of allButtons) {
    const txt = (b.textContent || '').trim().toUpperCase();
    if (txt === symbol) { targetBtn = b; break; }
  }

  if (!targetBtn) return;
  await lfSimulateClick(targetBtn, `${symbol} Button`);
  await lfSleep(2500);

  const t = document.querySelector('#limefaucet-panel .lf-title');
  if (t) t.textContent = `Crypto: ${symbol}`;
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
    listEl.replaceChildren();
    const emptyDiv = document.createElement('div');
    emptyDiv.className = 'lf-empty';
    emptyDiv.textContent = 'Görev bulunamadı.';
    listEl.appendChild(emptyDiv);
    return;
  }
  
  const crypto = lfGetCurrentCrypto() || '?';
  listEl.replaceChildren();
  
  tasks.forEach((el, i) => {
    const info = lfGetTaskInfo(el);
    const reward = lfCalcReward(info.points);
    const completed = lfIsTaskCompleted(el);
    
    const item = document.createElement('div');
    item.className = 'lf-task-item' + (completed ? ' completed' : '');

    const row1 = document.createElement('div');
    row1.className = 'lf-task-row';
    const numSpan = document.createElement('span');
    numSpan.className = 'lf-task-num';
    numSpan.textContent = `Görev - ${i + 1}`;
    const textSpan = document.createElement('span');
    textSpan.className = 'lf-task-text';
    textSpan.title = info.text;
    textSpan.textContent = info.text || '(puan yok)';
    row1.appendChild(numSpan);
    row1.appendChild(textSpan);

    const row2 = document.createElement('div');
    row2.className = 'lf-task-row';
    const rewardSpan = document.createElement('span');
    rewardSpan.className = 'lf-task-reward';
    rewardSpan.textContent = `≈ ${reward.toFixed(6)} ${crypto}`;
    const statusSpan = document.createElement('span');
    statusSpan.className = 'lf-task-status ' + (completed ? 'done' : 'pending');
    statusSpan.textContent = completed ? 'Tamamlandı' : 'Bekliyor';
    row2.appendChild(rewardSpan);
    row2.appendChild(statusSpan);

    item.appendChild(row1);
    item.appendChild(row2);
    listEl.appendChild(item);
  });
}

function lfUpdateTaskControls() {
  const panel = document.getElementById('limefaucet-panel');
  if (!panel) return;
  const run = panel.querySelector('.lf-run-tasks');
  const stop = panel.querySelector('.lf-stop-tasks');
  if (!run || !stop) return;
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
// 6. GÖREV YÜRÜTÜCÜ
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

function lfSetContinuous(enabled) {
  lfState.continuousMode = !!enabled;
  try { chrome.storage.local.set({ lfContinuousMode: !!enabled }); } catch (_) {}
  lfUpdateTaskControls();
}

function lfClearReloadTimer() {
  if (lfState.reloadTimer) { clearTimeout(lfState.reloadTimer); lfState.reloadTimer = null; }
  if (lfState.reloadCountdownInterval) { clearInterval(lfState.reloadCountdownInterval); lfState.reloadCountdownInterval = null; }
  const overlay = document.getElementById('lf-fullscreen-overlay');
  if (overlay) overlay.style.display = 'none';
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
  let remaining = Math.max(1, mins) * 60;
  console.log(`[LF] Görev turu bitti. ${mins} dk TAM EKRAN geri sayım başlıyor...`);

  let overlay = document.getElementById('lf-fullscreen-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'lf-fullscreen-overlay';
    overlay.style.cssText = `position: fixed !important; top: 0 !important; left: 0 !important; width: 100vw !important; height: 100vh !important; background-color: #0b1f0e !important; z-index: 999999 !important; display: flex !important; flex-direction: column !important; justify-content: center !important; align-items: center !important; pointer-events: none !important;`;

    const label = document.createElement('div');
    label.id = 'lf-fs-label';
    label.textContent = 'YENİ GÖREVLER İÇİN YENİLEMEYE KALAN';
    label.style.cssText = `font-family: system-ui, sans-serif !important; font-size: 16px !important; letter-spacing: 3px !important; color: #4ade80 !important; margin-bottom: 20px !important;`;

    const timer = document.createElement('div');
    timer.id = 'lf-fs-timer';
    timer.style.cssText = `font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace !important; font-size: 90px !important; font-weight: bold !important; color: #39ff14 !important; text-shadow: 0 0 10px #39ff14, 0 0 20px #39ff14, 0 0 40px #39ff14, 0 0 80px #39ff14 !important;`;

    const task = document.createElement('div');
    task.id = 'lf-fs-task';
    task.textContent = 'Durdurmak için panelden "Durdur" butonuna basın';
    task.style.cssText = `font-family: system-ui, sans-serif !important; font-size: 14px !important; color: #86efac !important; margin-top: 30px !important;`;

    overlay.appendChild(label); overlay.appendChild(timer); overlay.appendChild(task);
    document.body.appendChild(overlay);
  } else {
    overlay.style.display = 'flex';
    const label = document.getElementById('lf-fs-label');
    if (label) label.textContent = 'YENİ GÖREVLER İÇİN YENİLEMEYE KALAN';
    const timer = document.getElementById('lf-fs-timer');
    if (timer) timer.textContent = lfFormatMMSS(remaining);
    const task = document.getElementById('lf-fs-task');
    if (task) task.textContent = 'Durdurmak için panelden "Durdur" butonuna basın';
  }

  lfUpdateTaskControls();

  lfState.reloadCountdownInterval = setInterval(() => {
    if (!lfState.continuousMode || lfState.stopRequested) {
      lfClearReloadTimer();
      return;
    }
    remaining--;
    const timer = document.getElementById('lf-fs-timer');
    if (timer) timer.textContent = lfFormatMMSS(remaining);

    if (remaining <= 0) {
      lfClearReloadTimer();
      const label = document.getElementById('lf-fs-label');
      const task = document.getElementById('lf-fs-task');
      if (label) label.textContent = 'YENİLENİYOR';
      if (timer) { timer.textContent = '00:00'; timer.style.fontSize = '60px'; }
      if (task) task.textContent = 'Lütfen bekleyin, sayfa yenileniyor...';
      
      setTimeout(() => {
        if (lfState.continuousMode && !lfState.stopRequested) window.location.reload();
      }, 1500);
    }
  }, 1000);
}

async function lfStartTaskRunner() {
  if (lfState.taskRunnerActive) return;
  lfState.taskRunnerActive = true;
  lfState.stopRequested = false;
  lfSetContinuous(true);
  lfClearReloadTimer();
  lfUpdateTaskControls();
  try {
    await lfRunAllTasks();
  } catch (e) {
    console.error('[LF] Görev hatası:', e);
  } finally {
    lfState.taskRunnerActive = false;
    lfUpdateTaskControls();
    if (lfState.continuousMode && !lfState.stopRequested) {
      lfSchedulePageRefresh();
    } else {
      lfSetContinuous(false);
      lfClearReloadTimer();
    }
  }
}

function lfStopTaskRunner() {
  lfState.stopRequested = true;
  lfSetContinuous(false);
  lfClearReloadTimer();
  lfUpdateTaskControls();
  
  // Eğer video bitişini bekliyorsak, beklemeyi iptal et
  if (lfVideoWaitResolver) {
    lfVideoWaitResolver('stopped');
    lfVideoWaitResolver = null;
  }
  
  try { chrome.runtime.sendMessage({ type: 'CLOSE_VIDEO_TAB' }).catch(() => {}); } catch (_) {}
  try { const box = document.getElementById('lf-countdown-container'); if (box) box.style.display = 'none'; } catch (_) {}
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

  const stableId = taskId || item.getAttribute('data-lf-id') || ('lf-' + taskNum + '-' + Date.now());
  try { item.setAttribute('data-lf-id', stableId); } catch (_) {}

  const listEl = document.getElementById('lf-task-list');
  if (listEl && listEl.children[index]) listEl.children[index].classList.add('running');

  // AŞAMA 4: Start tıkla
  try { button.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (_) {}
  await lfSleep(300);
  try { await lfSimulateClick(button, 'Start'); } catch (_) {}
  console.log(`[LF] Aşama 4 - Görev #${taskNum} Start tıklandı (id=${stableId})`);

  if (lfState.stopRequested) {
    if (listEl && listEl.children[index]) listEl.children[index].classList.remove('running');
    return false;
  }

  const openBtn = await lfWaitForOpenVideoButton(8000);
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

  const watchSeconds = info.seconds || 60;
  try {
    await chrome.storage.local.set({ lfVideoSeconds: watchSeconds, lfVideoTaskNum: taskNum });
    try { localStorage.setItem('lfVideoSeconds', String(watchSeconds)); } catch (_) {}
  } catch (e) {}

  try { await chrome.runtime.sendMessage({ type: 'TASK_START_VIDEO', seconds: watchSeconds }); } catch (_) {}
  await lfSleep(300);
  
  // Open Video tıkla
  try { await lfSimulateClick(openBtn, 'OpenVideo'); } catch (_) {}
  console.log(`[LF] Aşama 4 - Open video (süre: ${watchSeconds}s)`);

  // ANA DEĞİŞİKLİK: Arka planda saymak yerine video sekmesinden gelecek sinyali bekle
  console.log(`[LF] Aşama 5-7 - Video sekmesinin bitmesi bekleniyor (Süre: ${watchSeconds}s)...`);
  
  try {
    const box = document.getElementById('lf-countdown-container');
    if (box) box.style.display = 'block';
    const time = document.getElementById('lf-countdown-time');
    if (time) time.textContent = `Video sekmesinde izleniyor (${watchSeconds}s)...`;
  } catch(_) {}

  const cdResult = await new Promise((resolve) => {
    lfVideoWaitResolver = resolve;
    // Emniyet kemeri: Video süresi + 30 saniye sonra hala sinyal gelmezse zaman aşımı
    setTimeout(() => {
      if (lfVideoWaitResolver === resolve) {
        lfVideoWaitResolver = null;
        resolve('timeout');
      }
    }, (watchSeconds + 30) * 1000);
  });

  try { const box = document.getElementById('lf-countdown-container'); if (box) box.style.display = 'none'; } catch(_) {}

  if (cdResult === 'stopped' || lfState.stopRequested) {
    try { await chrome.runtime.sendMessage({ type: 'CLOSE_VIDEO_TAB' }); } catch (_) {}
    if (listEl && listEl.children[index]) listEl.children[index].classList.remove('running');
    return false;
  }

  if (cdResult === 'failed' || cdResult === 'timeout' || cdResult === 'closed') {
    console.warn(`[LF] Video başarısız veya sekme kapatıldı. (Sonuç: ${cdResult})`);
    await lfSaveTaskRecord({
      taskText: info.text, points: info.points,
      crypto: lfGetCurrentCrypto(), cryptoReward: 0,
      completed: false, startedAt, finishedAt: Date.now(),
    });
    if (listEl && listEl.children[index]) listEl.children[index].classList.remove('running');
    return false;
  }

  // Süre bitti → tüm video sekmelerini kapat (Background zaten kapatıyor ama emniyet için)
  console.log(`[LF] Aşama 8 - Süre bitti, Check butonuna geçiliyor`);
  try { await chrome.runtime.sendMessage({ type: 'CLOSE_VIDEO_TAB' }); } catch (_) {}
  
  // Mises'in sekmeyi kapatması veya site UI'ının güncellenmesi için kısa bekleme
  await lfSleep(2500); 

  let freshItem = item;
  try {
    const freshItems = lfGetAllTaskItems();
    let found = freshItems.find(el =>
      (el.getAttribute('data-lf-id') || '') === stableId ||
      (el.getAttribute('data-task-id') || '') === stableId ||
      (taskId && (el.getAttribute('data-task-id') || '') === taskId)
    );
    if (!found && freshItems[index]) found = freshItems[index];
    if (!found && info.text) {
      found = freshItems.find(el => {
        const ti = lfGetTaskInfo(el);
        return ti.text && info.text && ti.text.slice(0, 40) === info.text.slice(0, 40);
      });
    }
    if (found) {
      freshItem = found;
      try { freshItem.setAttribute('data-lf-id', stableId); } catch (_) {}
    }
  } catch (_) {}

  const checkOk = await lfWaitAndClickCheck(freshItem, 18000);
  if (checkOk) await lfSleep(1500);

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

  const taskMeta = items.map((el, idx) => {
    let id = el.getAttribute('data-task-id') || el.getAttribute('data-lf-id') || '';
    if (!id) {
      id = 'lf-auto-' + idx + '-' + Date.now();
      try { el.setAttribute('data-lf-id', id); } catch (_) {}
    }
    return { id, index: idx };
  });

  console.log('[LF] İşlenecek görev sayısı:', taskMeta.length);

  for (let i = 0; i < taskMeta.length; i++) {
    if (lfState.stopRequested) break;
    const { id, index } = taskMeta[i];
    const freshItems = lfGetAllTaskItems();
    let item = freshItems.find(el =>
      (el.getAttribute('data-task-id') || '') === id ||
      (el.getAttribute('data-lf-id') || '') === id
    );
    if (!item && freshItems[index]) item = freshItems[index];
    if (!item) { console.warn(`[LF] Görev ${id} kayboldu, atlanıyor`); continue; }
    if (lfIsTaskCompleted(item)) { console.log(`[LF] Görev ${id} zaten tamamlandı, atlanıyor`); continue; }
    
    await lfProcessSingleTask(item, index, id);
    
    // Bir sonraki göreve geçmeden önce sitenin UI'ının güncellenmesini bekle
    await lfSleep(2500);
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
      listEl.replaceChildren();
      return;
    }
    const doneRecords = records.filter(r => r.completed);
    const failRecords = records.filter(r => !r.completed);
    const done = doneRecords.length;
    const fail = failRecords.length;
    const totalPDone = doneRecords.reduce((s, r) => s + (Number(r.points) || 0), 0);
    const totalCStored = doneRecords.reduce((s, r) => s + (Number(r.cryptoReward) || 0), 0);
    const currentCrypto = lfGetCurrentCrypto() || '';
    const rate = lfGetPointToCryptoRate();
    const totalCRecalc = rate ? Math.round(totalPDone * rate * 1e8) / 1e8 : 0;
    const cryptoLabel = currentCrypto || doneRecords.find(r => r.crypto)?.crypto || records.find(r => r.crypto)?.crypto || '';
    const totalC = totalCRecalc || totalCStored;
    
    sumEl.textContent = `${records.length} görev (${done} başarılı, ${fail} başarısız) · ${totalPDone.toFixed(1)} P · ≈ ${totalC.toFixed(8)} ${cryptoLabel}`;
    listEl.replaceChildren();
    
    records.forEach(r => {
      const dt = new Date(r.timestamp);
      const item = document.createElement('div');
      item.className = 'lf-history-item' + (r.completed ? '' : ' failed');

      const row1 = document.createElement('div');
      row1.className = 'lf-history-row';
      const timeSpan = document.createElement('span');
      timeSpan.className = 'lf-history-time';
      timeSpan.textContent = `${dt.toLocaleDateString('tr-TR')} ${dt.toLocaleTimeString('tr-TR')}`;
      const statusSpan = document.createElement('span');
      statusSpan.className = 'lf-history-status ' + (r.completed ? 'done' : 'fail');
      statusSpan.textContent = r.completed ? '✓' : '✗';
      row1.appendChild(timeSpan);
      row1.appendChild(statusSpan);

      const row2 = document.createElement('div');
      row2.className = 'lf-history-row';
      const textSpan = document.createElement('span');
      textSpan.className = 'lf-history-text';
      textSpan.textContent = r.taskText || '(metin yok)';
      row2.appendChild(textSpan);

      const row3 = document.createElement('div');
      row3.className = 'lf-history-row';
      const pointsSpan = document.createElement('span');
      pointsSpan.className = 'lf-history-points';
      pointsSpan.textContent = `${r.points} P`;
      const rewardSpan = document.createElement('span');
      rewardSpan.className = 'lf-history-reward';
      rewardSpan.textContent = `≈ ${r.cryptoReward.toFixed(6)} ${r.crypto || ''}`;
      row3.appendChild(pointsSpan);
      row3.appendChild(rewardSpan);

      item.appendChild(row1);
      item.appendChild(row2);
      item.appendChild(row3);
      listEl.appendChild(item);
    });
  } catch (e) {
    sumEl.textContent = 'Yükleme hatası.';
    listEl.replaceChildren();
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
    if (msg.type === 'STOP_TASKS') { lfStopTaskRunner(); sendResponse({ ok: true }); return true; }
    if (msg.type === 'PLAY_CLICKED') { sendResponse({ ok: true }); return true; }
    
    // YENİ: Background'dan gelen video bitiş sinyallerini yakala
    if (msg.type === 'VIDEO_FINISHED') {
      console.log('[LF] Video bitti sinyali alındı!');
      if (lfVideoWaitResolver) {
        lfVideoWaitResolver('finished');
        lfVideoWaitResolver = null;
      }
      sendResponse({ ok: true });
      return true;
    }
    if (msg.type === 'VIDEO_FAILED' || msg.type === 'VIDEO_TAB_CLOSED') {
      console.log('[LF] Video başarısız veya kapatıldı sinyali alındı!');
      if (lfVideoWaitResolver) {
        lfVideoWaitResolver(msg.type === 'VIDEO_FAILED' ? 'failed' : 'closed');
        lfVideoWaitResolver = null;
      }
      sendResponse({ ok: true });
      return true;
    }

    sendResponse({ ok: false });
    return true;
  } catch (e) {
    try { sendResponse({ ok: false, error: String(e) }); } catch (_) {}
    return true;
  }
});

// ===========================================================================
// 9. postMessage dinleyicisi
// ===========================================================================
window.addEventListener('message', (ev) => {
  if (!ev.data || ev.data.source !== 'LF_VIDEO') return;
  const t = ev.data.type;
  
  if (t === 'PLAY_CLICKED' || t === 'VIDEO_FINISHED' || t === 'VIDEO_FAILED') {
    try {
      chrome.runtime.sendMessage({ type: t, reason: ev.data.reason || '' }).catch(() => {});
    } catch (err) {}
  }
});