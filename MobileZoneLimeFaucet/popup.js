// ---------------------------------------------------------------------------
// Yardımcı: Aktif sekme
// ---------------------------------------------------------------------------
async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0] || null;
}

// ---------------------------------------------------------------------------
// Yardımcı: Footer mesajı
// ---------------------------------------------------------------------------
function showFooter(message, isError = false) {
  const el = document.getElementById('footer-msg');
  el.textContent = message;
  el.className = 'footer-msg' + (isError ? ' error' : '');
  if (message) {
    clearTimeout(showFooter._timer);
    showFooter._timer = setTimeout(() => {
      el.textContent = '';
    }, 3000);
  }
}

// ---------------------------------------------------------------------------
// Durum Bilgilerini Yükle
// ---------------------------------------------------------------------------
async function loadStatus() {
  const tab = await getActiveTab();
  const tabEl = document.getElementById('status-tab');
  if (tab && tab.url) {
    tabEl.textContent = tab.url.includes('limefaucet.com') ? 'LimeFaucet' : 'Diğer';
    tabEl.title = tab.url;
  } else {
    tabEl.textContent = '—';
  }

  const cryptoEl = document.getElementById('status-crypto');
  if (tab && tab.url && tab.url.includes('limefaucet.com')) {
    try {
      const resp = await chrome.tabs.sendMessage(tab.id, { type: 'GET_PANEL_STATE' });
      if (resp && resp.crypto) {
        cryptoEl.textContent = resp.crypto;
      } else {
        cryptoEl.textContent = 'Panel yok';
      }
    } catch (err) {
      cryptoEl.textContent = 'Panel yok';
    }
  } else {
    cryptoEl.textContent = '—';
  }

  const info1El = document.getElementById('status-info-1');
  const info2El = document.getElementById('status-info-2');
  if (tab && tab.url && tab.url.includes('limefaucet.com/youtube')) {
    try {
      const resp = await chrome.tabs.sendMessage(tab.id, { type: 'GET_INFO_STATE' });
      if (resp && resp.info1 !== undefined) {
        info1El.textContent = resp.info1 || '—';
        info2El.textContent = resp.info2 || '—';
      }
    } catch (err) {
      info1El.textContent = '—';
      info2El.textContent = '—';
    }
  } else {
    info1El.textContent = '—';
    info2El.textContent = '—';
  }

  const recordEl = document.getElementById('status-record');
  const idEl = document.getElementById('status-id');
  const timeEl = document.getElementById('status-time');

  if (tab && tab.url && tab.url.includes('limefaucet.com')) {
    try {
      const resp = await chrome.tabs.sendMessage(tab.id, { type: 'GET_DB_STATE' });
      if (resp && resp.record) {
        recordEl.textContent = `${resp.record.cookies.length} çerez`;
        idEl.textContent = String(resp.record.id);
        const dt = new Date(resp.record.timestamp);
        timeEl.textContent = dt.toLocaleTimeString('tr-TR');
      } else {
        recordEl.textContent = 'Kayıt yok';
        idEl.textContent = '—';
        timeEl.textContent = '—';
      }
    } catch (err) {
      recordEl.textContent = 'Erişilemiyor';
      idEl.textContent = '—';
      timeEl.textContent = '—';
    }
  } else {
    recordEl.textContent = 'Site açık değil';
    idEl.textContent = '—';
    timeEl.textContent = '—';
  }
}

// ---------------------------------------------------------------------------
// Çerezleri Yeniden Yakala
// ---------------------------------------------------------------------------
async function captureCookies() {
  const tab = await getActiveTab();
  if (!tab || !tab.url || !tab.url.includes('limefaucet.com')) {
    showFooter('Önce LimeFaucet sitesini açın.', true);
    return;
  }
  try {
    const resp = await chrome.tabs.sendMessage(tab.id, { type: 'CAPTURE_COOKIES' });
    if (resp && resp.ok) {
      showFooter('Çerezler kaydedildi.');
      loadStatus();
    } else {
      showFooter('Kaydetme başarısız.', true);
    }
  } catch (err) {
    showFooter('Content script yanıt vermedi.', true);
  }
}

// ---------------------------------------------------------------------------
// YouTube Sayfasına Git
// ---------------------------------------------------------------------------
async function navigateYouTube() {
  const tab = await getActiveTab();
  if (tab && tab.url && tab.url.includes('limefaucet.com')) {
    await chrome.tabs.update(tab.id, { url: 'https://limefaucet.com/youtube' });
    showFooter('Yönlendiriliyor...');
  } else {
    await chrome.tabs.create({ url: 'https://limefaucet.com/youtube' });
    showFooter('Yeni sekmede açıldı.');
  }
}

// ---------------------------------------------------------------------------
// Görevleri Çalıştır
// ---------------------------------------------------------------------------
async function runTasks() {
  const tab = await getActiveTab();
  if (!tab || !tab.url || !tab.url.includes('limefaucet.com/youtube')) {
    showFooter('Önce LimeFaucet /youtube sayfasını açın.', true);
    return;
  }
  try {
    const resp = await chrome.tabs.sendMessage(tab.id, { type: 'RUN_TASKS' });
    if (resp && resp.ok) {
      showFooter('Görevler başladı.');
    } else {
      showFooter('Başlatma başarısız.', true);
    }
  } catch (err) {
    showFooter('Content script yanıt vermedi.', true);
  }
}

// ---------------------------------------------------------------------------
// Görevleri Durdur
// ---------------------------------------------------------------------------
async function stopTasks() {
  const tab = await getActiveTab();
  if (!tab || !tab.url || !tab.url.includes('limefaucet.com/youtube')) {
    showFooter('Önce LimeFaucet /youtube sayfasını açın.', true);
    return;
  }
  try {
    const resp = await chrome.tabs.sendMessage(tab.id, { type: 'STOP_TASKS' });
    if (resp && resp.ok) {
      showFooter('Durdurma isteği gönderildi.');
    } else {
      showFooter('Durdurma başarısız.', true);
    }
  } catch (err) {
    showFooter('Content script yanıt vermedi.', true);
  }
}

// ---------------------------------------------------------------------------
// YENİ: Veritabanını Temizle
// ---------------------------------------------------------------------------
async function clearDatabase() {
  const tab = await getActiveTab();
  if (!tab || !tab.url || !tab.url.includes('limefaucet.com')) {
    showFooter('Önce LimeFaucet sitesini açın.', true);
    return;
  }

  if (!confirm('DİKKAT: Tüm çerez ve görev geçmişi verileri kalıcı olarak silinecek. Onaylıyor musunuz?')) {
    return;
  }

  try {
    const resp = await chrome.tabs.sendMessage(tab.id, { type: 'CLEAR_DB' });
    if (resp && resp.ok) {
      showFooter('Veritabanı başarıyla temizlendi.');
      loadStatus(); // Arayüzü güncelle
    } else {
      showFooter('Temizleme başarısız: ' + (resp?.error || 'Bilinmeyen hata'), true);
    }
  } catch (err) {
    showFooter('Content script yanıt vermedi.', true);
  }
}

// ---------------------------------------------------------------------------
// Olay Bağlama
// ---------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  document
    .getElementById('btn-capture')
    .addEventListener('click', captureCookies);

  document
    .getElementById('btn-navigate-youtube')
    .addEventListener('click', navigateYouTube);

  document
    .getElementById('btn-run-tasks')
    .addEventListener('click', runTasks);

  document
    .getElementById('btn-stop-tasks')
    .addEventListener('click', stopTasks);

  document
    .getElementById('btn-refresh-status')
    .addEventListener('click', () => {
      loadStatus();
      showFooter('Yenilendi.');
    });

  // YENİ EKLENEN BUTON DİNLEYİCİSİ
  document
    .getElementById('btn-clear-db')
    .addEventListener('click', clearDatabase);

  loadStatus();
});
