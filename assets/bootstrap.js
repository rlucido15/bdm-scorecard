/* Moxie Scorecard — bootstrap/loader
 * Keeps index.html lean. Loads styles + app with a cache-busting version.
 *
 * Browsers and GitHub's CDN cache assets/app.js and assets/app.css. Appending
 * ?v=BUILD makes a changed file look like a new address, which forces a fresh
 * fetch. Change BUILD to anything new whenever you upload a changed asset,
 * or people will keep seeing the old version.
 */
(function () {
  'use strict';

  var BUILD = '2026.09.05.1';

  function asset(path) {
    return 'assets/' + path + '?v=' + BUILD;
  }

  function loadStyles() {
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = asset('app.css');
    document.head.appendChild(link);
  }

  function loadApp() {
    var s = document.createElement('script');
    s.src = asset('app.js');
    s.defer = true;
    s.onerror = function () { fail('Could not load app.js. Check that assets/app.js exists in the repo.'); };
    document.head.appendChild(s);
  }

  function fail(msg) {
    var app = document.getElementById('app');
    if (!app) return;
    app.setAttribute('data-state', 'error');
    app.innerHTML = '<div class="boot"><div class="boot__mark">MOXIE</div>' +
      '<p class="boot__msg boot__msg--error"></p></div>';
    app.querySelector('.boot__msg').textContent = msg;
  }

  window.MOXIE_BUILD = BUILD;
  window.MOXIE_FAIL = fail;

  loadStyles();
  loadApp();
})();
