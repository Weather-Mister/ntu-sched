// Detect ePortfolio's declarative language controls without executing page JS.
// Divs, buttons, anchors, or an element's nearby clickable wrapper can expose a
// literal same-page English/Chinese URL. Never follow arbitrary provider actions.
const PORTAL = 'https://portal.aca.ntu.edu.tw';
const PATH = '/eportfolio/course-overview';
const normalize = value => String(value || '').trim().replace(/\s+/g, ' ');
const labels = {
  en: /^(?:English(?:\s+(?:version|language))?|EN|英文(?:版|切換)?|英語|switch to english|translate to english)$/i,
  zh: /^(?:Chinese(?:\s+(?:version|language))?|繁體中文|正體中文|中文(?:版|切換)?|ZH(?:-TW)?|switch to chinese|translate to chinese)$/i
};
function intent(element, language) {
  for (const attribute of ['aria-label', 'title', 'data-language', 'data-lang', 'data-locale']) {
    const value = normalize(element.getAttribute(attribute));
    if (value && (labels[language].test(value) ||
      language === 'en' && /^(?:en|en-us)$/i.test(value) ||
      language === 'zh' && /^(?:zh|zh-tw|zh-hant)$/i.test(value))) return true;
  }
  return labels[language].test(normalize(element.textContent).slice(0, 80));
}
function literalClick(onclick) {
  if (!onclick || onclick.length > 512) return null;
  // Accept only a single literal navigation, not a JS function or program.
  const direct = /^\s*(?:(?:window|document)\.)?location(?:\.href)?\s*=\s*(['"])([^'"\r\n]+)\1\s*;?\s*$/i.exec(onclick);
  if (direct) return direct[2];
  const call = /^\s*(?:(?:window|document)\.)?location\.(?:assign|replace)\(\s*(['"])([^'"\r\n]+)\1\s*\)\s*;?\s*$/i.exec(onclick);
  return call?.[2] || null;
}
function candidate(node) {
  for (const property of ['href', 'data-href', 'data-url', 'data-link', 'data-target-url']) {
    const value = node.getAttribute(property);
    if (value && value.length <= 1024) return value;
  }
  return literalClick(node.getAttribute('onclick'));
}
function approved(value, origin) {
  let url;
  try { url = new URL(value, origin); } catch { return null; }
  if (url.protocol !== 'https:' || url.origin !== PORTAL ||
    url.pathname.replace(/\/+$/, '') !== PATH || url.username || url.password ||
    url.hash || url.href.length > 2048 || url.href === origin.href) return null;
  // A language switch may include only language-related query parameters.
  if (![...url.searchParams.keys()].every(k => /^(?:lang|language|locale|culture|ui_locales)$/i.test(k))) return null;
  return url;
}
export function portfolioLanguageUrl(document, currentUrl, language) {
  if (!labels[language]) return null;
  const base = new URL(currentUrl);
  if (base.origin !== PORTAL || base.pathname.replace(/\/+$/, '') !== PATH) return null;
  const controls = document.querySelectorAll(
    'a[href],button,[role="button"],div[onclick],div[data-href],div[data-url],div[data-link],div[data-language],div[data-lang],span[onclick],span[data-href],span[data-url],.ic-earth'
  );
  for (const node of controls) {
    if (!intent(node, language)) continue;
    // A div label may have a clickable parent, or contain a literal anchor.
    const relatives = [node, node.querySelector('a[href]'),node.parentElement,node.parentElement?.parentElement];
    for (const el of relatives) {
      if (!el) continue;
      const value = candidate(el);
      const url = value && approved(value, base);
      if (url) return url;
    }
  }
  return null;
}

export function portfolioLanguageRequest(document, currentUrl, language) {
  const url = portfolioLanguageUrl(document, currentUrl, language);
  if (url) return { url };
  if (!labels[language]) return null;
  const base = new URL(currentUrl);
  if (base.origin !== PORTAL || base.pathname.replace(/\/+$/, '') !== PATH ||
    base.username || base.password) return null;
  // NTU's init.js binds .eng/.zh clicks to setCookie('lang', lang, 30),
  // then reloads the current URL. These globe controls have no href/onclick.
  // Reproduce only this known read-only language preference within the sync.
  const selector = language === 'en' ? '.ic-earth.eng' : '.ic-earth.zh';
  if ([...document.querySelectorAll(selector)].some(node => intent(node, language))) {
    return { url: base, language };
  }
  return null;
}
