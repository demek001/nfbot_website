(function () {
  'use strict';

  // Shared by every HTML page; executing it twice must not count two visits.
  if (window.__notinhaMetricool) return;
  window.__notinhaMetricool = true;
  var started = false;
  var sent = false;

  function consented() {
    try { return localStorage.getItem('cookieConsent') === 'all'; }
    catch (_) { return false; }
  }

  function safeUrl(value, current) {
    if (!value) return true;
    try {
      var url = new URL(value);
      // The vendor sends the complete URL and referrer. Never expose account,
      // activation, payment or dashboard URLs, or arbitrary query parameters.
      if (/^\/(?:conta\.html|conectado\.html|painel(?:\/|$)|pagamento-confirmado(?:\/|$))/.test(url.pathname)) return false;
      if (url.search) return false;
      if (url.hash && !(current && document.getElementById(url.hash.slice(1)))) return false;
      return true;
    } catch (_) { return false; }
  }

  function allowed() {
    return location.protocol === 'https:' &&
      /^(www\.)?usenotinha\.com\.br$/.test(location.hostname) &&
      consented() && safeUrl(location.href, true) && safeUrl(document.referrer, false);
  }

  function track() {
    if (sent || !allowed() || !window.beTracker || typeof window.beTracker.t !== 'function') return;
    sent = true;
    try { window.beTracker.t({ hash: '2ad3966fcc4ad132dd87a95f5b5c37dd' }); }
    catch (_) { /* Analytics must never interrupt the site. */ }
  }

  function start() {
    if (started || !allowed()) return;
    started = true;
    var src = 'https://tracker.metricool.com/resources/be.js';
    var script = document.querySelector('script[src="' + src + '"]');
    if (window.beTracker) { track(); return; }
    if (script) { script.addEventListener('load', track, { once: true }); return; }
    script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.referrerPolicy = 'no-referrer';
    script.addEventListener('load', track, { once: true });
    document.head.appendChild(script);
  }

  // Existing consent buttons save cookieConsent synchronously in their onclick.
  document.addEventListener('click', function () { setTimeout(start, 0); });
  window.addEventListener('storage', function (event) {
    if (event.key === 'cookieConsent') start();
  });
  start();
})();
