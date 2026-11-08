/**
 * Verilen XPath ifadesine göre ilk elemanı döndürür.
 * @param {string} xpath - XPath ifadesi.
 * @param {Node} context - Bağlam düğümü (varsayılan: document).
 * @returns {Element|null}
 */
function getElementByXPath(xpath, context = document) {
  const result = document.evaluate(
    xpath,
    context,
    null,
    XPathResult.FIRST_ORDERED_NODE_TYPE,
    null
  );
  return result.singleNodeValue;
}

/**
 * Önce XPath'i dener, bulamazsa CSS selector'ı dener.
 * @param {string} xpath - Denenecek XPath.
 * @param {string} cssSelector - Yedek CSS selector.
 * @returns {Element|null}
 */
function findByXPathOrSelector(xpath, cssSelector) {
  let el = getElementByXPath(xpath);
  if (!el) {
    el = document.querySelector(cssSelector);
  }
  return el;
}

/**
 * Elementin görünür ve tıklanabilir olup olmadığını kontrol eder.
 * @param {Element} el
 * @returns {boolean}
 */
function isVisible(el) {
  if (!el) return false;
  const style = window.getComputedStyle(el);
  return (
    style.display !== 'none' &&
    style.visibility !== 'hidden' &&
    style.opacity !== '0' &&
    el.offsetWidth > 0 &&
    el.offsetHeight > 0
  );
}

/**
 * Belirtilen XPath veya selector ile eşleşen elemente tıklar.
 * @param {string} xpath
 * @param {string} cssSelector
 * @returns {boolean} Tıklama başarılıysa true.
 */
function clickElement(xpath, cssSelector) {
  const el = findByXPathOrSelector(xpath, cssSelector);
  if (el && isVisible(el)) {
    el.click();
    return true;
  }
  return false;
}
