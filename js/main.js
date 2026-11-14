(function () {
  'use strict';

  /* ======================================================================
     CONFIG — everything the client may need to change lives up here
     ====================================================================== */

  // TODO: вставить URL деплоя Google Apps Script (см. tools/apps-script.gs)
  const FORM_ENDPOINT = "";

  // TODO: подтвердить список вертикалей у клиента; при правке менять только этот массив
  const VERTICALS = [
    { name: 'CASINO',  icon: 'casino'  },
    { name: 'BETTING', icon: 'betting' },
    { name: 'POKER',   icon: 'poker'   },
    { name: 'SLOTS',   icon: 'slots'   },
    { name: 'ESPORTS', icon: 'esports' },
  ];

  // TODO: цифры — заглушки (00K+), клиент пришлёт свои. Менять только поле value.
  // dot   = точка региона на карте (координаты viewBox 950×560)
  // plate = центр плашки на карте (десктоп)
  const REGIONS = [
    { name: 'USA + CANADA',      value: '00K+', dot: [190, 165], plate: [118, 300] },
    { name: 'LATIN AMERICA',     value: '00K+', dot: [272, 400], plate: [130, 440] },
    { name: 'EUROPE',            value: '00K+', dot: [498, 140], plate: [352, 218] },
    { name: 'CIS',               value: '00K+', dot: [640, 118], plate: [515, 42]  },
    { name: 'AFRICA + MID EAST', value: '00K+', dot: [526, 372], plate: [420, 490] },
    { name: 'ASIA',              value: '00K+', dot: [745, 238], plate: [872, 310] },
    { name: 'AUSTRALIA',         value: '00K+', dot: [815, 432], plate: [848, 508] },
  ];

  /* ======================================================================
     Icons — 64×64, 1.5px line, drawn for AVEN
     ====================================================================== */
  const ICONS = {
    casino:
      '<path d="M32 7 54 19.5v25L32 57 10 44.5v-25Z"/><path d="M10 19.5 32 32l22-12.5M32 32v25"/>' +
      '<circle cx="32" cy="19.5" r="1.3"/><circle cx="21" cy="38" r="1.3"/><circle cx="21" cy="46" r="1.3"/>' +
      '<circle cx="43" cy="38" r="1.3"/><circle cx="43" cy="46" r="1.3"/>',
    betting:
      '<path d="M9 17h46v9.5a5.5 5.5 0 0 0 0 11V47H9v-9.5a5.5 5.5 0 0 0 0-11Z"/>' +
      '<path d="M40 17v30" stroke-dasharray="2.5 3.5"/><path d="M17 26h14M17 32h14M17 38h9"/><path d="m45 28 4 4-4 4"/>',
    poker:
      '<path d="M32 8C23 21 11 28 11 38.5A10.5 10.5 0 0 0 28.5 46c0 5-1.8 8-5 10.5h17c-3.2-2.5-5-5.5-5-10.5A10.5 10.5 0 0 0 53 38.5C53 28 41 21 32 8Z"/>',
    slots:
      '<rect x="8" y="11" width="40" height="42" rx="3"/><rect x="13" y="20" width="9" height="14" rx="1"/>' +
      '<rect x="25" y="20" width="9" height="14" rx="1"/><rect x="37" y="20" width="6" height="14" rx="1"/>' +
      '<path d="M15 44h16M48 24h6v14h-6"/><circle cx="54" cy="19" r="3"/>',
    esports:
      '<path d="M18 21h28a11 11 0 0 1 11 11v7a6.5 6.5 0 0 1-11.8 3.7L42 40H22l-3.2 2.700A6.5 6.5 0 0 1 7 39v-7a11 11 0 0 1 11-11Z"/>' +
      '<path d="M21 27v8M17 31h8"/><circle cx="41" cy="29.5" r="1.6"/><circle cx="46.5" cy="34" r="1.6"/>',
  };

  const SVGNS = 'http://www.w3.org/2000/svg';
  const $ = (s, r = document) => r.querySelector(s);

  /* ======================================================================
     Header: blur on scroll, back-to-top
     ====================================================================== */
  const header = $('.header');
  const onScroll = () => header.classList.toggle('is-scrolled', window.scrollY > 12);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  $('#up').addEventListener('click', () => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
  });

  /* ======================================================================
     Verticals
     ====================================================================== */
  $('#verticals-list').innerHTML = VERTICALS.map(
    (v, i) =>
      '<li class="vcard reveal" style="--d:' + (i * 0.07).toFixed(2) + 's">' +
      '<div class="vcard__box"><span class="vcard__n">' + String(i + 1).padStart(2, '0') + '</span><svg class="vcard__icon" viewBox="0 0 64 64" fill="none" stroke="currentColor" ' +
      'stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[v.icon] || '') + '</svg></div>' +
      '<span class="vcard__label">' + v.name + '</span></li>'
  ).join('');

  // mobile carousel progress: one diamond per vertical, active one follows the scroll position
  (function carouselDots() {
    const list = $('#verticals-list');
    const dots = $('#verticals-dots');
    dots.innerHTML = VERTICALS.map(() => '<i></i>').join('');
    const items = dots.children;
    const update = () => {
      const max = list.scrollWidth - list.clientWidth;
      const idx = max > 0 ? Math.round(list.scrollLeft / max * (items.length - 1)) : 0;
      for (let i = 0; i < items.length; i++) items[i].classList.toggle('is-on', i === idx);
    };
    list.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    update();
  })();

  /* ======================================================================
     Map: plates, leader lines, pins, mobile legend
     ====================================================================== */
  (function buildMap() {
    const W = 950, H = 560;
    const lines = $('#map-lines');
    const layer = $('#map-layer');
    const legend = $('#map-legend');
    const pct = (v, max) => (v / max * 100).toFixed(3) + '%';

    // "live" regions: a blue copy of the generated #dots, masked to soft circles around each region dot
    const dotsSvg = $('.map__dots');
    const LIT_R = 46;
    let defs = '<defs><radialGradient id="lit-fade"><stop offset="0" stop-color="#fff"/><stop offset=".45" stop-color="#fff" stop-opacity=".85"/>' +
      '<stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>' +
      '<radialGradient id="lit-glow"><stop offset="0" stop-color="#1B6FD6" stop-opacity=".16"/><stop offset="1" stop-color="#1B6FD6" stop-opacity="0"/></radialGradient>' +
      '<mask id="lit-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="' + W + '" height="' + H + '">';
    let glows = '';
    REGIONS.forEach((r) => {
      defs += '<circle cx="' + r.dot[0] + '" cy="' + r.dot[1] + '" r="' + LIT_R + '" fill="url(#lit-fade)"/>';
      glows += '<circle cx="' + r.dot[0] + '" cy="' + r.dot[1] + '" r="' + (LIT_R * 1.5) + '" fill="url(#lit-glow)"/>';
    });
    defs += '</mask></defs>';
    dotsSvg.insertAdjacentHTML('afterbegin', defs + '<g class="map__glows">' + glows + '</g>');
    dotsSvg.insertAdjacentHTML('beforeend', '<use class="map__lit" href="#dots" mask="url(#lit-mask)"/>');

    REGIONS.forEach((r, i) => {
      const line = document.createElementNS(SVGNS, 'line');
      line.setAttribute('x1', r.plate[0]); line.setAttribute('y1', r.plate[1]);
      line.setAttribute('x2', r.dot[0]);   line.setAttribute('y2', r.dot[1]);
      lines.appendChild(line);

      const pin = document.createElement('span');
      pin.className = 'pin';
      pin.style.left = pct(r.dot[0], W); pin.style.top = pct(r.dot[1], H);
      pin.innerHTML = '<span class="pin__n">' + (i + 1) + '</span>';
      layer.appendChild(pin);

      const plate = document.createElement('div');
      plate.className = 'plate';
      plate.style.left = pct(r.plate[0], W); plate.style.top = pct(r.plate[1], H);
      plate.innerHTML = '<span class="plate__name"></span><span class="plate__val"></span>';
      plate.firstChild.textContent = r.name;
      plate.lastChild.textContent = r.value;
      layer.appendChild(plate);

      const set = (on) => [line.classList, pin.classList, plate.classList].forEach((c) => c.toggle('is-active', on));
      plate.addEventListener('mouseenter', () => set(true));
      plate.addEventListener('mouseleave', () => set(false));
      pin.addEventListener('mouseenter', () => set(true));
      pin.addEventListener('mouseleave', () => set(false));

      const li = document.createElement('li');
      li.innerHTML = '<span class="legend__n"><span>' + (i + 1) + '</span></span><span class="legend__name"></span><span class="legend__val"></span>';
      li.querySelector('.legend__name').textContent = r.name;
      li.querySelector('.legend__val').textContent = r.value;
      legend.appendChild(li);
    });
  })();

  /* ======================================================================
     Map counters: values count up from 0 when #ftds enters the viewport
     ====================================================================== */
  (function counters() {
    const els = Array.from(document.querySelectorAll('.plate__val, .legend__val'));
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || !('IntersectionObserver' in window)) return; // final values are already in place

    // "00K+" → prefix "", number 0, keep 2 digits (leading zero), suffix "K+"; works for any NN[.N]K+ value
    const parsed = els.map((el) => {
      const m = el.textContent.match(/^(\D*)(\d+(?:\.\d+)?)(.*)$/);
      if (!m) return null;
      const dec = (m[2].split('.')[1] || '').length;
      const pad = m[2][0] === '0' ? m[2].split('.')[0].length : 0;
      return { el, pre: m[1], num: parseFloat(m[2]), dec, pad, suf: m[3] };
    }).filter(Boolean);
    const fmt = (p, v) => {
      const s = v.toFixed(p.dec).split('.');
      s[0] = s[0].padStart(p.pad, '0');
      return p.pre + s.join('.') + p.suf;
    };
    parsed.forEach((p) => { p.el.textContent = fmt(p, 0); });

    const run = () => {
      const t0 = performance.now(), DUR = 1000;
      const ease = (t) => 1 - Math.pow(1 - t, 3);
      const tick = (now) => {
        const t = Math.min(1, (now - t0) / DUR);
        parsed.forEach((p) => { p.el.textContent = fmt(p, p.num * ease(t)); });
        if (t < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { io.disconnect(); run(); }
    }, { threshold: 0.25 });
    io.observe($('#map'));
    io.observe($('#map-legend'));
  })();

  /* ======================================================================
     Reveal on scroll
     ====================================================================== */
  (function reveal() {
    const items = document.querySelectorAll('.reveal');
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || !('IntersectionObserver' in window)) {
      items.forEach((el) => el.classList.add('in'));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => {
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
      }),
      { threshold: 0.12, rootMargin: '0px 0px -6% 0px' }
    );
    items.forEach((el) => io.observe(el));
  })();

  /* ======================================================================
     Form
     ====================================================================== */
  (function form() {
    const f = $('#form');
    const status = $('#form-status');
    const send = $('#send');
    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

    const area = $('#f-comment');
    const grow = () => { area.style.height = 'auto'; area.style.height = Math.max(52, area.scrollHeight) + 'px'; };
    area.addEventListener('input', grow);

    function setErr(input, msg) {
      const wrap = input.closest('.field');
      wrap.classList.toggle('is-bad', !!msg);
      $('#e-' + input.name).textContent = msg || '';
      input.setAttribute('aria-invalid', msg ? 'true' : 'false');
    }
    function check(input) {
      const v = input.value.trim();
      let msg = '';
      if (!v) msg = 'REQUIRED';
      else if (input.name === 'email' && !EMAIL_RE.test(v)) msg = 'INVALID EMAIL';
      setErr(input, msg);
      return !msg;
    }

    const required = [f.elements.name, f.elements.email];
    required.forEach((el) => {
      el.addEventListener('input', () => { if (el.closest('.field').classList.contains('is-bad')) check(el); });
      el.addEventListener('blur', () => { if (el.value.trim()) check(el); });
    });

    f.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      status.className = 'form__status'; status.textContent = '';

      const ok = required.map(check).every(Boolean);
      if (!ok) { (required.find((el) => el.closest('.field').classList.contains('is-bad')) || {}).focus?.(); return; }

      // honeypot: bots fill it, humans never see it — silently pretend success
      if (f.elements.hp_field.value) { done(); return; }

      // TODO: if FORM_ENDPOINT is empty the form runs in draft mode and just shows success
      if (!FORM_ENDPOINT) { done(); return; }

      send.disabled = true;
      try {
        await fetch(FORM_ENDPOINT, { method: 'POST', mode: 'no-cors', body: new FormData(f) });
        done();
      } catch (err) {
        send.disabled = false;
        status.className = 'form__status is-err';
        status.textContent = 'Something went wrong. Please try again or message us on Telegram.';
      }
    });

    function done() {
      f.classList.add('is-sent');
      status.className = 'form__status is-ok';
      status.textContent = "Thanks! We'll get back to you soon";
      send.disabled = false;
    }
  })();

  /* ======================================================================
     Hero gem: pointer tilt (desktop) + rare edge sparkle
     ====================================================================== */
  (function () {
    const gem = $('.hero__gem .gem');
    if (!gem) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');

    // tilt follows the cursor with inertia; desktop pointers only
    const fine = window.matchMedia('(pointer: fine) and (min-width: 901px)');
    let tx = 0, ty = 0, cx = 0, cy = 0, raf = null;
    const loop = () => {
      cx += (tx - cx) * 0.07;
      cy += (ty - cy) * 0.07;
      gem.style.transform = `perspective(900px) rotateX(${cy.toFixed(2)}deg) rotateY(${cx.toFixed(2)}deg)`;
      raf = (Math.abs(tx - cx) + Math.abs(ty - cy) > 0.01) ? requestAnimationFrame(loop) : null;
    };
    window.addEventListener('mousemove', (e) => {
      if (reduce.matches || !fine.matches) return;
      const r = gem.getBoundingClientRect();
      const dx = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / (window.innerWidth / 2)));
      const dy = Math.max(-1, Math.min(1, (e.clientY - (r.top + r.height / 2)) / (window.innerHeight / 2)));
      tx = dx * 6; ty = dy * -6;
      if (!raf) raf = requestAnimationFrame(loop);
    }, { passive: true });

    // a sparkle flashes on a random facet junction every 9–15s
    const spark = gem.querySelector('.gem__spark');
    const pts = [[288, 112], [288, 288], [112, 288], [112, 112], [140, 140], [260, 140], [260, 260], [140, 260], [200, 24], [376, 200], [200, 376], [24, 200]];
    (function flash() {
      window.setTimeout(() => {
        if (!reduce.matches && document.visibilityState === 'visible') {
          const p = pts[Math.floor(Math.random() * pts.length)];
          spark.setAttribute('transform', `translate(${p[0]} ${p[1]})`);
          spark.classList.add('on');
          window.setTimeout(() => spark.classList.remove('on'), 600);
        }
        flash();
      }, 9000 + Math.random() * 6000);
    })();
  })();
})();
