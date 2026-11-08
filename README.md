# LimeFaucet Automation (ZoneLimeFaucet)

> **⚠️ ÖNEMLİ DİPNOT:** Bu eklenti **limefaucet.com** sitesine giriş yapılmadan **çalışmaz**. Kullanıcı önce kendi hesabıyla siteye giriş yapmalıdır. Eklenti, tarayıcıda bulunan cookies (çerez) bilgilerini kullanarak çalışır. Giriş yapılmamışsa görevler başlatılamaz.

---

Chrome (Manifest V3) eklentisi.  
**LimeFaucet** sitesindeki YouTube görevlerini otomatik olarak çalıştırır: görevleri başlatır, video sekmesini açar, oynatmayı doğrular, kısa süre izler, görevi tamamlar ve sonuçları kaydeder.

**GitHub:** [https://github.com/barron4335/ZoneLimeFaucet](https://github.com/barron4335/ZoneLimeFaucet)

> **Uyarı:** Bu eklenti eğitim / kişisel otomasyon amaçlıdır. Sitenin kullanım şartlarını ihlal edebilecek şekilde kullanmak hesabınızın kısıtlanmasına yol açabilir. Kendi sorumluluğunuzda kullanın.

---

## 📱 MobileZoneLimeFaucet (Mobil Sürüm)

**MobileZoneLimeFaucet** klasörü, eklentinin **mobil telefonlarda** çalışacak şekilde hazırlanmış sürümüdür.

### Kullanmadan Önce Zorunlu Adım
- **Lemur Browser** uygulamasını indirip kurmanız gerekir.  
  (Android cihazlarda Chrome eklentilerini destekleyen tarayıcı)

### Test Edildiği Platformlar

| Platform          | Durum                          |
|-------------------|--------------------------------|
| Android Telefon   | ✅ Test edildi                 |
| Linux             | ✅ Test edildi                 |
| Windows           | ✅ Test edildi                 |

**Test İlerlemesi:**  
`[██████████████████████████████] 100%`  
Tüm platformlarda başarıyla test edilmiştir.

---

## FaucetPay Hesabı

LimeFaucet üzerinden kazandığınız kripto paraları çekebilmek için **FaucetPay** hesabına ihtiyacınız vardır.

1. [https://faucetpay.io](https://faucetpay.io) adresinden ücretsiz hesap açın.
2. Hesabınızı doğrulayın ve istediğiniz kripto cüzdan adreslerini ekleyin.
3. LimeFaucet sitesinde ödeme yöntemini FaucetPay olarak seçin ve FaucetPay kullanıcı adınızı / e-posta adresinizi girin.
4. Kazandığınız puanlar belirli bir eşiğe ulaştığında FaucetPay hesabınıza aktarılır. Oradan da kendi cüzdanınıza çekebilirsiniz.

> FaucetPay, birçok faucet sitesinin kullandığı güvenilir bir mikro-ödeme platformudur. Hesap açmak ücretsizdir.

---

## Özellikler

- **Otomatik görev akışı** (8 aşamalı)
  1. Sayfayı ve Shadow DOM görev listesini kaydırma
  2. Bekleyen görevleri okuma
  3. “Start” butonuna tıklama
  4. “Open video” butonunu bekleme ve tıklama
  5. Yeni video sekmesini yakalama
  6. Video oynatmayı gerçekten başlatma + doğrulama
  7. 10–15 saniye arası rastgele izleme süresi
  8. Görevi tamamlayıp kaydetme ve sonraki göreve geçme

- **Yüzen panel** (LimeFaucet /youtube sayfasında)
  - Seçili kripto birimini gösterme / değiştirme
  - Puan → kripto kur bilgisini canlı okuma
  - Görev listesi ve durumları
  - Geçmiş (tarihe göre filtreli)
  - Sürekli döngü + sayfa yenileme aralığı (1–30 dk)

- **Video sekmesi yönetimi**
  - YouTube, blogspot, blogger, embed sayfalarını algılama
  - Dual injection: Isolated world bridge + MAIN world content script
  - Play butonuna tıklama + gerçek oynatma teyidi (`currentTime > 0.2` veya YT Player state === 1)
  - Oynatma düşerse yeniden deneme

- **Veri saklama (IndexedDB)**
  - Çerezler (`cookiesStore`)
  - Görev geçmişi (`tasksStore`) — tarih, puan, kripto ödülü, başarı durumu

- **Popup arayüzü**
  - Durum özeti
  - Çerez yakalama
  - YouTube sayfasına yönlendirme
  - Görevleri başlat / durdur
  - Veritabanını temizleme

---

## Ekran Görüntüleri

### 1. Yüzen Panel – Kripto Değiştirme
Panel üzerinden kripto birimini değiştirebilir, güncel kur bilgisini görebilirsiniz.

![Yüzen Panel - Kripto Değiştirme](img/resim1.png)

### 2. Görev Listesi ve Geçmiş
Tamamlanan görevler, kazanılan puanlar ve geçmiş kayıtları panelde anlık olarak görünür.

![Görev Listesi ve Geçmiş](img/resim2.png)

### 3. Video Oynatma ve Puan Kazanma
Video izlendikten sonra site “You earned +X Points” bildirimi gösterir. Sağ üstte kalan süre sayacı yer alır.

![Video Tamamlandı - Puan Kazanma](img/resim3.png)

### 4. Sürekli Döngü – Yenileme Geri Sayımı
Tüm görevler bittikten sonra seçilen aralıkta sayfa yenilenir. Ortada büyük geri sayım, sağda panel görünür.

![Yenilemeye Kalan Süre Overlay](img/resim4.png)

---

## Kurulum

1. Chrome’da `chrome://extensions` adresine gidin.
2. Sağ üstten **Geliştirici modu**nu açın.
3. **Paketlenmemiş öğe yükle** butonuna tıklayın.
4. Bu klasörü seçin (manifest.json’un bulunduğu dizin).
5. Eklenti yüklendikten sonra LimeFaucet sitesine gidin.

> Not: `host_permissions: ["*://*/*"]` geniş izin istediği için Chrome uyarı verebilir. Sadece kendi kullanımınız için yükleyin.

**Mobil (Android) için:**  
MobileZoneLimeFaucet klasörünü kullanın. Önce **Lemur Browser** uygulamasını indirin, ardından eklentiyi Lemur Browser üzerinden yükleyin.

---

## Kullanım

### Temel akış
1. `https://limefaucet.com` adresine gidin ve **kendi hesabınızla giriş yapın** (çerezler otomatik yakalanır).
2. Eklenti sizi otomatik olarak `/youtube` sayfasına yönlendirebilir.
3. Sağ üstte yüzen panel görünür.
4. **“Tüm Görevleri Çalıştır”** butonuna basın.
5. Eklenti sırayla görevleri işler:
   - Start → Open video → Yeni sekme → Play doğrulama → 10-15 sn bekle → Sekmeyi kapat → Kaydet

### Sürekli döngü
- “Tüm Görevleri Çalıştır”a bastığınızda sürekli mod açılır.
- Tüm görevler bittikten sonra seçtiğiniz aralıkta (varsayılan 5 dk) sayfa yenilenir ve yeni görevler aranır.
- Durdurmak için paneldeki **Durdur** butonunu veya popup’taki **Görevleri Durdur** butonunu kullanın.

### Kripto değiştirme
Paneldeki **Crypto Değiştir** butonu ile desteklenen birimler arasında geçiş yapabilirsiniz:  
`DOGE, LTC, BCH, DASH, TRX, USDT, BNB, SOL, XRP, POL, ADA, TON, XLM`

### Geçmiş
Panelin alt kısmından tarih seçip o güne ait görev kayıtlarını (başarılı/başarısız, puan, ödül) görebilirsiniz.

---

## Dosya Yapısı

```
├── manifest.json          # Manifest V3 tanımı
├── background.js          # Service worker – sekme yakalama, injection, mesaj yönlendirme
├── content.js             # Ana content script (limefaucet.com) – panel + görev motoru
├── video-content.js       # MAIN world – video oynatma + countdown
├── video-bridge.js        # Isolated world – postMessage ↔ chrome.runtime köprüsü
├── popup.html / popup.js / popup.css
├── panel.css              # Yüzen panel stilleri
├── img/                   # Ekran görüntüleri
│   ├── resim1.png
│   ├── resim2.png
│   ├── resim3.png
│   └── resim4.png
├── lib/
│   ├── db.js              # IndexedDB yardımcıları
│   └── dom-utils.js       # XPath / görünürlük yardımcıları
```

---

## Teknik Mimari

### Mesajlaşma akışı

```
content.js (limefaucet)
    │  TASK_START_VIDEO
    ▼
background.js
    │  yeni sekme yakalar → injectVideoScripts()
    ▼
video-bridge.js (ISOLATED)  ←→  video-content.js (MAIN)
    │  postMessage (LF_VIDEO)
    ▼
background.js
    │  PLAY_CLICKED / VIDEO_FINISHED / VIDEO_FAILED
    ▼
content.js  →  görevi tamamlar / kaydeder
```

### Video oynatma doğrulama
- YouTube iframe içinde: `video` elementinin `paused === false`, `readyState >= 2` ve `currentTime > 0.2` olması beklenir.
- Üst frame (blogspot vb.): YouTube IFrame API (`YT.get().getPlayerState() === 1`) kullanılır.
- Play teyit edilmeden `PLAY_CLICKED` gönderilmez (yanlış pozitif azaltılır).

### Injection stratejisi
- `chrome.scripting.executeScript` ile hem Isolated hem MAIN world’e enjekte edilir.
- `PLAY_CLICKED` geldikten sonra (`playDone = true`) yeni enjeksiyon yapılmaz (player reset önlenir).
- Frame yüklemelerinde (`webNavigation.onCompleted`) ek enjeksiyon yapılır.

### Kur hesaplama
Sayfadaki “X Points ≈ Y COIN” bilgisinden dinamik oran okunur.  
Ödül = `puan × (crypto / points)` şeklinde 8 ondalığa yuvarlanarak hesaplanır.

---

## Önemli Sabitler

| Sabit                      | Değer      | Açıklama                          |
|----------------------------|------------|-----------------------------------|
| `TASK_LIST_REFRESH_MS`     | 3000       | Panel görev listesi yenileme      |
| İzleme süresi              | 10–15 sn   | Rastgele                          |
| Yenileme aralığı           | 1–30 dk    | Kullanıcı seçimli (varsayılan 5)  |
| `awaitingVideoTab` timeout | 18–20 sn   | Video sekmesi bekleme süresi      |

---

## Bilinen Sınırlamalar / Notlar

- Site arayüzü (özellikle Shadow DOM) değişirse seçiciler kırılabilir.
- Bazı video sayfalarında autoplay / muted politikaları yüzünden oynatma teyidi gecikebilir.
- `host_permissions: *://*/*` çok geniştir; sadece gerekli domainlere indirgenebilir.
- Manifest’te ikon tanımlanmamıştır.

---

## Geliştirme İpuçları

- Console logları `[LF]`, `[BG]`, `[LF-BRIDGE]` önekleriyle filtrelenebilir.
- Video sekmesinde `window.__lfVideoDone` ve `window.__lfVideoRunning` bayrakları tekrar enjeksiyonu engeller.
- Panel sürükle-bırak destekler.
- Sürekli mod `chrome.storage.local` içinde (`lfContinuousMode`, `lfRefreshMinutes`) saklanır.

---

## Lisans / Sorumluluk

Bu proje kişisel kullanım için hazırlanmıştır.  
LimeFaucet veya ilgili sitelerin hizmet şartlarını ihlal etmekten doğacak sonuçlardan kullanıcı sorumludur.

---

## Repo

Kaynak kod ve güncellemeler:  
**https://github.com/barron4335/ZoneLimeFaucet**
