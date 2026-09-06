/* Moxie BDM / sBDM Performance Scorecard — front end
 *
 * Two modes, one file:
 *   index.html            -> admin console (requires admin key)
 *   index.html?t=<token>  -> a single unit's scorecard, nothing else
 *
 * The token is never resolved here. It is sent to the Apps Script, which
 * looks up which unit owns it and returns ONLY that unit's numbers. The
 * browser never receives another unit's data, so there is nothing to find
 * in devtools.
 */
(function () {
  'use strict';

  /* ============================================================
   * 1. CONNECTION  — paste your deployed Apps Script /exec URL here
   * ============================================================ */
  var PIPELINE_API = window.MOXIE_API_URL ||
    'https://script.google.com/macros/s/AKfycbyCHntYkVEp9Mi9QhB9Ys9MxreydF_RVQpVGR0d2ZLTJtwBeCvwfNOP-KYgsUQxHmvT/exec';

  /* ============================================================
   * 2. Small helpers
   * ============================================================ */

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var app = document.getElementById('app');

  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function money(n) {
    if (n == null || isNaN(n)) return '—';
    return '$' + Math.round(n).toLocaleString('en-US');
  }

  function num(n, dp) {
    if (n == null || isNaN(n)) return '—';
    return Number(n).toLocaleString('en-US', {
      minimumFractionDigits: dp || 0,
      maximumFractionDigits: dp || 0
    });
  }

  /* Axis labels only. Full precision belongs on the figures themselves,
     not on a scale, where long strings force a wide gutter. */
  function moneyShort(n) {
    if (n == null || isNaN(n)) return '—';
    var a = Math.abs(n);
    if (a >= 1e9) return '$' + (n / 1e9).toFixed(1).replace(/\.0$/, '') + 'B';
    if (a >= 1e6) return '$' + (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
    if (a >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + Math.round(n);
  }

  function pct(n) {
    if (n == null || isNaN(n)) return '—';
    return Math.round(n) + '%';
  }

  function fmt(value, kind) {
    if (value == null) return '—';
    if (kind === 'money') return money(value);
    if (kind === 'pct') return pct(value);
    if (kind === 'days') return num(value, 1) + ' days';
    if (kind === 'bps') return num(value, 0) + ' bps';
    return num(value, value % 1 === 0 ? 0 : 1);
  }

  function qs(name) {
    var m = new RegExp('[?&]' + name + '=([^&#]*)').exec(location.search);
    return m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : null;
  }

  /* Session-scoped admin key. Falls back to memory if storage is blocked
     (e.g. inside a sandboxed iframe). */
  var memKey = null;
  function adminKey(value) {
    if (value !== undefined) {
      memKey = value;
      try { sessionStorage.setItem('moxie_admin_key', value); } catch (e) { /* memory only */ }
      return value;
    }
    if (memKey) return memKey;
    try { memKey = sessionStorage.getItem('moxie_admin_key'); } catch (e) { memKey = null; }
    return memKey;
  }

  /* ============================================================
   * 3. API
   * Reads use GET (no preflight). Writes use POST with text/plain,
   * which also avoids a CORS preflight Apps Script cannot answer.
   * ============================================================ */

  function api(action, params) {
    params = params || {};
    var url = PIPELINE_API + '?action=' + encodeURIComponent(action);
    Object.keys(params).forEach(function (k) {
      if (params[k] !== undefined && params[k] !== null) {
        url += '&' + encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
      }
    });
    return fetch(url, { method: 'GET', redirect: 'follow' })
      .then(readJson);
  }

  function apiPost(action, payload) {
    return fetch(PIPELINE_API, {
      method: 'POST',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: action, key: adminKey(), payload: payload })
    }).then(readJson);
  }

  function readJson(res) {
    return res.text().then(function (txt) {
      var data;
      try {
        data = JSON.parse(txt);
      } catch (e) {
        throw new Error('The backend replied with something that was not JSON. ' +
          'This usually means the Apps Script threw an error or the deployment URL is wrong.');
      }
      if (data && data.ok === false) throw new Error(data.error || 'The backend rejected that request.');
      return data;
    });
  }

  /* ============================================================
   * 4. Shared chrome
   * ============================================================ */

  function stage(inner) {
    return '<section class="stage"><div class="inner">' + inner + '</div></section>';
  }

  var LOGO = window.MOXIE_LOGO || 'assets/moxie-wordmark.png';

  /* The bar mirrors the Funding Floor header: a rounded gradient rail
     running dark navy on the left to teal on the right, wordmark at the
     leading edge, hairline divider, then the dashboard name. */
  function brandbar(name, period) {
    return '' +
      '<div class="brandbar">' +
        '<div class="brandbar__row">' +
          '<div class="brandbar__left">' +
            '<img class="brandbar__logo" src="' + LOGO + '" alt="Moxie">' +
            '<span class="brandbar__rule"></span>' +
            '<span class="brandbar__product">PERFORMANCE SCORECARD</span>' +
          '</div>' +
          '<div class="brandbar__who">' +
            '<p class="brandbar__name">' + esc(name) + '</p>' +
          '</div>' +
        '</div>' +
        '<div class="brandbar__foot">' +
          '<p class="brandbar__tag">BUY WITH MOXIE. LIVE WITH CONFIDENCE.</p>' +
          (period ? '<p class="brandbar__period">' + esc(period) + '</p>' : '') +
        '</div>' +
      '</div>';
  }

  function notice(kind, html) {
    return '<div class="notice notice--' + kind + '">' + html + '</div>';
  }

  /* ============================================================
   * 5. Scorecard rendering
   * ============================================================ */

  /* Progress ring. The faint tick marks where you would be if exactly on
     pace, so the gap between fill and tick is the whole story at a glance. */
  function ring(ratio, expected, size, light) {
    size = size || 92;
    var sw = 8;
    var r = (size - sw) / 2;
    var c = 2 * Math.PI * r;
    var shown = Math.max(0, Math.min(1, ratio || 0));

    var stroke = light ? 'var(--cyan-deep)' : 'var(--cyan)';
    if (expected != null) {
      if (ratio >= expected + 0.05) stroke = light ? 'var(--green)' : 'var(--green-on-dark)';
      else if (ratio < expected - 0.05) stroke = light ? 'var(--coral-graphic)' : 'var(--coral-on-dark)';
    }
    var tickColour = light ? 'rgba(20,35,43,.45)' : 'rgba(255,255,255,.65)';

    var tick = '';
    if (expected != null && expected > 0 && expected < 1) {
      tick = '<circle class="ring__tick" cx="' + (size / 2) + '" cy="' + (size / 2) + '" r="' + r + '" ' +
        'stroke="' + tickColour + '" stroke-width="' + sw + '" fill="none" ' +
        'stroke-dasharray="2 ' + (c - 2).toFixed(2) + '" ' +
        'stroke-dashoffset="' + (-expected * c).toFixed(2) + '"></circle>';
    }

    return '<div class="ring' + (light ? ' ring--light' : '') + '" style="width:' + size + 'px;height:' + size + 'px">' +
      '<svg width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '" aria-hidden="true">' +
        '<circle class="ring__track" cx="' + (size / 2) + '" cy="' + (size / 2) + '" r="' + r + '" stroke-width="' + sw + '"></circle>' +
        '<circle class="ring__fill" cx="' + (size / 2) + '" cy="' + (size / 2) + '" r="' + r + '" ' +
          'stroke="' + stroke + '" stroke-width="' + sw + '" ' +
          'stroke-dasharray="' + (shown * c).toFixed(2) + ' ' + c.toFixed(2) + '"></circle>' +
        tick +
      '</svg>' +
      '<div class="ring__center"><span class="ring__pct tnum">' + pct(shown * 100) + '</span>' +
      '<span class="ring__cap">OF GOAL</span></div></div>';
  }

  function chip(p, span) {
    if (!p || p.ratio == null || p.expected == null) {
      return '<span class="chip chip--none"><span class="chip__dot"></span>No target set</span>';
    }
    var diff = p.ratio - p.expected;
    var cls = diff >= 0.05 ? 'ahead' : (diff < -0.05 ? 'behind' : 'ontrack');
    var word = diff >= 0.05 ? 'Ahead of pace' : (diff < -0.05 ? 'Behind pace' : 'On pace');
    return '<span class="chip chip--' + cls + '"><span class="chip__dot"></span>' + word +
      ' &middot; ' + pct(p.expected * 100) + ' of the ' + (span || 'quarter') + ' gone</span>';
  }

  function dbar(ratio, expected) {
    var shown = Math.max(0, Math.min(1, ratio || 0));
    var cls = '';
    if (expected != null) {
      if (ratio >= expected + 0.05) cls = ' dbar__fill--ahead';
      else if (ratio < expected - 0.05) cls = ' dbar__fill--behind';
    }
    return '<div class="dbar"><div class="dbar__fill' + cls + '" style="width:' +
      (shown * 100).toFixed(1) + '%"></div></div>';
  }

  /* A metric row. target === null renders without a bar, which is how
     Potential Earnings and the diagnostic metrics appear. */
  function mrow(label, result, target, kind, paceRatio) {
    if (result === null || result === undefined) {
      return '<div class="mrow"><div class="mrow__top">' +
        '<span class="mrow__name">' + esc(label) + '</span>' +
        '<span class="mrow__off">not configured</span></div></div>';
    }

    if (!target) {
      return '<div class="mrow mrow--plain"><div class="mrow__top">' +
        '<span class="mrow__name">' + esc(label) + '</span>' +
        '<span class="mrow__nums"><span class="mrow__value tnum">' + fmt(result, kind) + '</span></span>' +
        '</div></div>';
    }

    var ratio = target > 0 ? (result / target) : 0;
    var shown = Math.max(0, Math.min(1, ratio));
    var cls = '';
    if (paceRatio != null) {
      if (ratio >= paceRatio + 0.05) cls = ' mbar__fill--ahead';
      else if (ratio < paceRatio - 0.05) cls = ' mbar__fill--behind';
    }
    var tick = (paceRatio != null && paceRatio > 0 && paceRatio < 1)
      ? '<span class="mbar__pace" style="left:' + (paceRatio * 100).toFixed(1) + '%" title="On-pace marker"></span>'
      : '';

    return '' +
      '<div class="mrow">' +
        '<div class="mrow__top">' +
          '<span class="mrow__name">' + esc(label) + '</span>' +
          '<span class="mrow__nums"><span class="mrow__value tnum">' + fmt(result, kind) + '</span>' +
          '<span class="mrow__target tnum">/ ' + fmt(target, kind) + '</span></span>' +
        '</div>' +
        '<div class="mbar"><div class="mbar__fill' + cls + '" style="width:' + (shown * 100).toFixed(1) + '%"></div>' + tick + '</div>' +
        '<div class="mrow__foot"><span>' + (paceRatio != null ? 'on pace at ' + pct(paceRatio * 100) : '&nbsp;') +
        '</span><span class="mrow__pct tnum">' + pct(ratio * 100) + '</span></div>' +
      '</div>';
  }

  function heroBento(d) {
    var y = d.ytd, q = d.quarter, t = d.targets, p = d.pace;

    var earnRatio = t.earningsAnnual ? y.earnings / t.earningsAnnual : 0;
    var loanRatio = t.loansClosedAnnual ? y.loansClosed / t.loansClosedAnnual : 0;
    var volRatio = t.closedVolumeAnnual ? y.closedVolume / t.closedVolumeAnnual : 0;

    var feature = '<div class="htile htile--feature">' +
      '<p class="htile__label">EARNINGS YEAR TO DATE</p>' +
      '<div class="htile__split"><div>' +
        '<p class="htile__value tnum">' + money(y.earnings) + '</p>' +
        '<p class="htile__sub">' + (t.earningsAnnual ? 'Goal ' + money(t.earningsAnnual) + ' for the year' : 'No annual goal set') + '</p>' +
        chip(p.ytdEarnings, 'year') +
      '</div>' + (t.earningsAnnual ? ring(earnRatio, p.ytdEarnings && p.ytdEarnings.expected, 104) : '') + '</div>' +
      '<div class="htile__ctx">' +
        '<div class="htile__ctxitem"><span class="htile__ctxlabel">THIS QUARTER</span>' +
        '<span class="htile__ctxvalue tnum">' + money(q.earnings) + '</span></div>' +
        '<div class="htile__ctxitem"><span class="htile__ctxlabel">' +
        esc(String(d.periodLabel || '').split(' ')[0].toUpperCase()) + '</span>' +
        '<span class="htile__ctxvalue tnum">' + money(d.month.earnings) + '</span></div>' +
        '<div class="htile__ctxitem"><span class="htile__ctxlabel">AVERAGE LOAN</span>' +
        '<span class="htile__ctxvalue tnum">' + money(q.avgLoanSize) + '</span></div>' +
      '</div></div>';

    var loans = '<div class="htile">' +
      '<p class="htile__label">LOANS FUNDED, YTD</p>' +
      '<p class="htile__value tnum">' + num(y.loansClosed) + '</p>' +
      '<p class="htile__sub">' + (t.loansClosedAnnual ? 'of ' + num(t.loansClosedAnnual) + ' this year' : 'No annual goal set') + '</p>' +
      (t.loansClosedAnnual ? dbar(loanRatio, p.ytdLoansClosed && p.ytdLoansClosed.expected) : '') +
      '<div class="htile__ctx"><div class="htile__ctxitem">' +
        '<span class="htile__ctxlabel">THIS QUARTER</span>' +
        '<span class="htile__ctxvalue tnum">' + num(q.loansClosed) +
        (t.loansClosed ? ' <span class="htile__ctxof">of ' + num(t.loansClosed) + '</span>' : '') + '</span>' +
      '</div></div></div>';

    var volume = '<div class="htile">' +
      '<p class="htile__label">FUNDED VOLUME, YTD</p>' +
      '<p class="htile__value tnum">' + money(y.closedVolume) + '</p>' +
      '<p class="htile__sub">' + (t.closedVolumeAnnual ? 'of ' + money(t.closedVolumeAnnual) + ' this year' : 'No annual goal set') + '</p>' +
      (t.closedVolumeAnnual ? dbar(volRatio, p.ytdClosedVolume && p.ytdClosedVolume.expected) : '') +
      '<div class="htile__ctx"><div class="htile__ctxitem">' +
        '<span class="htile__ctxlabel">THIS QUARTER</span>' +
        '<span class="htile__ctxvalue tnum">' + money(q.closedVolume) + '</span>' +
      '</div></div></div>';

    return '<div class="hero">' + feature + loans + volume + '</div>';
  }

  function tile(cls, title, note, body) {
    return '<section class="tile ' + cls + '">' +
      '<div class="tile__head"><h2 class="tile__title">' + title + '</h2>' +
      (note ? '<span class="tile__note">' + esc(note) + '</span>' : '') + '</div>' +
      '<div class="tile__body">' + body + '</div></section>';
  }

  /* Value on the left, context pills stacked on the right — the pills sat
     under the figure before, which left the card tall and half empty. */
  function moneyTile(cls, title, note, label, value, pills) {
    return '<section class="tile ' + cls + '">' +
      '<div class="tile__head"><h2 class="tile__title">' + title + '</h2>' +
      (note ? '<span class="tile__note">' + esc(note) + '</span>' : '') + '</div>' +
      '<div class="tile__body"><div class="moneytile">' +
        '<div class="moneytile__main">' +
          '<p class="htile__label">' + esc(label) + '</p>' +
          '<p class="htile__value tnum">' + value + '</p>' +
        '</div>' +
        '<div class="moneytile__pills">' + pills + '</div>' +
      '</div></div></section>';
  }

  function ctxPill(label, value) {
    return '<div class="htile__ctxitem"><span class="htile__ctxlabel">' + esc(label) + '</span>' +
      '<span class="htile__ctxvalue tnum">' + value + '</span></div>';
  }

  function potentialTile(d) {
    var pl = d.pipeline;
    return moneyTile('tile--brand', 'POTENTIAL EARNINGS', 'Live loans only',
      'IF EVERYTHING IN PLAY FUNDS', money(pl.potentialEarnings),
      ctxPill('IN PIPELINE', num(pl.loansInPipeline)) +
      ctxPill('PRE-APPROVED', num(pl.activePreApprovals)));
  }

  function lifetimeTile(d) {
    /* An absent `lifetime` means the backend predates this card. Say so —
       rendering dashes would look like a genuine zero. */
    if (!d.lifetime) {
      return '<section class="tile tile--coral">' +
        '<div class="tile__head"><h2 class="tile__title">LIFETIME EARNINGS</h2></div>' +
        '<div class="tile__body"><p class="lifetime__missing">' +
        'The Apps Script needs redeploying before this figure is available. ' +
        'In the script editor: Deploy &rarr; Manage deployments &rarr; pencil &rarr; ' +
        'New version &rarr; Deploy.</p></div></section>';
    }
    var lt = d.lifetime;
    return moneyTile('tile--coral', 'LIFETIME EARNINGS',
      lt.since ? 'Since ' + lt.since : 'Every funded loan on record',
      'TOTAL EARNED TO DATE', money(lt.earnings),
      ctxPill('LOANS FUNDED', num(lt.loansClosed)) +
      ctxPill('VOLUME', money(lt.closedVolume)));
  }

  function statCard(label, value, caption, ratio, expected, accent) {
    var graphic = ratio == null
      ? '<div class="statcard__blank"></div>'
      : ring(ratio, expected, 74, true);
    return '<div class="statcard' + (accent ? ' statcard--accent' : '') + '">' +
      graphic +
      '<div class="statcard__body">' +
        '<p class="statcard__label">' + esc(label) + '</p>' +
        '<p class="statcard__value tnum">' + value + '</p>' +
        '<p class="statcard__cap">' + esc(caption) + '</p>' +
      '</div></div>';
  }

  function pipelineTile(d) {
    var t = d.targets, pl = d.pipeline;

    var cards = '' +
      statCard('Loans in pipeline', num(pl.loansInPipeline),
        t.loansInPipeline ? 'of ' + num(t.loansInPipeline) + ' target' : 'no target set',
        t.loansInPipeline ? pl.loansInPipeline / t.loansInPipeline : null, null) +

      statCard('Pipeline volume', money(pl.pipelineVolume),
        t.pipelineVolume ? 'of ' + money(t.pipelineVolume) + ' target' : 'no target set',
        t.pipelineVolume ? pl.pipelineVolume / t.pipelineVolume : null, null) +

      statCard('Active pre-approvals', num(pl.activePreApprovals),
        t.activePreApprovals ? 'of ' + num(t.activePreApprovals) + ' target' : 'no target set',
        t.activePreApprovals ? pl.activePreApprovals / t.activePreApprovals : null, null) +

      statCard('New applications, YTD',
        d.ytd.newApplications == null ? '—' : num(d.ytd.newApplications),
        d.ytd.newApplications == null ? 'needs a created-date column'
          : (t.newApplicationsAnnual ? 'of ' + num(t.newApplicationsAnnual) + ' target' : 'no target set'),
        (d.ytd.newApplications != null && t.newApplicationsAnnual)
          ? d.ytd.newApplications / t.newApplicationsAnnual : null,
        d.pace.ytdElapsed);

    return tile('tile--12', 'PIPELINE', 'Live now',
      '<div class="statgrid">' + cards + '</div>');
  }

  /* Forecast row. The bar is split: a solid segment for what is actually
     banked, then a hatched segment for the part that has not happened yet.
     Hatching carries the "this is a guess" signal that a label alone
     doesn't — the eye reads it before it reads any words. */
  function forecastRow(label, projected, target, actual, kind) {
    if (projected == null) return '';

    var over = target ? projected >= target : null;
    var scale = Math.max(projected, target || 0) * 1.1;
    var actualPct = scale ? (actual / scale) * 100 : 0;
    var projPct = scale ? ((projected - actual) / scale) * 100 : 0;
    var goalPct = (target && scale) ? (target / scale) * 100 : null;

    var delta = '';
    if (target) {
      var gap = Math.abs(projected - target);
      delta = '<span class="fdelta fdelta--' + (over ? 'over' : 'under') + '">' +
        (over ? '+' : '\u2212') + fmt(gap, kind) + '</span>';
    }

    var tone = over === false ? ' is-under' : '';

    return '<div class="fitem' + tone + '">' +
      '<div class="fitem__top">' +
        '<span class="fitem__label">' + esc(label) + '</span>' + delta +
      '</div>' +
      '<div class="fbar">' +
        '<span class="fbar__actual" style="width:' + Math.max(0, actualPct).toFixed(1) + '%"></span>' +
        '<span class="fbar__proj" style="left:' + Math.max(0, actualPct).toFixed(1) +
          '%;width:' + Math.max(0, projPct).toFixed(1) + '%"></span>' +
        (goalPct != null ? '<span class="fbar__goal" style="left:' + goalPct.toFixed(1) + '%"></span>' : '') +
      '</div>' +
      '<div class="fitem__foot">' +
        '<span class="fitem__banked tnum">' + fmt(actual, kind) + ' <em>banked</em></span>' +
        '<span class="fitem__proj tnum">' + fmt(projected, kind) + ' <em>projected</em></span>' +
        (target ? '<span class="fitem__goal tnum">' + fmt(target, kind) + ' <em>goal</em></span>' : '') +
      '</div>' +
    '</div>';
  }

  function outlookTile(d) {
    var t = d.targets, pr = d.projection || {};

    if (!pr.available) {
      return '<section class="tile tile--forecast tile--6">' +
        '<div class="tile__head"><h2 class="tile__title">FULL YEAR OUTLOOK</h2>' +
        '<span class="fbadge">PROJECTED</span></div>' +
        '<div class="tile__body"><p class="mrow__off">Too early in the year to ' +
        'project a meaningful year-end figure.</p></div></section>';
    }

    return '<section class="tile tile--forecast tile--6">' +
      '<div class="tile__head"><h2 class="tile__title">FULL YEAR OUTLOOK</h2>' +
      '<span class="fbadge">PROJECTED</span></div>' +
      '<div class="tile__body">' +
        forecastRow('Earnings', pr.earnings, t.earningsAnnual, d.ytd.earnings, 'money') +
        forecastRow('Closed volume', pr.closedVolume, t.closedVolumeAnnual, d.ytd.closedVolume, 'money') +
        forecastRow('Loans closed', pr.loansClosed, t.loansClosedAnnual, d.ytd.loansClosed, 'count') +
      '</div></section>';
  }

  function downlineTile(d) {
    var t = d.targets, dl = d.downline;
    if (!dl || dl.available === false) {
      return tile('tile--6 tile--downline', 'DOWNLINE', '',
        notice('warn', '<p>The downline sheet is not connected yet. Set ' +
          '<code>DOWNLINE_TAB_NAME</code> in the downline Apps Script and paste its ' +
          'web app URL into the Connections tab.</p>'));
    }
    return tile('tile--6 tile--downline', 'DOWNLINE', '', '' +
      mrow('New members, quarter', dl.newMembers, t.newDownline, 'count', d.pace.quarterElapsed) +
      mrow('Total members', dl.totalMembers, t.totalDownline, 'count', null));
  }

  /* Status ramp: near-black at the earliest stage, through slate, to the
     Moxie cyan at Funded. Position in the sequence carries the meaning, so
     the bar colour tells you how far along a loan is without reading. */
  function lerpHex(a, b, t) {
    function part(h, i) { return parseInt(h.substr(1 + i * 2, 2), 16); }
    var out = '#';
    for (var i = 0; i < 3; i++) {
      var v = Math.round(part(a, i) + (part(b, i) - part(a, i)) * t);
      out += ('0' + v.toString(16)).slice(-2);
    }
    return out;
  }

  function stageColour(i, n) {
    var t = n > 1 ? i / (n - 1) : 1;
    return t <= 0.5
      ? lerpHex('#0E181D', '#8A99A2', t * 2)
      : lerpHex('#8A99A2', '#28B5CF', (t - 0.5) * 2);
  }

  function funnelTile(d) {
    var f = d.funnel;
    if (!f || !f.stages || !f.stages.length) return '';
    var stages = f.stages.filter(function (s) { return s.tone !== 'dead'; });
    if (!stages.length) return '';

    var max = Math.max.apply(null, stages.map(function (s) { return s.count; })) || 1;
    var total = stages.reduce(function (a, s) { return a + s.count; }, 0);

    var rows = stages.map(function (s, i) {
      var c = stageColour(i, stages.length);
      var share = total ? (s.count / total) * 100 : 0;
      return '<div class="frow">' +
        '<span class="frow__label"><span class="frow__dot" style="background:' + c + '"></span>' +
          esc(s.label) + '</span>' +
        '<div class="frow__track"><div class="frow__fill" style="width:' +
          ((s.count / max) * 100).toFixed(1) + '%;background:' + c + '"></div></div>' +
        '<span class="frow__val tnum">' + num(s.count) +
        '<span class="frow__share tnum">' + pct(share) + '</span></span></div>';
    }).join('');

    return tile('tile--12', 'LOANS BY STATUS', num(total) + ' loans',
      '<div class="funnel">' + rows + '</div>');
  }

  function trendTile(d) {
    var tr = d.trend;
    if (!tr || !tr.months || !tr.months.length) return '';
    var vals = [];
    tr.months.forEach(function (m) {
      vals.push(m.current || 0);
      if (m.prior != null) vals.push(m.prior);
    });
    var max = Math.max.apply(null, vals) || 1;
    var hasPrior = tr.months.some(function (m) { return m.prior != null; });

    var grid = '';
    [1, 0.75, 0.5, 0.25].forEach(function (f) {
      grid += '<div class="chart__line" style="top:' + ((1 - f) * 100).toFixed(0) + '%">' +
        '<span class="chart__gl tnum">' + moneyShort(max * f) + '</span></div>';
    });

    var cols = tr.months.map(function (m) {
      var cur = '<div class="chart__bar" style="height:' +
        Math.max(3, (m.current / max) * 100).toFixed(1) + '%" title="' +
        esc(m.label + ': ' + money(m.current)) + '"></div>';
      var pri = m.prior != null
        ? '<div class="chart__bar chart__bar--prior" style="height:' +
          Math.max(3, (m.prior / max) * 100).toFixed(1) + '%" title="' +
          esc('Same month last year: ' + money(m.prior)) + '"></div>'
        : '';
      return '<div class="chart__col"><div class="chart__pair">' + pri + cur + '</div>' +
        '<span class="chart__xlab">' + esc(m.label) + '</span></div>';
    }).join('');

    var legend = '<div class="legend"><span class="legend__k">' +
      '<span class="legend__sw"></span>This year</span>' +
      (hasPrior
        ? '<span class="legend__k"><span class="legend__sw legend__sw--prior"></span>Same month last year</span>'
        : '<span class="legend__k muted">No prior-year history for this unit</span>') +
      '</div>';

    return tile('tile--8', 'FUNDED VOLUME BY MONTH', 'Rolling twelve months',
      '<div class="chart"><div class="chart__grid">' + grid + '</div>' +
      '<div class="chart__plot">' + cols + '</div></div>' + legend);
  }

  function scorecardHtml(d) {
    return stage(brandbar(d.unit.name, d.periodLabel) + heroBento(d)) +
      '<div class="inner"><div class="bento">' +
        trendTile(d) +
        '<div class="tile-stack">' + potentialTile(d) + lifetimeTile(d) + '</div>' +
        pipelineTile(d) +
        funnelTile(d) +
        outlookTile(d) +
        downlineTile(d) +
      '</div>' +
      '<p class="foot">Generated ' + esc(d.generatedAt) + '. Figures come straight from the loan pipeline; ' +
      'if something looks wrong, check the file in the sheet first.</p></div>';
  }

  /* ============================================================
   * 6. Scorecard mode
   * ============================================================ */

  function bootScorecard(token) {
    api('scorecard', { t: token, period: qs('period') || '' })
      .then(function (data) {
        app.setAttribute('data-state', 'ready');
        app.innerHTML = scorecardHtml(data);
      })
      .catch(function (err) {
        app.setAttribute('data-state', 'error');
        app.innerHTML = stage(brandbar('Scorecard unavailable', '')) + '<div class="wrap">' +
          notice('error', '<p>' + esc(err.message) + '</p>' +
            '<p>If your link has stopped working, it may have been regenerated. ' +
            'Ask for a fresh one.</p>') + '</div>';
      });
  }

  /* ============================================================
   * 7. Admin mode
   * ============================================================ */

  var state = { config: null, roster: [], activeTab: 'roster', preview: null };

  function adminShell() {
    return stage(brandbar('Scorecard admin', 'MOXIE BDM / sBDM PERFORMANCE')) +
      '<div class="wrap">' +
      '<div class="tabs" role="tablist">' +
        tabBtn('roster', 'People &amp; links') +
        tabBtn('targets', 'Targets &amp; rates') +
        tabBtn('email', 'Email template') +
        tabBtn('send', 'Monthly send') +
        tabBtn('connections', 'Connections') +
        tabBtn('view', 'View a scorecard') +
      '</div>' +
      '<div id="panels"></div>' +
      '</div>';
  }

  function tabBtn(id, label) {
    return '<button class="tab" role="tab" data-tab="' + id + '" ' +
      'aria-selected="' + (state.activeTab === id ? 'true' : 'false') + '">' + label + '</button>';
  }

  function askForKey(message) {
    app.setAttribute('data-state', 'ready');
    app.innerHTML = stage(brandbar('Scorecard admin', 'SIGN IN')) + '<div class="wrap">' +
      '<section class="tile" style="margin-top:18px;max-width:460px">' +
      '<div class="tile__head"><h2 class="tile__title">ADMIN KEY</h2></div>' +
      '<div class="tile__body">' +
      (message ? notice('error', '<p>' + esc(message) + '</p>') : '') +
      '<div class="field" style="margin-top:12px"><label for="k">Enter your admin key</label>' +
      '<input id="k" type="password" autocomplete="current-password"></div>' +
      '<div class="row"><button class="btn" id="go">Open the console</button></div>' +
      '</div></section></div>';

    function submit() {
      var v = $('#k').value.trim();
      if (!v) return;
      adminKey(v);
      bootAdmin();
    }
    $('#go').addEventListener('click', submit);
    $('#k').addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); });
    $('#k').focus();
  }

  function bootAdmin() {
    if (!adminKey()) return askForKey('');
    app.setAttribute('data-state', 'loading');
    api('config', { key: adminKey() })
      .then(function (data) {
        state.config = data.config;
        state.roster = data.config.units || [];
        state.diagnostics = data.diagnostics || {};
        app.setAttribute('data-state', 'ready');
        app.innerHTML = adminShell();
        wireTabs();
        renderPanel();
      })
      .catch(function (err) {
        adminKey('');
        askForKey(err.message);
      });
  }

  function wireTabs() {
    Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (btn) {
      btn.addEventListener('click', function () {
        state.activeTab = btn.getAttribute('data-tab');
        Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (b) {
          b.setAttribute('aria-selected', b === btn ? 'true' : 'false');
        });
        renderPanel();
      });
    });
  }

  function renderPanel() {
    var host = $('#panels');
    if (!host) return;
    var map = {
      roster: panelRoster,
      targets: panelTargets,
      email: panelEmail,
      send: panelSend,
      connections: panelConnections,
      view: panelView
    };
    (map[state.activeTab] || panelRoster)(host);
  }

  function savebar(id) {
    return '<div class="savebar">' +
      '<button class="btn" id="' + id + '">Save changes</button>' +
      '<span class="savebar__status" id="' + id + '-status"></span></div>';
  }

  function doSave(btnId, buildPayload) {
    var btn = $('#' + btnId), status = $('#' + btnId + '-status');
    btn.addEventListener('click', function () {
      var payload;
      try {
        payload = buildPayload();
      } catch (e) {
        status.className = 'savebar__status savebar__status--bad';
        status.textContent = e.message;
        return;
      }
      btn.disabled = true;
      status.className = 'savebar__status savebar__status--busy';
      status.textContent = 'Saving…';
      apiPost('saveConfig', payload)
        .then(function (res) {
          /* The backend re-reads what it wrote and returns it. We compare,
             so a silent write failure surfaces instead of showing "Saved". */
          if (!res.verified) throw new Error('The backend accepted the write but could not read it back. Nothing was saved.');
          state.config = res.config;
          state.roster = res.config.units || [];
          status.className = 'savebar__status savebar__status--ok';
          status.textContent = 'Saved and verified at ' + new Date().toLocaleTimeString();
        })
        .catch(function (err) {
          status.className = 'savebar__status savebar__status--bad';
          status.textContent = 'Not saved. ' + err.message;
        })
        .then(function () { btn.disabled = false; });
    });
  }

  /* ---------- Roster ---------- */

  function panelRoster(host) {
    var unmatched = (state.diagnostics && state.diagnostics.unmatchedNames) || [];
    var rows = state.roster.map(function (u, i) {
      var link = location.origin + location.pathname + '?t=' + encodeURIComponent(u.token || '');
      var off = u.active === false;
      return '<tr data-i="' + i + '"' + (off ? ' class="is-inactive"' : '') + '>' +
        '<td class="right"><input data-f="active" type="checkbox"' + (off ? '' : ' checked') +
          ' title="Uncheck when someone leaves"></td>' +
        '<td><input data-f="name" value="' + esc(u.name) + '" placeholder="Exactly as it appears in AE / AG"></td>' +
        '<td><input data-f="emails" value="' + esc((u.emails || []).join(', ')) + '" placeholder="one@moxie.com, two@moxie.com"></td>' +
        '<td class="right"><span class="pill ' + (u.token ? 'pill--ok' : 'pill--idle') + '">' +
          (u.token ? 'Link active' : 'No link') + '</span><br>' +
        (u.token ? '<span class="roster-link">' + esc(link) + '</span>' : '') + '</td>' +
        '<td class="right">' +
          '<button class="btn btn--ghost btn--sm" data-act="regen">Regenerate link</button> ' +
          '<button class="btn btn--warn btn--sm" data-act="remove">Remove</button></td>' +
        '</tr>';
    }).join('');

    host.innerHTML = '<div class="panel">' +
      (unmatched.length ? notice('warn',
        '<p><strong>' + unmatched.length + ' name' + (unmatched.length === 1 ? '' : 's') +
        ' in columns AE/AG match nobody in this list.</strong> Loans belonging to ' +
        'them are not appearing on any scorecard.</p><ul class="notice__list">' +
        unmatched.map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('') + '</ul>') : '') +
      notice('info', '<p>Unticking <strong>Active</strong> stops that person\'s monthly email ' +
        'and disables their link, while keeping their history and settings. Use it when ' +
        'someone leaves rather than deleting them.</p>') +
      notice('info', '<p>Names must match the pipeline sheet exactly. A pair is one entry: ' +
        'type it the way the sheet does, such as <em>Chad Shimabukuro / Colette Ching</em>. ' +
        'Both people get the same report at both addresses. Order around the slash does not matter.</p>') +
      '<div class="scroll-x"><table class="grid-table">' +
        '<thead><tr><th class="right" style="width:52px">Active</th>' +
        '<th style="width:26%">Name in pipeline</th><th style="width:28%">Email addresses</th>' +
        '<th class="right">Private link</th><th class="right">Actions</th></tr></thead>' +
        '<tbody id="roster-body">' + rows + '</tbody></table></div>' +
      '<div class="row"><button class="btn btn--ghost" id="add-unit">Add a person or pair</button>' +
      '<button class="btn btn--ghost" id="import-names">Import every name from the pipeline</button>' +
      '<span id="import-status" class="muted"></span></div>' +
      savebar('save-roster') +
      '</div>';

    $('#add-unit').addEventListener('click', function () {
      collectRoster();
      state.roster.push({ name: '', emails: [], bdmBps: 0, sbdmBps: 0, targets: {}, token: '' });
      panelRoster(host);
    });

    Array.prototype.forEach.call(host.querySelectorAll('[data-act]'), function (btn) {
      btn.addEventListener('click', function () {
        var i = Number(btn.closest('tr').getAttribute('data-i'));
        collectRoster();
        if (btn.getAttribute('data-act') === 'remove') {
          state.roster.splice(i, 1);
        } else {
          state.roster[i].token = 'REGENERATE';
        }
        panelRoster(host);
      });
    });

    $('#import-names').addEventListener('click', function () {
      var btn = this, status = $('#import-status');
      if (!window.confirm('Add every name found in columns AE/AG that isn\'t already ' +
        'on the roster? Spelling comes straight from the sheet, so nothing can mismatch.')) return;
      btn.disabled = true;
      status.textContent = 'Importing…';
      apiPost('importNames', {})
        .then(function (res) {
          if (!res.verified) throw new Error('The backend could not read back what it wrote.');
          state.config = res.config;
          state.roster = res.config.units || [];
          status.textContent = res.added.length
            ? 'Added ' + res.added.length + '. Set emails and targets next.'
            : 'Nothing to add — every name already matches.';
          panelRoster(host);
        })
        .catch(function (err) { status.textContent = 'Failed. ' + err.message; })
        .then(function () { btn.disabled = false; });
    });

    doSave('save-roster', function () {
      collectRoster();
      var names = {};
      state.roster.forEach(function (u) {
        if (!u.name) throw new Error('Every row needs a name that matches the pipeline sheet.');
        var k = u.name.toLowerCase();
        if (names[k]) throw new Error('“' + u.name + '” is listed twice.');
        names[k] = true;
      });
      return { units: state.roster };
    });
  }

  function collectRoster() {
    Array.prototype.forEach.call(document.querySelectorAll('#roster-body tr'), function (tr) {
      var i = Number(tr.getAttribute('data-i'));
      var u = state.roster[i];
      if (!u) return;
      u.name = $('[data-f="name"]', tr).value.trim();
      u.emails = $('[data-f="emails"]', tr).value.split(',')
        .map(function (s) { return s.trim(); }).filter(Boolean);
      u.active = $('[data-f="active"]', tr).checked;
    });
  }

  /* ---------- Targets ---------- */

  /* Mirrors the derivation in Pipeline.gs so the admin can see the
     downstream numbers before saving. Kept deliberately identical — if one
     changes, the other must. */
  function deriveTargets(u, settings) {
    function share(k, d) { var v = settings[k]; return (v == null || v === '' ? d : Number(v)) / 100; }
    var closeRate = share('closeRate', 25);
    var inPipelineRate = share('inPipelineRate', 40);
    var preApprovedRate = share('preApprovedRate', 20);
    var basis = settings.preApprovedBasis || 'net';

    var bps = Number(u.bdmBps) || Number(u.sbdmBps) || 0;
    var t = u.targets || {};
    var earnings = t.earningsAnnual === '' || t.earningsAnnual == null ? null : Number(t.earningsAnnual);
    var avg = t.avgLoanAmount === '' || t.avgLoanAmount == null ? null : Number(t.avgLoanAmount);

    var closedVolume = (earnings != null && bps) ? earnings / (bps / 10000) : null;
    var loansClosed = (closedVolume != null && avg) ? closedVolume / avg : null;
    var newApplications = (loansClosed != null && closeRate) ? loansClosed / closeRate : null;
    var dwellDays = settings.dwellDays == null || settings.dwellDays === '' ? 146 : Number(settings.dwellDays);
    var pipelineBasis = settings.pipelineBasis || 'share';
    var loansInPipeline = newApplications == null ? null
      : (pipelineBasis === 'share'
          ? newApplications * inPipelineRate
          : newApplications * (dwellDays / 365));
    var pipelineVolume = (loansInPipeline != null && avg) ? loansInPipeline * avg : null;
    var rescindRate = share('rescindRate', 35);
    var rescinded = newApplications == null ? null : newApplications * rescindRate;
    var surviving = newApplications == null ? null : newApplications * (1 - rescindRate);

    var base = basis === 'pipeline' ? loansInPipeline
             : basis === 'applications' ? newApplications
             : surviving;
    var preApprovals = base == null ? null : base * preApprovedRate;
    var earlyStage = (loansInPipeline == null || preApprovals == null)
      ? null : Math.max(0, loansInPipeline - preApprovals);

    return {
      closedVolume: closedVolume, loansClosed: loansClosed,
      newApplications: newApplications, loansInPipeline: loansInPipeline,
      pipelineVolume: pipelineVolume, preApprovals: preApprovals,
      expectedRescinds: rescinded, survivingApps: surviving, earlyStage: earlyStage,
      dwellDays: dwellDays, pipelineBasis: pipelineBasis
    };
  }

  function panelTargets(host) {
    var st = state.config.settings || {};

    host.innerHTML = '<div class="panel">' +

      /* ---- Section one: the model ---- */
      '<section class="sect">' +
        '<div class="sect__head">' +
          '<h3 class="sect__title">The funnel model</h3>' +
          '<p class="sect__note">These rates apply to everyone. They turn each ' +
            'person\'s earnings goal into the rest of their targets.</p>' +
        '</div>' +
        '<div class="sect__body">' +
          '<div class="fieldgrid">' +
            '<div class="field"><label for="cr">Applications that close</label>' +
            '<div class="unitwrap"><input id="cr" type="number" min="1" max="100" step="1" value="' +
              esc(st.closeRate == null ? 25 : st.closeRate) + '"><span class="unit">%</span></div></div>' +
            '<div class="field"><label for="rr">Applications rescinded</label>' +
            '<div class="unitwrap"><input id="rr" type="number" min="0" max="100" step="1" value="' +
              esc(st.rescindRate == null ? 35 : st.rescindRate) + '"><span class="unit">%</span></div></div>' +
            '<div class="field"><label for="ip">Still in pipeline</label>' +
            '<div class="unitwrap"><input id="ip" type="number" min="0" max="100" step="1" value="' +
              esc(st.inPipelineRate == null ? 40 : st.inPipelineRate) + '"><span class="unit">%</span></div></div>' +
          '</div>' +
          '<div id="funnel-check"></div>' +
          '<div class="fieldgrid" style="margin-top:14px">' +
            '<div class="field"><label for="pa">Pre-approved or processing</label>' +
            '<div class="unitwrap"><input id="pa" type="number" min="0" max="100" step="1" value="' +
              esc(st.preApprovedRate == null ? 20 : st.preApprovedRate) + '"><span class="unit">%</span></div></div>' +
            '<div class="field"><label for="pb">measured against</label>' +
            '<select id="pb">' +
              '<option value="net"' + ((st.preApprovedBasis || 'net') === 'net' ? ' selected' : '') + '>apps less rescinds</option>' +
              '<option value="applications"' + (st.preApprovedBasis === 'applications' ? ' selected' : '') + '>all applications</option>' +
              '<option value="pipeline"' + (st.preApprovedBasis === 'pipeline' ? ' selected' : '') + '>loans in pipeline</option>' +
            '</select></div>' +
            '<div class="field"><label for="pbasis">Pipeline size from</label>' +
            '<select id="pbasis">' +
              '<option value="share"' + ((st.pipelineBasis || 'share') === 'share' ? ' selected' : '') + '>the in-pipeline %</option>' +
              '<option value="dwell"' + (st.pipelineBasis === 'dwell' ? ' selected' : '') + '>dwell across all loans</option>' +
            '</select></div>' +
            '<div class="field"><label for="dw">Dwell, all loans</label>' +
            '<div class="unitwrap"><input id="dw" type="number" min="1" max="1095" step="1" value="' +
              esc(st.dwellDays == null ? 146 : st.dwellDays) + '"><span class="unit">days</span></div></div>' +
            '<div class="field"><label for="tc">Target cycle time</label>' +
            '<div class="unitwrap"><input id="tc" type="number" min="1" max="365" step="1" value="' +
              esc(st.targetCycleDays == null ? 58 : st.targetCycleDays) + '"><span class="unit">days</span></div></div>' +
          '</div>' +
        '</div>' +
      '</section>' +

      /* ---- Section two: people ---- */
      '<section class="sect">' +
        '<div class="sect__head sect__head--split">' +
          '<div>' +
            '<h3 class="sect__title">People</h3>' +
            '<p class="sect__note">Enter a comp rate and an earnings goal. ' +
              'Average loan amount is prefilled from funded loans in the sheet.</p>' +
          '</div>' +
          '<div class="searchbox">' +
            '<input id="roster-search" type="search" placeholder="Search by name" autocomplete="off">' +
            '<span class="searchbox__count" id="search-count"></span>' +
          '</div>' +
        '</div>' +
        '<div id="measure-warn"></div>' +
        '<div id="bps-warn"></div>' +
        '<div class="scroll-x"><table class="grid-table grid-table--targets">' +
          '<thead>' +
            '<tr class="grouprow">' +
              '<th></th>' +
              '<th colspan="2" class="grouphead">Compensation</th>' +
              '<th colspan="2" class="grouphead">Goal inputs</th>' +
              '<th colspan="2" class="grouphead">Downline</th>' +
            '</tr>' +
            '<tr>' +
              '<th style="width:20%">Person or pair</th>' +
              '<th class="num">BDM bps</th><th class="num">sBDM bps</th>' +
              '<th class="num">Earnings goal, year</th><th class="num">Average loan</th>' +
              '<th class="num">New, year</th><th class="num">Total</th>' +
            '</tr>' +
          '</thead>' +
          '<tbody id="targets-body"></tbody>' +
        '</table></div>' +
      '</section>' +

      savebar('save-targets') + '</div>';

    function settingsNow() {
      return {
        closeRate: Number($('#cr').value),
        rescindRate: Number($('#rr').value),
        inPipelineRate: Number($('#ip').value),
        preApprovedRate: Number($('#pa').value),
        preApprovedBasis: $('#pb').value,
        pipelineBasis: $('#pbasis').value,
        dwellDays: Number($('#dw').value),
        targetCycleDays: Number($('#tc').value)
      };
    }

    function checkFunnel(st2) {
      var sum = st2.closeRate + st2.rescindRate + st2.inPipelineRate;
      var host2 = $('#funnel-check');
      var mismatch = '';
      if (st2.pipelineBasis === 'dwell') {
        mismatch = notice('warn', '<p>A ' + Math.round(st2.dwellDays) + '-day dwell puts ' +
          ((st2.dwellDays / 365) * 100).toFixed(0) + '% of applications in the pipeline at ' +
          'any moment, against the ' + Math.round(st2.inPipelineRate) + '% above. This figure ' +
          'must cover <strong>every</strong> application, including ones that stall or die.</p>');
      }
      host2.innerHTML = (Math.round(sum) === 100
        ? notice('ok', '<p>Closed, rescinded and in-pipeline total 100%.</p>')
        : notice('warn', '<p>These total ' + Math.round(sum) + '%, not 100%. Every application ' +
            'ends in exactly one of the three, so the targets below are distorted ' +
            'until they balance.</p>')) + mismatch;
    }

    /* Rows are rebuilt rather than patched, so the search filter and the
       derived figures can never disagree with the inputs. */
    function drawRows() {
      var q = ($('#roster-search').value || '').trim().toLowerCase();
      var shown = 0;
      var html = state.roster.map(function (u, i) {
        if (q && String(u.name || '').toLowerCase().indexOf(q) === -1) return '';
        shown++;
        var t = u.targets || {};
        var m = state.measured && state.measured[u.name];
        var avgVal = t.avgLoanAmount == null || t.avgLoanAmount === ''
          ? (m ? Math.round(m.avg) : '') : t.avgLoanAmount;

        /* Three different states, three different messages. Saying "no
           funded loans" when the lookup never ran would be a failure
           dressed up as an answer. */
        var hint;
        if (state.measuredError) {
          hint = '<div class="hint hint--none">not checked</div>';
        } else if (state.measured == null) {
          hint = '<div class="hint hint--none">checking&hellip;</div>';
        } else if (m) {
          hint = '<div class="hint">from ' + num(m.count) + ' funded &middot; ' + money(m.avg) +
            ' <button type="button" class="linkbtn" data-use="' + i + '">use</button></div>';
        } else {
          hint = '<div class="hint hint--none">no funded loans found</div>';
        }

        return '<tr data-i="' + i + '"' + (u.active === false ? ' class="is-inactive"' : '') + '>' +
          '<td class="namecell">' + esc(u.name || '—') +
            (u.active === false ? ' <span class="tagoff">inactive</span>' : '') + '</td>' +
          '<td class="num"><input data-f="bdmBps" type="number" min="0" step="1" value="' + esc(u.bdmBps || 0) + '"></td>' +
          '<td class="num"><input data-f="sbdmBps" type="number" min="0" step="1" value="' + esc(u.sbdmBps || 0) + '"></td>' +
          '<td class="num"><input data-t="earningsAnnual" type="number" min="0" step="500" value="' +
            esc(t.earningsAnnual == null ? '' : t.earningsAnnual) + '"></td>' +
          '<td class="num"><input data-t="avgLoanAmount" type="number" min="0" step="1000" value="' +
            esc(avgVal) + '">' + hint + '</td>' +
          '<td class="num"><input data-t="newDownlineAnnual" type="number" min="0" step="1" value="' +
            esc(t.newDownlineAnnual == null ? '' : t.newDownlineAnnual) + '"></td>' +
          '<td class="num"><input data-t="totalDownline" type="number" min="0" step="1" value="' +
            esc(t.totalDownline == null ? '' : t.totalDownline) + '"></td>' +
          '</tr>' +
          '<tr class="derived" data-d="' + i + '"><td colspan="7"></td></tr>';
      }).join('');

      $('#targets-body').innerHTML = html ||
        '<tr><td colspan="7" class="emptyrow">Nobody matches &ldquo;' + esc(q) + '&rdquo;.</td></tr>';
      $('#search-count').textContent = shown + ' of ' + state.roster.length;
      paint();
    }

    function readRow(tr) {
      var u = state.roster[Number(tr.getAttribute('data-i'))];
      if (!u) return null;
      u.bdmBps = Number($('[data-f="bdmBps"]', tr).value) || 0;
      u.sbdmBps = Number($('[data-f="sbdmBps"]', tr).value) || 0;
      u.targets = u.targets || {};
      ['earningsAnnual', 'avgLoanAmount', 'newDownlineAnnual', 'totalDownline'].forEach(function (k) {
        var raw = $('[data-t="' + k + '"]', tr).value.trim();
        u.targets[k] = raw === '' ? null : Number(raw);
      });
      return u;
    }

    /* A rate below 1 is almost certainly a percentage typed into a basis
       points field — 0.35 instead of 35 — which inflates every derived
       target a hundredfold. */
    function checkBps() {
      var bad = state.roster.filter(function (u) {
        return (u.bdmBps > 0 && u.bdmBps < 1) || (u.sbdmBps > 0 && u.sbdmBps < 1);
      });
      $('#bps-warn').innerHTML = bad.length
        ? notice('warn', '<p><strong>' + bad.length + ' rate' + (bad.length === 1 ? ' looks' : 's look') +
            ' like a percentage rather than basis points.</strong> These are basis points: ' +
            '0.35% is <strong>35</strong>, not 0.35. Entering 0.35 makes every derived target ' +
            'a hundred times too large.</p><ul class="notice__list">' +
            bad.map(function (u) { return '<li>' + esc(u.name) + '</li>'; }).join('') + '</ul>')
        : '';
    }

    function paint() {
      var st2 = settingsNow();
      checkFunnel(st2);
      Array.prototype.forEach.call(document.querySelectorAll('#targets-body tr[data-i]'), function (tr) {
        var u = readRow(tr);
        var cell = document.querySelector('tr[data-d="' + tr.getAttribute('data-i') + '"] td');
        if (!u || !cell) return;
        var dv = deriveTargets(u, st2);
        if (dv.closedVolume == null) {
          cell.innerHTML = '<span class="derived__none">Enter a comp rate and an earnings goal to derive the rest.</span>';
          return;
        }
        function n(v) { return v == null ? null : Math.round(v); }
        function bit(label, val, kind) {
          return '<span class="derived__bit"><em>' + label + '</em>' +
            (val == null ? '—' : fmt(val, kind)) + '</span>';
        }
        cell.innerHTML = '<div class="derived__row">' +
          bit('Closed volume', dv.closedVolume, 'money') +
          bit('Loans closed', n(dv.loansClosed), 'count') +
          bit('Applications', n(dv.newApplications), 'count') +
          bit('Rescinds', n(dv.expectedRescinds), 'count') +
          bit('In pipeline', n(dv.loansInPipeline), 'count') +
          bit('Pipeline volume', dv.pipelineVolume, 'money') +
          bit('Pre-approved', n(dv.preApprovals), 'count') +
          bit('Early stage', n(dv.earlyStage), 'count') +
          '</div>';
      });
      checkBps();

      var mw = $('#measure-warn');
      if (mw) {
        mw.innerHTML = state.measuredError
          ? notice('error', '<p><strong>Could not read average loan sizes from the sheet.</strong> ' +
              esc(state.measuredError) + '</p><p>This usually means the Apps Script has been ' +
              'edited but not redeployed. In the script editor: Deploy &rarr; Manage deployments ' +
              '&rarr; pencil icon &rarr; Version: New version &rarr; Deploy. Averages are not ' +
              'being prefilled until then.</p>')
          : '';
      }
    }

    host.addEventListener('input', function (e) {
      if (e.target && e.target.id === 'roster-search') { drawRows(); return; }
      paint();
    });
    host.addEventListener('change', paint);

    host.addEventListener('click', function (e) {
      var i = e.target && e.target.getAttribute && e.target.getAttribute('data-use');
      if (i == null) return;
      var u = state.roster[Number(i)];
      var m = state.measured && state.measured[u.name];
      if (!u || !m) return;
      u.targets = u.targets || {};
      u.targets.avgLoanAmount = Math.round(m.avg);
      drawRows();
    });

    /* Measured averages arrive after the table, so it renders immediately
       and the prefill fills in a moment later. */
    drawRows();
    if (state.measured == null && !state.measuredError) {
      api('measuredAverages', { key: adminKey() })
        .then(function (res) {
          state.measured = res.averages || {};
          state.measuredError = null;
          drawRows();
        })
        .catch(function (err) {
          state.measuredError = err.message || 'Unknown error.';
          drawRows();
        });
    }

    doSave('save-targets', function () {
      Array.prototype.forEach.call(document.querySelectorAll('#targets-body tr[data-i]'), readRow);
      return { units: state.roster, settings: settingsNow() };
    });
  }

  /* ---------- Email template ---------- */

  function panelEmail(host) {
    var e = state.config.email || {};
    host.innerHTML = '<div class="panel">' +
      '<div class="row">' +
        '<div class="field field--grow"><label for="subj">Subject line</label>' +
        '<input id="subj" value="' + esc(e.subject || '') + '"></div>' +
      '</div>' +
      '<div class="row">' +
        '<div class="field field--grow"><label for="intro">Opening note, above the numbers</label>' +
        '<textarea id="intro">' + esc(e.intro || '') + '</textarea></div>' +
        '<div class="field field--grow"><label for="signoff">Sign-off, below the numbers</label>' +
        '<textarea id="signoff">' + esc(e.signoff || '') + '</textarea></div>' +
      '</div>' +
      notice('info', '<p>Merge fields you can use in any of the three boxes:</p>' +
        '<ul class="notice__list">' +
        '<li><code>{{name}}</code> — the person or pair</li>' +
        '<li><code>{{period}}</code> — e.g. August 2026</li>' +
        '<li><code>{{quarter}}</code> — e.g. Q3 2026</li>' +
        '<li><code>{{loansClosed}}</code>, <code>{{closedVolume}}</code>, <code>{{earnings}}</code> — this month</li>' +
        '<li><code>{{ytdLoans}}</code>, <code>{{ytdVolume}}</code>, <code>{{ytdEarnings}}</code></li>' +
        '<li><code>{{pipelineVolume}}</code>, <code>{{potentialEarnings}}</code></li>' +
        '<li><code>{{link}}</code> — their private scorecard link</li>' +
        '</ul>') +
      '<div class="row"><button class="btn btn--ghost" id="do-preview">Preview with real numbers</button>' +
      '<select id="preview-who" style="padding:9px 11px;border-radius:6px;border:1px solid #E1E7EC">' +
        state.roster.map(function (u, i) {
          return '<option value="' + i + '">' + esc(u.name || '(unnamed)') + '</option>';
        }).join('') + '</select></div>' +
      '<div id="preview-host"></div>' +
      savebar('save-email') + '</div>';

    $('#do-preview').addEventListener('click', function () {
      var i = Number($('#preview-who').value);
      var u = state.roster[i];
      if (!u) return;
      var host2 = $('#preview-host');
      host2.innerHTML = notice('info', '<p>Rendering…</p>');
      apiPost('previewEmail', {
        name: u.name,
        email: { subject: $('#subj').value, intro: $('#intro').value, signoff: $('#signoff').value }
      }).then(function (res) {
        host2.innerHTML = '<div class="preview"><iframe id="pv" title="Email preview"></iframe></div>';
        var doc = $('#pv').contentDocument;
        doc.open(); doc.write(res.html); doc.close();
      }).catch(function (err) {
        host2.innerHTML = notice('error', '<p>' + esc(err.message) + '</p>');
      });
    });

    doSave('save-email', function () {
      return {
        email: {
          subject: $('#subj').value,
          intro: $('#intro').value,
          signoff: $('#signoff').value
        }
      };
    });
  }

  /* ---------- Monthly send ---------- */

  function panelSend(host) {
    var s = state.config.send || {};
    host.innerHTML = '<div class="panel">' +
      notice('info', '<p>Scheduled for the second Friday of each month at 1:00 pm, ' +
        'America/New_York, so it follows daylight saving instead of drifting an hour each spring. ' +
        'The trigger runs daily and exits on every day that is not the second Friday.</p>') +
      '<div class="row">' +
        '<div class="field"><label for="testmode">Delivery mode</label><select id="testmode">' +
          '<option value="test"' + (s.testMode !== false ? ' selected' : '') + '>Test — send everything to me</option>' +
          '<option value="live"' + (s.testMode === false ? ' selected' : '') + '>Live — send to each person</option>' +
        '</select></div>' +
        '<div class="field field--grow"><label for="testaddr">Test address</label>' +
        '<input id="testaddr" value="' + esc(s.testAddress || '') + '"></div>' +
      '</div>' +
      '<div class="row">' +
        '<button class="btn btn--ghost" id="dry">Show me who would receive what</button> ' +
        '<button class="btn" id="sendnow">Send now</button>' +
      '</div>' +
      '<div id="send-out"></div>' +
      savebar('save-send') + '</div>';

    $('#dry').addEventListener('click', function () {
      var out = $('#send-out');
      out.innerHTML = notice('info', '<p>Checking…</p>');
      api('sendPlan', { key: adminKey() }).then(function (res) {
        out.innerHTML = renderSendPlan(res);
      }).catch(function (err) {
        out.innerHTML = notice('error', '<p>' + esc(err.message) + '</p>');
      });
    });

    $('#sendnow').addEventListener('click', function () {
      var mode = $('#testmode').value;
      var msg = mode === 'live'
        ? 'This sends live email to every person on the roster. Continue?'
        : 'This sends every scorecard to the test address only. Continue?';
      if (!window.confirm(msg)) return;
      var out = $('#send-out');
      out.innerHTML = notice('info', '<p>Sending…</p>');
      apiPost('sendNow', {}).then(function (res) {
        out.innerHTML = renderSendResult(res);
      }).catch(function (err) {
        out.innerHTML = notice('error', '<p>' + esc(err.message) + '</p>');
      });
    });

    doSave('save-send', function () {
      return {
        send: {
          testMode: $('#testmode').value === 'test',
          testAddress: $('#testaddr').value.trim()
        }
      };
    });
  }

  function renderSendPlan(res) {
    if (!res.rows || !res.rows.length) {
      return notice('warn', '<p>Nobody would receive anything. Add people on the ' +
        '<em>People &amp; links</em> tab and give each one an address.</p>');
    }
    var rows = res.rows.map(function (r) {
      return '<tr><td>' + esc(r.name) + '</td><td>' + esc(r.to.join(', ') || '—') + '</td>' +
        '<td class="right">' + num(r.loansClosed) + '</td>' +
        '<td class="right">' + money(r.earnings) + '</td>' +
        '<td class="right"><span class="pill ' + (r.willSend ? 'pill--ok' : 'pill--bad') + '">' +
        esc(r.willSend ? 'Will send' : r.reason) + '</span></td></tr>';
    }).join('');
    return '<div class="scroll-x" style="margin-top:14px"><table class="grid-table"><thead><tr>' +
      '<th>Person or pair</th><th>Goes to</th><th class="right">Loans</th>' +
      '<th class="right">Earnings</th><th class="right">Status</th></tr></thead><tbody>' +
      rows + '</tbody></table></div>' +
      (res.mode === 'test'
        ? notice('warn', '<p>Test mode is on, so all of this goes to ' + esc(res.testAddress || 'nowhere — set a test address') + '.</p>')
        : notice('warn', '<p>Live mode. Each row goes to the addresses shown.</p>'));
  }

  function renderSendResult(res) {
    var rows = (res.results || []).map(function (r) {
      return '<tr><td>' + esc(r.name) + '</td><td>' + esc(r.to.join(', ')) + '</td>' +
        '<td class="right"><span class="pill ' + (r.sent ? 'pill--ok' : 'pill--bad') + '">' +
        esc(r.sent ? 'Delivered to Gmail' : 'Failed') + '</span></td>' +
        '<td>' + esc(r.error || '') + '</td></tr>';
    }).join('');
    var failed = (res.results || []).filter(function (r) { return !r.sent; }).length;
    return (failed
        ? notice('error', '<p>' + failed + ' message' + (failed === 1 ? '' : 's') + ' did not go out. Details below.</p>')
        : notice('ok', '<p>All ' + (res.results || []).length + ' messages handed to Gmail. ' +
            'Remaining quota today: ' + esc(res.quotaRemaining) + '.</p>')) +
      '<div class="scroll-x" style="margin-top:12px"><table class="grid-table"><thead><tr>' +
      '<th>Person or pair</th><th>Sent to</th><th class="right">Result</th><th>Detail</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table></div>';
  }

  /* ---------- Connections ---------- */

  function panelConnections(host) {
    var d = state.diagnostics || {};
    var c = state.config.connections || {};
    host.innerHTML = '<div class="panel">' +
      '<div class="row"><div class="field field--grow">' +
        '<label for="dlurl">Downline Apps Script web app URL</label>' +
        '<input id="dlurl" value="' + esc(c.downlineUrl || '') + '" placeholder="https://script.google.com/macros/s/.../exec"></div>' +
      '</div>' +
      '<div class="row"><button class="btn btn--ghost" id="test-conn">Test both connections</button></div>' +
      '<div id="conn-out">' + connStatus(d) + '</div>' +
      '<h3 style="margin:26px 0 0;font-size:15px">Backup</h3>' +
      notice('info', '<p>Your roster, targets and email template live in the Apps Script ' +
        'project\'s properties. They survive re-pasting the code and redeploying. They do ' +
        '<strong>not</strong> survive deleting the project, so keep a copy of this somewhere.</p>') +
      '<div class="row"><div class="field field--grow">' +
        '<label for="cfgjson">Configuration</label>' +
        '<textarea id="cfgjson" spellcheck="false">' + esc(JSON.stringify(state.config, null, 2)) + '</textarea>' +
      '</div></div>' +
      '<div class="row"><button class="btn btn--warn" id="restore-cfg">Restore from the text above</button>' +
      '<span id="restore-status" class="muted"></span></div>' +
      savebar('save-conn') + '</div>';

    $('#test-conn').addEventListener('click', function () {
      var out = $('#conn-out');
      out.innerHTML = notice('info', '<p>Testing…</p>');
      api('diagnostics', { key: adminKey() }).then(function (res) {
        state.diagnostics = res.diagnostics || {};
        out.innerHTML = connStatus(state.diagnostics);
      }).catch(function (err) {
        out.innerHTML = notice('error', '<p>' + esc(err.message) + '</p>');
      });
    });

    $('#restore-cfg').addEventListener('click', function () {
      if (!window.confirm('This replaces the entire saved configuration — roster, targets ' +
        'and email template. Continue?')) return;
      var status = $('#restore-status');
      status.textContent = 'Restoring…';
      apiPost('restoreConfig', { json: $('#cfgjson').value })
        .then(function (res) {
          if (!res.verified) throw new Error('The backend could not read back what it wrote.');
          state.config = res.config;
          state.roster = res.config.units || [];
          status.textContent = 'Restored ' + res.restored + ' people.';
        })
        .catch(function (err) { status.textContent = 'Failed. ' + err.message; });
    });

    doSave('save-conn', function () {
      return { connections: { downlineUrl: $('#dlurl').value.trim() } };
    });
  }

  function connStatus(d) {
    var out = '';
    out += d.pipelineOk
      ? notice('ok', '<p>Pipeline sheet reachable. ' + num(d.pipelineRows) + ' rows read.</p>')
      : notice('error', '<p>Pipeline sheet unreachable. ' + esc(d.pipelineError || '') + '</p>');
    out += d.downlineOk
      ? notice('ok', '<p>Downline sheet reachable. ' + num(d.downlineRows) + ' rows read.</p>')
      : notice('warn', '<p>Downline sheet not connected. ' + esc(d.downlineError || '') + '</p>');
    if (d.missingCreatedDateColumn) {
      out += notice('warn', '<p>No created-date column is configured, so new applications, ' +
        'pull-through and cycle time are switched off rather than guessed. ' +
        'Set <code>COL.createdDate</code> in the Apps Script to turn them on.</p>');
    }
    return out;
  }

  /* ---------- View a scorecard ---------- */

  function panelView(host) {
    host.innerHTML = '<div class="panel">' +
      '<div class="row"><div class="field"><label for="who">Person or pair</label>' +
      '<select id="who">' + state.roster.map(function (u, i) {
        return '<option value="' + i + '">' + esc(u.name || '(unnamed)') + '</option>';
      }).join('') + '</select></div>' +
      '<div class="field"><label for="per">Period</label><select id="per">' +
        '<option value="">Current quarter</option>' +
        '<option value="prev-quarter">Previous quarter</option>' +
        '<option value="ytd">Year to date</option>' +
      '</select></div>' +
      '<button class="btn" id="load-sc">Show scorecard</button></div>' +
      '<div id="sc-host"></div></div>';

    $('#load-sc').addEventListener('click', function () {
      var u = state.roster[Number($('#who').value)];
      if (!u) return;
      var out = $('#sc-host');
      out.innerHTML = notice('info', '<p>Loading…</p>');
      api('scorecard', { key: adminKey(), name: u.name, period: $('#per').value })
        .then(function (data) { out.innerHTML = scorecardHtml(data); })
        .catch(function (err) { out.innerHTML = notice('error', '<p>' + esc(err.message) + '</p>'); });
    });
  }

  /* ============================================================
   * 8. Go
   * ============================================================ */

  function start() {
    if (PIPELINE_API.indexOf('PASTE_PIPELINE_DEPLOYMENT_ID') !== -1) {
      app.setAttribute('data-state', 'error');
      app.innerHTML = stage(brandbar('Not connected yet', '')) + '<div class="wrap">' +
        notice('error', '<p>Open <code>assets/app.js</code> and replace ' +
          '<code>PIPELINE_API</code> with the /exec URL of your deployed Apps Script.</p>') + '</div>';
      return;
    }
    var token = qs('t') || window.MOXIE_TOKEN;
    if (token) bootScorecard(token);
    else bootAdmin();
  }

  start();
})();
