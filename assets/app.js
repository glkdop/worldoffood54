/* World of Food — логика сайта: меню, быстрый просмотр, корзина, подбор меню, виджеты, новогодний декор */
(function () {
  "use strict";
  var S = window.SETTINGS || {};
  var M = window.MENU || { categories: [] };
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var fmt = function (n) { return Math.round(n).toLocaleString("ru-RU"); };
  var plural = function (n, f) { n = Math.abs(n) % 100; var n1 = n % 10; if (n > 10 && n < 20) return f[2]; if (n1 > 1 && n1 < 5) return f[1]; if (n1 === 1) return f[0]; return f[2]; };
  var norm = function (s) { return String(s).toLowerCase().replace(/ё/g, "е").replace(/[«»"]/g, ""); };
  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  var store = {
    get: function (k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* хранилище недоступно */ } },
    sget: function (k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
    sset: function (k, v) { try { sessionStorage.setItem(k, v); } catch (e) { /* нет */ } }
  };
  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var finePointer = window.matchMedia && window.matchMedia("(pointer: fine)").matches;
  var MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
  var ICON = function (id, cls) { return '<svg class="ic' + (cls ? " " + cls : "") + '"><use href="#' + id + '"/></svg>'; };

  /* ================= Индекс блюд ================= */
  var ITEMS = {}, CARDS = [];
  M.categories.forEach(function (cat) {
    cat.groups.forEach(function (g) {
      g.cards.forEach(function (card) {
        card.catRef = cat; card.groupRef = g;
        if (!card.placeholder) CARDS.push({ card: card, cat: cat, group: g }); // Food box — отдельным блоком
        (card.variants || [card]).forEach(function (v) { v.card = card; v.cat = cat.id; v.groupTitle = g.title; ITEMS[v.id] = v; });
      });
    });
  });
  var SETS = {};
  (S.sets || []).forEach(function (s) { SETS[s.id] = s; });

  function imgSrc(img, big) { return img ? "img/menu/" + (big ? "lg/" : "") + img + ".webp" : null; }
  function unitLabel(it, q) { return it.unit === "бокс" ? plural(q, ["бокс", "бокса", "боксов"]) : it.unit; }
  function priceParts(it) {
    var p = it.price; if (!p) return null;
    var main = p.to ? fmt(p.from) + "–" + fmt(p.to) + " ₽" : "от " + fmt(p.from) + " ₽";
    var per = p.per === "pcs" ? "/шт" : p.per === "portion" ? "за " + p.perCount + " шт" : p.per === "box" ? "за бокс" : "";
    return { main: main, per: per };
  }
  function priceText(it) { var p = priceParts(it); return p ? p.main + (p.per ? (p.per[0] === "/" ? p.per : " " + p.per) : "") : null; }
  function lineSum(it, q) { return it.price ? it.price.from * q : null; }
  function variantLabel(v) { return String(v.variant || "").replace(/^Food box\s*/i, ""); }
  function splitCompo(label) { var i = label.indexOf(" — "); return i > 0 ? [label.slice(0, i), label.slice(i + 3)] : [label, ""]; }
  function roundQty(it, x) { return Math.max(it.min, Math.ceil(x / it.step) * it.step); }

  /* ================= Корзина: состояние ================= */
  var cart = store.get("wof-cart", null) || { lines: {}, sets: {}, meta: {} };
  cart.lines = cart.lines || {}; cart.sets = cart.sets || {}; cart.meta = cart.meta || {};
  Object.keys(cart.lines).forEach(function (id) { if (!ITEMS[id]) delete cart.lines[id]; });
  Object.keys(cart.sets).forEach(function (id) { if (!SETS[id]) delete cart.sets[id]; });
  var listeners = [];
  function saveCart() { store.set("wof-cart", cart); listeners.forEach(function (fn) { fn(); }); }
  function qtyOf(id) { return cart.lines[id] || 0; }
  function setQty(id, q) { if (!ITEMS[id]) return; if (q <= 0) delete cart.lines[id]; else cart.lines[id] = q; saveCart(); }
  function inc(id, dir, fromEl) {
    var it = ITEMS[id], q = qtyOf(id);
    if (dir > 0) setQty(id, q ? q + it.step : it.min);
    else setQty(id, q - it.step < it.min ? 0 : q - it.step);
    if (dir > 0 && !q) { flyToCart(fromEl, it.img ? imgSrc(it.img) : null); showAdded(it); }
  }
  function totals() {
    var sum = 0, req = 0, count = 0;
    Object.keys(cart.lines).forEach(function (id) { var s = lineSum(ITEMS[id], cart.lines[id]); count++; if (s == null) req++; else sum += s; });
    var sets = Object.keys(cart.sets).length; count += sets; req += sets;
    return { sum: sum, req: req, count: count };
  }
  function bump() { $$(".cart-btn, .bb-cart, .order-pill").forEach(function (b) { b.classList.remove("bump"); void b.offsetWidth; b.classList.add("bump"); }); }

  /* ================= Полёт в корзину и «Добавлено» ================= */
  function cartTarget() {
    var cands = [$(".bottom-bar .bb-cart"), $("#orderPill:not([hidden])"), $(".site-header .cart-btn")];
    for (var i = 0; i < cands.length; i++) { var c = cands[i]; if (c && c.offsetParent !== null) { var r = c.getBoundingClientRect(); if (r.width && r.top >= 0 && r.top < innerHeight) return r; } }
    return null;
  }
  function flyToCart(fromEl, src) {
    bump();
    if (reduceMotion || !fromEl || !src || !fromEl.getBoundingClientRect || !document.body.animate) return;
    var from = fromEl.getBoundingClientRect(), to = cartTarget(); if (!to || !from.width) return;
    var f = document.createElement("img"); f.src = src; f.className = "flyer"; f.alt = "";
    var sx = from.left + from.width / 2 - 35, sy = from.top + from.height / 2 - 35, ex = to.left + to.width / 2 - 35, ey = to.top + to.height / 2 - 35;
    f.style.left = sx + "px"; f.style.top = sy + "px"; document.body.appendChild(f);
    var mx = (ex - sx) * 0.5, my = Math.min(ey - sy, 0) - 120;
    f.animate([
      { transform: "translate(0,0) scale(1)", opacity: 1 },
      { transform: "translate(" + mx + "px," + my + "px) scale(.8)", opacity: 1, offset: .45 },
      { transform: "translate(" + (ex - sx) + "px," + (ey - sy) + "px) scale(.25)", opacity: .6 }
    ], { duration: 800, easing: "cubic-bezier(.5,0,.3,1)" }).onfinish = function () { f.remove(); bump(); };
  }
  var addedTimer;
  function showAdded(it, label) {
    var a = $("#added"); if (!a) return;
    var img = $("#addedImg");
    if (it && it.img) { img.src = imgSrc(it.img); img.hidden = false; } else if (it && it.imgSrc) { img.src = it.imgSrc; img.hidden = false; } else img.hidden = true;
    $("#addedName").textContent = label || it.name;
    var t = totals();
    $("#addedSum").textContent = "В заказе " + t.count + " " + plural(t.count, ["позиция", "позиции", "позиций"]) + (t.sum ? " · от " + fmt(t.sum) + " ₽" : "");
    a.hidden = false; a.style.animation = "none"; void a.offsetWidth; a.style.animation = "";
    clearTimeout(addedTimer); addedTimer = setTimeout(function () { a.hidden = true; }, 4500);
  }
  function setupAdded() {
    var a = $("#added"); if (!a) return;
    a.addEventListener("mouseenter", function () { clearTimeout(addedTimer); });
    a.addEventListener("mouseleave", function () { addedTimer = setTimeout(function () { a.hidden = true; }, 2000); });
    $("#addedClose").addEventListener("click", function () { a.hidden = true; });
  }

  /* ================= Карточка ================= */
  var cardUpdaters = [];
  function badgesHTML(card) {
    return '<span class="badges">' + (card.hit ? '<span class="badge badge-hit">Хит</span>' : "") +
      "</span>";
  }
  function renderCard(card, preselect) {
    var el = document.createElement("article");
    el.className = "card";
    var isVar = !!card.variants;
    var cur = isVar ? (preselect || card.variants[0]) : card;
    var media = (card.placeholder || !cur.img)
      ? '<button class="card-media" type="button" aria-label="Подробнее: ' + esc(card.name) + '"><span class="placeholder">' + ICON("i-box") + "Фото скоро</span></button>"
      : '<button class="card-media" type="button" aria-label="Подробнее: ' + esc(card.name) + '"><img loading="lazy" decoding="async" width="600" height="600" alt="' + esc(cur.name) + '" src="' + imgSrc(cur.img) + '">' + badgesHTML(card) + '<span class="card-peek">Подробнее</span></button>';
    var select = isVar ? '<select class="variant-select" aria-label="Вид: ' + esc(card.name) + '">' + card.variants.map(function (v) {
      return '<option value="' + esc(v.id) + '"' + (v === cur ? " selected" : "") + ">" + esc(splitCompo(variantLabel(v))[0]) + "</option>";
    }).join("") + "</select>" : "";
    el.innerHTML = media + '<div class="card-body"><h4 class="card-name"><button class="card-link" type="button">' + esc(card.name) + "</button></h4>" + select +
      '<p class="card-compo" hidden></p><p class="card-meta"></p><div class="card-foot"><p class="card-price"></p><div class="card-ctrl"></div></div></div>';
    var img = $(".card-media img", el), sel = $("select", el), ctrl = $(".card-ctrl", el);
    function update() {
      var it = cur, q = qtyOf(it.id);
      var compo = isVar ? splitCompo(variantLabel(it))[1] : "";
      var cp = $(".card-compo", el); cp.textContent = compo; cp.hidden = !compo;
      var meta = $(".card-meta", el); meta.textContent = it.unitNote || ""; meta.hidden = !it.unitNote;
      var pp = priceParts(it), pr = $(".card-price", el);
      pr.innerHTML = pp ? esc(pp.main) + (pp.per ? "<small>" + esc(pp.per) + "</small>" : "") : "Цена по запросу";
      pr.classList.toggle("req", !pp);
      if (img && it.img && img.getAttribute("src") !== imgSrc(it.img)) { img.src = imgSrc(it.img); img.alt = it.name; }
      var html = q ? '<div class="stepper"><button type="button" data-d="-1" aria-label="Меньше">' + ICON("i-minus") + '</button><span class="q" aria-live="polite">' + q + " " + unitLabel(it, q) + '</span><button type="button" data-d="1" aria-label="Больше">' + ICON("i-plus") + "</button></div>"
        : '<button class="plus-btn" type="button" aria-label="Добавить в заказ: ' + esc(it.name) + '">' + ICON("i-plus") + "</button>";
      if (ctrl.dataset.state !== (q ? "s" : "p")) { ctrl.innerHTML = html; ctrl.dataset.state = q ? "s" : "p"; }
      else if (q) $(".q", ctrl).textContent = q + " " + unitLabel(it, q);
    }
    ctrl.addEventListener("click", function (e) {
      var b = e.target.closest("button"); if (!b) return;
      if (b.classList.contains("plus-btn")) inc(cur.id, 1, img || $(".card-media", el)); else inc(cur.id, +b.dataset.d);
    });
    if (sel) sel.addEventListener("change", function () { cur = ITEMS[sel.value]; ctrl.dataset.state = ""; update(); });
    var open = function () { openQV(card, cur); };
    $(".card-media", el).addEventListener("click", open);
    $(".card-link", el).addEventListener("click", open);
    update(); cardUpdaters.push(update);
    return el;
  }

  /* ================= Набор на компанию — карточкой в меню ================= */
  function setsFor(catId) { return (S.sets || []).filter(function (s) { return s.menuCat === catId; }); }
  function renderSetCard(s) {
    var guests = S.setGuests || [], chosen = cart.sets[s.id] || guests[1] || guests[0], src = "img/sets/" + s.img + ".webp";
    var el = document.createElement("article");
    el.className = "card card-set";
    el.innerHTML = '<div class="card-media"><img loading="lazy" decoding="async" width="600" height="600" alt="' + esc(s.title) + '" src="' + src + '"><span class="badges"><span class="badge badge-set">Набор</span></span></div>' +
      '<div class="card-body"><h4 class="card-name">' + esc(s.title) + '</h4><select class="variant-select" aria-label="Сколько гостей: ' + esc(s.title) + '">' +
      guests.map(function (g) { return '<option value="' + esc(g) + '">' + esc(g) + " гостей</option>"; }).join("") + "</select>" +
      '<p class="card-compo">' + esc(s.text) + '</p><div class="card-foot"><p class="card-price req">Цена по запросу</p><div class="card-ctrl"></div></div></div>';
    var sel = $("select", el), ctrl = $(".card-ctrl", el), img = $(".card-media img", el);
    function upd() {
      if (cart.sets[s.id]) chosen = cart.sets[s.id];
      sel.value = chosen;
      var on = !!cart.sets[s.id];
      ctrl.innerHTML = '<button class="plus-btn' + (on ? " is-on" : "") + '" type="button" aria-pressed="' + on + '" aria-label="' + (on ? "Убрать из заказа: " : "Добавить в заказ: ") + esc(s.title) + '">' + ICON(on ? "i-check" : "i-plus") + "</button>";
    }
    sel.addEventListener("change", function () { chosen = sel.value; if (cart.sets[s.id]) { cart.sets[s.id] = chosen; saveCart(); } });
    ctrl.addEventListener("click", function (e) {
      if (!e.target.closest("button")) return;
      if (cart.sets[s.id]) { delete cart.sets[s.id]; saveCart(); }
      else { cart.sets[s.id] = chosen; saveCart(); flyToCart(img, src); showAdded({ imgSrc: src, name: s.title }, s.title + " · " + chosen + " гостей"); }
    });
    listeners.push(upd); upd();
    return el;
  }

  /* ================= Меню, вкладки, поиск ================= */
  var activeCat = null;
  function renderMenu() {
    var body = $("#menuBody"), tabs = $("#tabs"); if (!body) return;
    M.categories.forEach(function (cat, ci) {
      var n = setsFor(cat.id).length; cat.groups.forEach(function (g) { n += g.cards.filter(function (c) { return !c.placeholder; }).length; });
      var sec = document.createElement("section");
      sec.className = "cat"; sec.id = "cat-" + cat.id; sec.setAttribute("role", "tabpanel"); sec.setAttribute("aria-labelledby", "tab-" + cat.id);
      sec.innerHTML = '<h3 class="cat-title">' + esc(cat.title) + "<small>" + n + " " + plural(n, ["блюдо", "блюда", "блюд"]) + "</small></h3>";
      var extra = setsFor(cat.id);
      cat.groups.forEach(function (g) {
        var cards = g.cards.filter(function (c) { return !c.placeholder; }); if (!cards.length) return;
        if (g.title) { var gt = document.createElement("p"); gt.className = "group-title"; gt.textContent = g.title; sec.appendChild(gt); }
        var grid = document.createElement("div"); grid.className = "grid";
        extra.forEach(function (s) { grid.appendChild(renderSetCard(s)); }); extra = []; // наборы — первыми в категории
        cards.forEach(function (c) { grid.appendChild(renderCard(c)); });
        sec.appendChild(grid);
      });
      body.appendChild(sec);
      var t = document.createElement("button");
      t.type = "button"; t.className = "tab"; t.id = "tab-" + cat.id; t.setAttribute("role", "tab"); t.dataset.cat = cat.id;
      t.innerHTML = "<span>" + esc(cat.title) + '</span><span class="n">' + n + "</span>";
      t.addEventListener("click", function () { showCat(cat.id, true); });
      tabs.appendChild(t);
    });
    showCat(M.categories[0] && M.categories[0].id, false);
  }
  function showCat(id, scroll) {
    activeCat = id;
    $$(".cat").forEach(function (s) { s.classList.toggle("active", s.id === "cat-" + id); });
    $$("#mnavCats button").forEach(function (b) { b.classList.toggle("active", b.dataset.cat === id); });
    $$(".tab").forEach(function (t) {
      var on = t.dataset.cat === id; t.setAttribute("aria-selected", on ? "true" : "false");
      if (on && t.parentNode.scrollWidth > t.parentNode.clientWidth) { var pr = t.parentNode; pr.scrollTo({ left: t.getBoundingClientRect().left - pr.getBoundingClientRect().left + pr.scrollLeft - 12, behavior: reduceMotion ? "auto" : "smooth" }); }
    });
    var input = $("#menuSearch"); if (input && input.value) { input.value = ""; $("#searchResults").hidden = true; $("#menuBody").hidden = false; }
    if (scroll) { var m = $(".menu-layout"), top = m.getBoundingClientRect().top; if (top < 0 || top > innerHeight * .6) window.scrollTo({ top: scrollY + top - 90, behavior: reduceMotion ? "auto" : "smooth" }); }
  }
  function setupSearch() {
    var input = $("#menuSearch"), out = $("#searchResults"), body = $("#menuBody"), timer, label = input && input.closest(".search");
    if (!input) return;
    label.addEventListener("click", function () { label.classList.add("open"); input.focus(); });
    input.addEventListener("blur", function () { if (!input.value) label.classList.remove("open"); });
    input.addEventListener("input", function () {
      clearTimeout(timer);
      timer = setTimeout(function () {
        var q = norm(input.value.trim());
        if (q.length < 2) { out.hidden = true; out.innerHTML = ""; body.hidden = false; return; }
        var found = CARDS.filter(function (e) {
          var txt = e.card.name + " " + (e.card.variants ? e.card.variants.map(function (v) { return v.name; }).join(" ") : "") + " " + e.cat.title + " " + (e.group.title || "");
          return q.split(/\s+/).every(function (w) { return norm(txt).indexOf(w) >= 0; });
        });
        var foundSets = (S.sets || []).filter(function (s) {
          return s.menuCat && q.split(/\s+/).every(function (w) { return norm(s.title + " " + s.text + " набор на компанию").indexOf(w) >= 0; });
        });
        out.innerHTML = '<p class="group-title">Найдено: ' + (found.length + foundSets.length) + "</p>";
        if (!found.length && !foundSets.length) out.innerHTML += '<p class="search-empty">Ничего не нашли. Попробуйте другое слово или напишите Ирине — возможно, приготовим на заказ.</p>';
        var grid = document.createElement("div"); grid.className = "grid";
        foundSets.forEach(function (s) { grid.appendChild(renderSetCard(s)); });
        found.forEach(function (e) { grid.appendChild(renderCard(e.card)); });
        out.appendChild(grid); out.hidden = false; body.hidden = true;
      }, 160);
    });
  }

  /* ================= Хиты: карусель ================= */
  function renderHits() {
    var row = $("#hitsRow"); if (!row) return;
    CARDS.forEach(function (e) {
      var c = e.card;
      if (c.variants) { var hv = c.variants.filter(function (v) { return v.hit; })[0]; if (hv) row.appendChild(renderCard(c, hv)); }
      else if (c.hit) row.appendChild(renderCard(c));
    });
    if (!row.children.length) { $("#hits").hidden = true; return; }
    var prev = $("#hitsPrev"), next = $("#hitsNext"), bar = $("#hitsBar");
    function step() { var c = row.querySelector(".card"); return c ? c.getBoundingClientRect().width + 20 : 300; }
    function upd() {
      var max = row.scrollWidth - row.clientWidth, p = max > 0 ? row.scrollLeft / max : 0;
      var w = row.clientWidth / row.scrollWidth; bar.style.width = (w * 100) + "%"; bar.style.transform = "translateX(" + (p * (1 / w - 1) * 100) + "%)";
      prev.disabled = row.scrollLeft < 4; next.disabled = row.scrollLeft > max - 4;
    }
    prev.addEventListener("click", function () { row.scrollBy({ left: -step(), behavior: "smooth" }); });
    next.addEventListener("click", function () { row.scrollBy({ left: step(), behavior: "smooth" }); });
    row.addEventListener("scroll", upd, { passive: true }); window.addEventListener("resize", upd); upd();
    // перетаскивание мышью
    var down = false, sx = 0, sl = 0, moved = false;
    row.addEventListener("pointerdown", function (e) { if (e.pointerType !== "mouse") return; down = true; moved = false; sx = e.clientX; sl = row.scrollLeft; });
    window.addEventListener("pointermove", function (e) { if (!down) return; var dx = e.clientX - sx; if (Math.abs(dx) > 5) { moved = true; row.classList.add("dragging"); } row.scrollLeft = sl - dx; });
    window.addEventListener("pointerup", function () { if (!down) return; down = false; setTimeout(function () { row.classList.remove("dragging"); }, 0); });
    row.addEventListener("click", function (e) { if (moved) { e.stopPropagation(); e.preventDefault(); moved = false; } }, true);
  }

  /* ================= Бегущая строка ================= */
  function renderMarquee() {
    var tr = $("#marquee"); if (!tr) return;
    var names = [];
    CARDS.forEach(function (e) { if (e.card.hit || e.card.ny) names.push(e.card.name.replace(/[«»]/g, "")); });
    ["Канапе", "Брускетты", "Тарталетки", "Профитроли", "Food box", "Ассорти"].forEach(function (n) { names.push(n); });
    var html = names.map(function (n) { return "<span>" + esc(n) + '<img src="img/decor/snowflake.svg" alt=""></span>'; }).join("");
    tr.innerHTML = html + html;
  }

  /* ================= Наборы ================= */
  function renderSets() {
    var grid = $("#setsGrid"); if (!grid) return;
    (S.sets || []).forEach(function (s, i) {
      var el = document.createElement("article");
      el.className = "set-card reveal"; el.style.setProperty("--rd", (i * 0.1) + "s");
      var chosen = cart.sets[s.id] || (S.setGuests || [])[1] || (S.setGuests || [])[0];
      el.innerHTML = '<div class="set-media"><span class="ribbon" aria-hidden="true"></span><img class="set-img" loading="lazy" src="img/sets/' + s.img + '.webp" alt="' + esc(s.title) + '" width="600" height="600"></div>' +
        '<div class="set-body"><h3>' + esc(s.title) + "</h3><p>" + esc(s.text) + '</p><p class="field-label">Гостей</p><div class="set-guests" role="group" aria-label="Сколько гостей"></div>' +
        '<div class="set-foot"><span class="set-price">Цену назовёт Ирина</span><button class="btn btn-sm" type="button"></button></div></div>';
      var gBox = $(".set-guests", el), btn = $(".set-foot .btn", el);
      (S.setGuests || []).forEach(function (g) {
        var b = document.createElement("button"); b.type = "button"; b.textContent = g; b.dataset.g = g;
        b.addEventListener("click", function () { chosen = g; if (cart.sets[s.id]) { cart.sets[s.id] = g; saveCart(); } upd(); });
        gBox.appendChild(b);
      });
      function upd() {
        if (cart.sets[s.id]) chosen = cart.sets[s.id];
        $$("button", gBox).forEach(function (b) { b.setAttribute("aria-pressed", b.dataset.g === chosen ? "true" : "false"); });
        var inCart = !!cart.sets[s.id];
        btn.innerHTML = inCart ? ICON("i-check") + " В заказе — убрать" : ICON("i-plus") + " Добавить к заказу";
        btn.className = "btn btn-sm " + (inCart ? "btn-ghost-dark" : "btn-primary btn-shine");
      }
      btn.addEventListener("click", function () {
        if (cart.sets[s.id]) { delete cart.sets[s.id]; saveCart(); }
        else { cart.sets[s.id] = chosen; saveCart(); flyToCart($(".set-img", el), "img/sets/" + s.img + ".webp"); showAdded({ imgSrc: "img/sets/" + s.img + ".webp", name: s.title }, s.title + " · " + chosen + " гостей"); }
      });
      listeners.push(upd); upd();
      grid.appendChild(el);
    });
  }

  /* ================= Food box: отдельный блок ================= */
  function renderBoxes() {
    var grid = $("#boxesGrid"), sec = $("#boxes"); if (!grid) return;
    var list = (S.boxes || []).filter(function (b) { return ITEMS[b.id]; });
    if (!list.length) { if (sec) sec.hidden = true; return; }
    list.forEach(function (b, i) {
      var it = ITEMS[b.id], photos = (b.photos || []).slice(0, 4), extras = (b.extras || []).slice(0, 4 - photos.length);
      var cells = photos.map(function (p) { return '<span class="box-cell"><img loading="lazy" decoding="async" src="' + imgSrc(p) + '" alt="" width="600" height="600"></span>'; })
        .concat(extras.map(function (x) { return '<span class="box-cell box-cell-art"><svg class="box-art" aria-hidden="true"><use href="#i-' + esc(x.icon) + '"/></svg><small>' + esc(x.label) + "</small></span>"; }));
      var el = document.createElement("article");
      el.className = "box-card reveal"; el.style.setProperty("--rd", (i * 0.1) + "s");
      el.innerHTML = '<div class="box-media"><div class="box-tray n' + cells.length + '">' + cells.join("") + '</div><span class="box-num">' + esc(b.title.replace(/^Food box\s*/, "")) + "</span></div>" +
        '<div class="box-body"><p class="box-kicker">' + esc(b.title) + "</p><h3>" + esc(b.tagline || "") + "</h3>" +
        '<ul class="box-list">' + (b.items || []).map(function (x) { return "<li>" + ICON("i-check") + "<span>" + esc(x) + "</span></li>"; }).join("") + "</ul>" +
        '<div class="box-price"><b>Цена обсуждается</b><span>зависит от количества гостей и боксов</span></div>' +
        '<div class="box-foot"><div class="box-ctrl"></div><a class="btn-link" data-vk-msg href="' + esc(S.vkMessage || S.vk || "#") + '" target="_blank" rel="noopener">Спросить Ирину</a></div></div>';
      var ctrl = $(".box-ctrl", el), firstImg = $(".box-cell img", el), photoSrc = photos.length ? imgSrc(photos[0]) : null;
      function upd() {
        var q = qtyOf(b.id);
        ctrl.innerHTML = q
          ? '<div class="stepper" role="group" aria-label="Количество боксов"><button type="button" data-d="-1" aria-label="Меньше">' + ICON("i-minus") + "</button><span class=\"q\">" + q + " " + plural(q, ["бокс", "бокса", "боксов"]) + '</span><button type="button" data-d="1" aria-label="Больше">' + ICON("i-plus") + "</button></div>"
          : '<button class="btn btn-primary btn-sm btn-shine" type="button" data-add>' + ICON("i-plus") + " Добавить к заказу</button>";
      }
      ctrl.addEventListener("click", function (e) {
        var t = e.target.closest("button"); if (!t) return;
        if (t.hasAttribute("data-add")) { setQty(b.id, 1); flyToCart(firstImg || el, photoSrc); showAdded({ imgSrc: photoSrc, name: b.title }, b.title + " · " + (b.tagline || "")); }
        else { var q = qtyOf(b.id) + (+t.dataset.d); setQty(b.id, Math.max(0, q)); }
      });
      cardUpdaters.push(upd); upd();
      grid.appendChild(el);
    });
  }

  /* ================= Быстрый просмотр ================= */
  var qv = { card: null, item: null, qty: 1 };
  function openDialog(d) {
    if (!d || typeof d.showModal !== "function") return false;
    closeNav();
    if (!d.open) { d.showModal(); document.documentElement.style.overflow = "hidden"; ovOpen(d.id, function () { d.close(); }); }
    return true;
  }
  function openQV(card, item) {
    var d = $("#qv"); qv.card = card; qv.item = item || (card.variants ? card.variants[0] : card);
    qv.qty = qtyOf(qv.item.id) || qv.item.min;
    fillQV();
    if (!openDialog(d)) { if (!qtyOf(qv.item.id)) inc(qv.item.id, 1); }
  }
  function fillQV() {
    var card = qv.card, it = qv.item, isVar = !!card.variants;
    var img = $("#qvImg"), ph = $("#qvPh");
    if (it.img && !card.placeholder) { img.hidden = false; ph.hidden = true; img.src = imgSrc(it.img, true); img.alt = it.name; img.onerror = function () { img.onerror = null; img.src = imgSrc(it.img); }; }
    else { img.hidden = true; ph.hidden = false; }
    $("#qvBadges").innerHTML = $(".badges", (function () { var t = document.createElement("div"); t.innerHTML = badgesHTML(card); return t; })()).innerHTML;
    $("#qvGroup").textContent = [card.catRef.title, card.groupRef.title].filter(Boolean).join(" · ");
    $("#qvName").textContent = isVar ? card.name : it.name;
    var vb = $("#qvVariants"); vb.innerHTML = ""; vb.hidden = !isVar;
    if (isVar) card.variants.forEach(function (v) {
      var b = document.createElement("button"); b.type = "button"; b.setAttribute("role", "radio"); b.setAttribute("aria-checked", v === it ? "true" : "false");
      b.className = v.img ? "" : "no-img";
      b.innerHTML = (v.img ? '<img src="' + imgSrc(v.img) + '" alt="">' : "") + esc(splitCompo(variantLabel(v))[0]);
      b.addEventListener("click", function () { qv.item = v; qv.qty = qtyOf(v.id) || v.min; fillQV(); });
      vb.appendChild(b);
    });
    $("#qvCompo").textContent = isVar ? splitCompo(variantLabel(it))[1] : "";
    $("#qvPortion").textContent = it.unitNote || "—";
    $("#qvPrice").textContent = priceText(it) || "по запросу";
    updQVBuy();
    // с этим берут
    var more = CARDS.filter(function (e) { return e.cat === card.catRef && e.card !== card && !e.card.placeholder; })
      .sort(function (a, b) { return (b.card.hit ? 1 : 0) - (a.card.hit ? 1 : 0); }).slice(0, 4);
    if (more.length < 4) more = more.concat(CARDS.filter(function (e) { return e.card.hit && e.card !== card && more.indexOf(e) < 0; }).slice(0, 4 - more.length));
    var row = $("#qvMore"); row.innerHTML = "";
    more.forEach(function (e) {
      var c = e.card, v = c.variants ? c.variants[0] : c;
      var b = document.createElement("button"); b.type = "button";
      b.innerHTML = '<img src="' + imgSrc(v.img) + '" alt="" loading="lazy">' + esc(c.name);
      b.addEventListener("click", function () { qv.card = c; qv.item = v; qv.qty = qtyOf(v.id) || v.min; fillQV(); $(".qv-body").scrollTop = 0; });
      row.appendChild(b);
    });
    $("#qvMoreWrap").hidden = !more.length;
  }
  function updQVBuy() {
    var it = qv.item, inCart = qtyOf(it.id);
    $("#qvQty").textContent = qv.qty + " " + unitLabel(it, qv.qty);
    var s = lineSum(it, qv.qty);
    $("#qvAdd").textContent = (inCart ? (inCart === qv.qty ? "В заказе ✓" : "Обновить заказ") : "В заказ") + (s != null ? " · от " + fmt(s) + " ₽" : "");
  }
  function setupQV() {
    var d = $("#qv"); if (!d) return;
    $("#qvMinus").addEventListener("click", function () { qv.qty = Math.max(qv.item.min, qv.qty - qv.item.step); updQVBuy(); });
    $("#qvPlus").addEventListener("click", function () { qv.qty += qv.item.step; updQVBuy(); });
    $("#qvAdd").addEventListener("click", function () {
      var had = qtyOf(qv.item.id); setQty(qv.item.id, qv.qty);
      var img = $("#qvImg"); var r = img.hidden ? null : img;
      d.close();
      if (!had) { flyToCart(r, qv.item.img ? imgSrc(qv.item.img) : null); } else bump();
      showAdded(qv.item);
    });
  }

  /* ================= Подбор меню (квиз) ================= */
  var quiz = { step: 1, occ: null, guests: 10, fmt: null, offset: 0, result: [] };
  var OCC = [{ id: "ny", t: "Новый год дома", i: "i-gift" }, { id: "corp", t: "Корпоратив", i: "i-chat" }, { id: "bday", t: "День рождения", i: "i-spark" }, { id: "other", t: "Другой праздник", i: "i-chef" }];
  var FMT = [{ id: "buffet", t: "Фуршет", s: "Канапе, брускетты, тарталетки — удобно есть стоя" }, { id: "table", t: "Застолье", s: "Салаты и горячее за общим столом" }, { id: "mix", t: "Всего понемногу", s: "Салаты, закуски и горячее" }];
  function pool(filter) {
    var list = Object.keys(ITEMS).map(function (k) { return ITEMS[k]; }).filter(function (it) { return it.img && !it.card.placeholder && filter(it); });
    var ny = quiz.occ === "ny";
    return list.sort(function (a, b) { return ((ny && b.ny) - (ny && a.ny)) || (b.hit - a.hit); });
  }
  function mixGroups(list) {
    var by = {}, order = [];
    list.forEach(function (it) { var g = it.groupTitle || it.cat; if (!by[g]) { by[g] = []; order.push(g); } by[g].push(it); });
    var out = [], more = true;
    for (var r = 0; more; r++) { more = false; order.forEach(function (g) { if (by[g][r]) { out.push(by[g][r]); more = true; } }); }
    return out;
  }
  function take(list, n) { if (!list.length) return []; var out = [], k = quiz.offset % list.length; for (var i = 0; i < Math.min(n, list.length); i++) out.push(list[(k + i) % list.length]); return out; }
  function buildQuiz() {
    var g = quiz.guests, res = [];
    var salads = pool(function (it) { return it.cat === "salads"; });
    var pcs = mixGroups(pool(function (it) { return (it.cat === "kanape" || it.cat === "snacks") && it.unit === "шт" && it.min >= 4 && it.price; }));
    var boxes = mixGroups(pool(function (it) { return it.cat === "tart" && it.unit === "бокс" && it.price; }));
    var hot = pool(function (it) { return it.cat === "hot"; });
    var assorti = pool(function (it) { return it.cat === "assorti"; });
    function add(it, q) { res.push({ it: it, q: q }); }
    if (quiz.fmt === "buffet") {
      var kinds = clamp(Math.round(g / 4) + 3, 4, 9);
      if (g >= 15 && boxes.length) { take(boxes, 1).forEach(function (it) { add(it, 1); }); kinds--; }
      take(pcs, kinds).forEach(function (it) { add(it, roundQty(it, g * 1.5)); });
      if (g >= 8) take(assorti, 1).forEach(function (it) { add(it, 1); });
    } else if (quiz.fmt === "table") {
      take(salads, clamp(Math.ceil(g / 4), 2, 8)).forEach(function (it) { add(it, 1); });
      var hk = clamp(Math.ceil(g / 12) + 1, 1, 3);
      take(hot, hk).forEach(function (it) { add(it, roundQty(it, Math.ceil(g / hk))); });
      take(pcs, 1).forEach(function (it) { add(it, roundQty(it, g)); });
      if (g >= 6) take(assorti.slice().reverse(), 1).forEach(function (it) { add(it, 1); });
    } else {
      take(salads, clamp(Math.ceil(g / 6), 1, 5)).forEach(function (it) { add(it, 1); });
      take(pcs, clamp(Math.ceil(g / 5) + 1, 2, 6)).forEach(function (it) { add(it, roundQty(it, g)); });
      if (g >= 6) take(hot, 1).forEach(function (it) { add(it, roundQty(it, g)); });
      if (g >= 10) take(assorti, 1).forEach(function (it) { add(it, 1); });
    }
    quiz.result = res;
    var ul = $("#qResult"); ul.innerHTML = "";
    var sum = 0, req = 0;
    res.forEach(function (r, i) {
      var s = lineSum(r.it, r.q); if (s == null) req++; else sum += s;
      var li = document.createElement("li"); li.style.setProperty("--i", i);
      li.innerHTML = '<img src="' + imgSrc(r.it.img) + '" alt=""><div><p class="nm">' + esc(r.it.name) + '</p><p class="sub">' + r.q + " " + unitLabel(r.it, r.q) + (r.it.unitNote && r.it.unit === "шт" && r.it.cat === "salads" ? " · " + esc(r.it.unitNote) : "") + '</p></div><span class="sm">' + (s == null ? "по запросу" : "от " + fmt(s) + " ₽") + "</span>";
      ul.appendChild(li);
    });
    var occ = OCC.filter(function (o) { return o.id === quiz.occ; })[0];
    $("#qResTitle").textContent = (occ ? occ.t + ", " : "") + g + " " + plural(g, ["гость", "гостя", "гостей"]) + " — примерный набор";
    $("#qTotal").innerHTML = "<span>Предварительно" + (req ? "<small>+ " + req + " поз. по запросу</small>" : "") + "</span><b>" + (sum ? "от " + fmt(sum) + " ₽" : "—") + "</b>";
  }
  function quizStep(n) {
    quiz.step = n;
    $$(".quiz-step").forEach(function (s) { s.hidden = +s.dataset.step !== n; });
    $("#quizBar").style.width = (n * 25) + "%";
    if (n === 4) buildQuiz();
  }
  function openQuiz(opts) {
    opts = opts || {};
    if (opts.guests) quiz.guests = opts.guests;
    else if (cart.meta.guests) quiz.guests = +cart.meta.guests || quiz.guests;
    $("#qgOut").textContent = quiz.guests; $("#qgRange").value = quiz.guests;
    quiz.offset = 0; quizStep(1);
    closeCart(true);
    if (!openDialog($("#quiz"))) location.hash = "#menu";
  }
  function setupQuiz() {
    var d = $("#quiz"); if (!d) return;
    var occBox = $("#qOcc"), fmtBox = $("#qFmt");
    OCC.forEach(function (o) {
      var b = document.createElement("button"); b.type = "button"; b.innerHTML = ICON(o.i) + esc(o.t);
      b.addEventListener("click", function () { quiz.occ = o.id; quizStep(2); }); occBox.appendChild(b);
    });
    FMT.forEach(function (f) {
      var b = document.createElement("button"); b.type = "button"; b.innerHTML = "<span><b>" + esc(f.t) + "</b><small>" + esc(f.s) + "</small></span>";
      b.addEventListener("click", function () { quiz.fmt = f.id; quizStep(4); }); fmtBox.appendChild(b);
    });
    var setG = function (v) { quiz.guests = clamp(v, 2, 80); $("#qgOut").textContent = quiz.guests; $("#qgRange").value = quiz.guests; };
    $("#qgMinus").addEventListener("click", function () { setG(quiz.guests - 1); });
    $("#qgPlus").addEventListener("click", function () { setG(quiz.guests + 1); });
    $("#qgRange").addEventListener("input", function (e) { setG(+e.target.value); });
    $$("[data-q-next]", d).forEach(function (b) { b.addEventListener("click", function () { quizStep(quiz.step + 1); }); });
    $$("[data-q-back]", d).forEach(function (b) { b.addEventListener("click", function () { quizStep(Math.max(1, quiz.step - 1)); }); });
    $("#qShuffle").addEventListener("click", function () { quiz.offset += 2; buildQuiz(); });
    $("#qAddAll").addEventListener("click", function () {
      quiz.result.forEach(function (r) { cart.lines[r.it.id] = (cart.lines[r.it.id] || 0) + r.q; });
      cart.meta.guests = String(quiz.guests);
      var occ = OCC.filter(function (o) { return o.id === quiz.occ; })[0]; if (occ) cart.meta.occasion = occ.t;
      saveCart(); d.close(); bump(); toast("Набор добавлен — проверьте и поправьте количество");
      setTimeout(openCart, 250);
    });
    document.addEventListener("click", function (e) { var b = e.target.closest("[data-open-quiz]"); if (b) { e.preventDefault(); hideNY(); openQuiz(); } });
  }

  /* ================= Даты ================= */
  function iso(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function parseISO(s) { var p = String(s || "").split("-"); return p.length === 3 ? new Date(+p[0], +p[1] - 1, +p[2]) : null; }
  function human(s) { var d = parseISO(s); return d ? d.getDate() + " " + MONTHS[d.getMonth()] : ""; }
  function mmdd(d) { return String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function inHoliday(d) { var k = mmdd(d); return (S.holidayPeriods || []).some(function (p) { return p[0] <= p[1] ? (k >= p[0] && k <= p[1]) : (k >= p[0] || k <= p[1]); }); }
  function minDate() { var d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + Math.ceil((S.leadTimeHours || 24) / 24)); return d; }
  function daysToDeadline() { var dl = parseISO(S.newYearDeadline); if (!dl) return -1; var t = new Date(); t.setHours(0, 0, 0, 0); return Math.round((dl - t) / 864e5) + 1; }

  /* ================= Корзина: отрисовка ================= */
  function renderCart() {
    var t = totals();
    $$("[data-cart-count]").forEach(function (e) { e.textContent = t.count; });
    $$("[data-cart-sum]").forEach(function (e) { e.textContent = t.count && t.sum ? "от " + fmt(t.sum) + " ₽" : ""; });
    $$("[data-cart-short]").forEach(function (e) { e.textContent = t.count ? (t.sum ? fmt(t.sum) + " ₽" : t.count + " поз.") : "Корзина"; });
    $$(".bb-cart").forEach(function (b) { b.classList.toggle("has-items", !!t.count); });
    cardUpdaters.forEach(function (fn) { fn(); });
    var pill = $("#orderPill");
    if (pill) {
      pill.hidden = !t.count || $("#cart").classList.contains("open") || !pastHero;
      $("#opText").textContent = t.count + " " + plural(t.count, ["позиция", "позиции", "позиций"]) + (t.sum ? " · от " + fmt(t.sum) + " ₽" : "");
      document.body.classList.toggle("has-pill", !pill.hidden);
    }
    var lines = $("#cartLines"); if (!lines) return;
    var empty = !t.count;
    $("#cartEmpty").hidden = !empty; $("#orderForm").hidden = empty; $("#cartSummary").hidden = empty;
    lines.innerHTML = "";
    Object.keys(cart.lines).forEach(function (id) {
      var it = ITEMS[id], q = cart.lines[id], s = lineSum(it, q);
      var li = document.createElement("li"); li.className = "cart-line";
      li.innerHTML = (it.img ? '<img src="' + imgSrc(it.img) + '" alt="">' : '<span class="ph" aria-hidden="true"></span>') +
        '<div><p class="nm">' + esc(it.name) + '</p><p class="sub">' + esc(priceText(it) || "цена по запросу") + "</p></div>" +
        '<div class="ctrl"><div class="mini-stepper"><button type="button" data-d="-1" aria-label="Меньше">' + ICON("i-minus") + "</button><span>" + q + " " + unitLabel(it, q) + '</span><button type="button" data-d="1" aria-label="Больше">' + ICON("i-plus") + "</button></div>" +
        '<span class="line-sum">' + (s == null ? "по запросу" : "от " + fmt(s) + " ₽") + "</span></div>";
      li.addEventListener("click", function (e) { var b = e.target.closest("button"); if (b) inc(id, +b.dataset.d); });
      lines.appendChild(li);
    });
    Object.keys(cart.sets).forEach(function (sid) {
      var s = SETS[sid], li = document.createElement("li"); li.className = "cart-line";
      li.innerHTML = '<img src="img/sets/' + s.img + '.webp" alt=""><div><p class="nm">' + esc(s.title) + '</p><p class="sub">' + esc(cart.sets[sid]) + ' гостей · состав подберёт Ирина</p></div><div class="ctrl"><button class="btn-link" type="button">Убрать</button><span class="line-sum">по запросу</span></div>';
      $("button", li).addEventListener("click", function () { delete cart.sets[sid]; saveCart(); });
      lines.appendChild(li);
    });
    var html = '<div class="sum-row"><span>Предварительно</span><span class="sum-total">' + (t.sum ? "от " + fmt(t.sum) + " ₽" : "—") + "</span></div>";
    if (t.req) html += '<p class="sum-note">+ ' + t.req + " " + plural(t.req, ["позиция", "позиции", "позиций"]) + " по запросу — цену назовёт Ирина</p>";
    if (S.minOrder && t.sum < S.minOrder && !t.req) html += '<p class="warn">Минимальный заказ — ' + fmt(S.minOrder) + " ₽. Добавьте ещё на " + fmt(S.minOrder - t.sum) + " ₽.</p>";
    if (S.freeDeliveryFrom) {
      var pct = clamp(t.sum / S.freeDeliveryFrom * 100, 0, 100);
      html += t.sum >= S.freeDeliveryFrom ? '<p class="ok">' + ICON("i-truck") + " Доставка бесплатная</p>" :
        '<p class="sum-note">До бесплатной доставки — ' + fmt(S.freeDeliveryFrom - t.sum) + ' ₽</p><div class="meter"><span style="width:' + pct + '%"></span></div>';
    }
    $("#cartSummary").innerHTML = html;
  }
  listeners.push(renderCart);

  function renderZones() {
    var box = $("#fZones"); if (!box) return;
    (S.zones || []).forEach(function (z) {
      var l = document.createElement("label"); l.className = "zone";
      l.innerHTML = '<input type="radio" name="zone" value="' + esc(z.id) + '"' + ((cart.meta.zone || "nsk") === z.id ? " checked" : "") + "><b>" + esc(z.title) + "</b><small>" + esc(z.note) + "</small>";
      box.appendChild(l);
    });
  }
  function checkDate() {
    var w = $("#dateWarn"), d = parseISO($("#fDate").value), msg = "", today = new Date(); today.setHours(0, 0, 0, 0);
    if (d) {
      var days = Math.round((d - today) / 864e5);
      if (d < minDate()) msg = "Обычно заказ оформляют за " + (S.leadTimeHours || 24) + " часа. Ирина уточнит, получится ли раньше.";
      else if (inHoliday(d) && days < (S.holidayLeadDays || 3)) msg = "В праздники заказ оформляют за " + S.holidayLeadDays + " дня — Ирина уточнит, успеем ли.";
      var dl = parseISO(S.newYearDeadline);
      if (dl && S.season === "newyear" && today > dl && (mmdd(d) >= "12-28" || mmdd(d) <= "01-08")) msg = "Новогодние заказы принимали до " + human(S.newYearDeadline) + ". Напишите Ирине — вдруг ещё получится.";
    }
    w.textContent = msg; w.hidden = !msg;
  }

  /* ================= Заказ: текст, номер, ссылка ================= */
  function orderData() {
    var zone = (S.zones || []).filter(function (z) { return z.id === cart.meta.zone; })[0];
    return { id: cart.meta.orderId, date: cart.meta.date, time: cart.meta.time, guests: cart.meta.guests, occasion: cart.meta.occasion, zone: zone ? zone.title : "", total: totals() };
  }
  // Адрес сайта для ссылки на заказ: берётся из адресной строки (работает на любом хостинге), с диска — из settings.siteUrl
  function siteBase() { return /^https?:$/.test(location.protocol) ? location.href.split(/[?#]/)[0].replace(/[^\/]*$/, "") : (S.siteUrl || "").replace(/\/$/, "") + "/"; }
  function orderLink() {
    var parts = Object.keys(cart.lines).map(function (id) { return id + "*" + cart.lines[id]; });
    Object.keys(cart.sets).forEach(function (sid) { parts.push("set-" + sid + "*" + (S.setGuests || []).indexOf(cart.sets[sid])); });
    var q = "o=" + encodeURIComponent(parts.join(",")) + "&d=" + encodeURIComponent(cart.meta.date || "") + "&t=" + encodeURIComponent(cart.meta.time || "") +
      "&g=" + encodeURIComponent(cart.meta.guests || "") + "&z=" + encodeURIComponent(cart.meta.zone || "") + "&n=" + encodeURIComponent(cart.meta.orderId || "");
    return siteBase() + "zakaz.html#" + q;
  }
  function orderLines() {
    var out = Object.keys(cart.lines).map(function (id) {
      var it = ITEMS[id], q = cart.lines[id], s = lineSum(it, q);
      return "• " + it.name + " — " + q + " " + unitLabel(it, q) + " — " + (s == null ? "цена по запросу" : "от " + fmt(s) + " ₽");
    });
    Object.keys(cart.sets).forEach(function (sid) { out.push("• " + SETS[sid].title + " — " + cart.sets[sid] + " гостей — по запросу"); });
    return out;
  }
  function orderText(limit) {
    var o = orderData(), lines = orderLines(), head = "Заказ № " + o.id, tail = [];
    tail.push("Предварительно: " + (o.total.sum ? "от " + fmt(o.total.sum) + " ₽" : "—") + (o.total.req ? " + " + o.total.req + " поз. по запросу" : ""));
    var when = [o.date ? human(o.date) : "", o.time ? "к " + o.time : ""].filter(Boolean).join(", ");
    tail.push([when && "Когда: " + when, o.guests && "Гостей: " + o.guests, o.zone && "Доставка: " + o.zone, o.occasion && "Повод: " + o.occasion].filter(Boolean).join(" · "));
    if (limit) {
      var body = [], len = head.length + tail.join("\n").length + 60, i;
      for (i = 0; i < lines.length; i++) { if (len + lines[i].length > limit) break; body.push(lines[i]); len += lines[i].length + 1; }
      if (i < lines.length) body.push("…и ещё " + (lines.length - i) + " поз. — полный заказ по ссылке");
      lines = body;
    }
    var txt = [head].concat(lines, tail).join("\n");
    if (!limit) txt += "\nПолный заказ: " + orderLink();
    return txt;
  }
  function newOrderId() { var d = parseISO(cart.meta.date) || new Date(); return String(d.getDate()).padStart(2, "0") + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(Math.floor(10 + Math.random() * 90)); }
  function showStep(n) {
    $("#cartStep1").hidden = n !== 1; $("#cartStep2").hidden = n !== 2;
    $("#stepTab1").classList.toggle("is-active", n === 1); $("#stepTab2").classList.toggle("is-active", n === 2);
    var b = $("#cart .drawer-body:not([hidden])"); if (b) b.scrollTop = 0;
  }
  var formTimer;
  function goContacts() {
    var o = orderData();
    $("#orderRecap").innerHTML = "<b>Заказ № " + esc(o.id) + "</b><span>Предварительно " + (o.total.sum ? "от " + fmt(o.total.sum) + " ₽" : "—") +
      (o.total.req ? " + " + o.total.req + " поз. по запросу" : "") + "</span><span>" + esc([human(o.date), o.time && "к " + o.time, o.guests && o.guests + " " + plural(+o.guests, ["гость", "гостя", "гостей"]), o.zone].filter(Boolean).join(" · ")) + "</span>";
    $("#orderText").value = orderText();
    var host = $("#formHost"), f = S.yandexForm || {};
    if (f.url) {
      var fl = f.fields || {}, p = [];
      var add = function (k, v) { if (fl[k] && v != null && v !== "") p.push(encodeURIComponent(fl[k]) + "=" + encodeURIComponent(v)); };
      add("order", orderText(900)); add("total", o.total.sum ? "от " + fmt(o.total.sum) + " ₽" + (o.total.req ? " + по запросу" : "") : "по запросу");
      add("id", o.id); add("link", orderLink()); add("date", [human(o.date), o.time].filter(Boolean).join(", ")); add("guests", o.guests); add("zone", o.zone);
      var base = f.url + (f.url.indexOf("?") >= 0 ? "&" : "?"), direct = base + p.join("&"), src = base + "iframe=1&" + p.join("&");
      var title = '<p class="alt-title">Оставьте контакты — заказ уйдёт Ирине</p>';
      var openBtn = '<a class="btn btn-primary btn-wide" href="' + esc(direct) + '" target="_blank" rel="noopener">Отправить заявку на отдельной странице ' + ICON("i-arrow") + "</a>";
      var note = '<p class="sum-note">После отправки формы Ирина свяжется с вами ' + esc(S.replyTime || "") + " (с " + esc(S.hours || "") + ").</p>";
      clearTimeout(formTimer);
      if (location.protocol === "file:") {
        // Сайт открыт с диска: Яндекс не разрешает показывать форму внутри такой страницы — открываем её отдельно
        host.innerHTML = title + '<div class="form-missing">Форма откроется на отдельной странице — состав заказа, дата и сумма в ней уже заполнены.</div>' + openBtn + note;
      } else {
        host.innerHTML = title + '<iframe class="form-frame" title="Форма заявки" src="' + esc(src) + '" width="100%" height="' + (f.height || 900) + '" frameborder="0"></iframe>' +
          '<div class="form-fallback" hidden><p>Форма не загрузилась на этой странице. Откройте её отдельно — состав заказа, дата и сумма в ней уже заполнены.</p>' + openBtn + "</div>" +
          note;
        var fr = $("iframe.form-frame", host);
        formTimer = setTimeout(function () { if (fr.isConnected && !fr.dataset.ok) { fr.hidden = true; $(".form-fallback", host).hidden = false; } }, 7000);
      }
    } else {
      host.innerHTML = '<div class="form-missing">Отправьте заказ Ирине удобным способом: скопируйте его и напишите в ВК или позвоните — текст заказа уже готов.</div>';
    }
    showStep(2);
  }
  // Высота формы Яндекса подстраивается сама: форма сообщает свою высоту странице
  function setupFormHeight() {
    window.addEventListener("message", function (e) {
      if (!/(^|\.)yandex\.(ru|com|net)$/.test((e.origin || "").replace(/^https?:\/\//, ""))) return;
      var fr = $$("iframe.form-frame").filter(function (x) { return x.contentWindow === e.source; })[0]; if (!fr) return;
      if (!fr.dataset.ok) { fr.dataset.ok = "1"; fr.hidden = false; var fb = fr.parentNode.querySelector(".form-fallback"); if (fb) fb.hidden = true; } // форма ответила — значит, загрузилась
      var d = e.data; if (typeof d === "string") { try { d = JSON.parse(d); } catch (err) { return; } }
      var h = d && (d["iframe-height"] || d.height); if (!h || isNaN(h)) return;
      fr.style.height = Math.max(300, Math.round(+h)) + "px";
    });
    if ((S.yandexForm || {}).url) { var sc = document.createElement("script"); sc.src = "https://forms.yandex.ru/_static/embed.js"; sc.async = true; document.head.appendChild(sc); }
  }
  function copyText(text) {
    var done = function () { toast("Заказ скопирован — вставьте его в чат"); };
    var fallback = function () { var ta = $("#orderText"); ta.value = text; ta.closest("details").open = true; ta.focus(); ta.select(); try { document.execCommand("copy"); done(); } catch (e) { toast("Выделите текст заказа и скопируйте его"); } };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback); else fallback();
  }

  var lastFocus = null, pastHero = false;
  function openCart() {
    var drawer = $("#cart"), back = $("#drawerBackdrop");
    closeNav();
    lastFocus = document.activeElement; showStep(1); back.hidden = false; drawer.classList.add("open"); drawer.setAttribute("aria-hidden", "false");
    ovOpen("cart", function () { closeCart(true); });
    document.documentElement.style.overflow = "hidden"; $("#added").hidden = true; renderCart();
    setTimeout(function () { drawer.focus(); }, 40);
  }
  function closeCart(silent) {
    var drawer = $("#cart"); if (!drawer.classList.contains("open")) return;
    drawer.classList.remove("open"); drawer.setAttribute("aria-hidden", "true"); $("#drawerBackdrop").hidden = true; document.documentElement.style.overflow = "";
    renderCart(); ovClose("cart"); if (!silent && lastFocus && lastFocus.focus) lastFocus.focus();
  }
  function setupCart() {
    var drawer = $("#cart");
    document.addEventListener("click", function (e) {
      if (e.target.closest("[data-open-cart]")) { e.preventDefault(); $$("dialog[open]").forEach(function (d) { d.close(); }); openCart(); }
      else if (e.target.closest("[data-close-cart]")) closeCart();
    });
    $("#drawerBackdrop").addEventListener("click", function () { closeCart(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && drawer.classList.contains("open")) closeCart(); });
    var fDate = $("#fDate"), fTime = $("#fTime"), fGuests = $("#fGuests");
    fDate.min = iso(new Date());
    if (cart.meta.date) fDate.value = cart.meta.date;
    if (cart.meta.time) fTime.value = cart.meta.time;
    listeners.push(function () { if (cart.meta.guests && !fGuests.value) fGuests.value = cart.meta.guests; });
    if (cart.meta.guests) fGuests.value = cart.meta.guests;
    renderZones();
    var saveMeta = function () {
      cart.meta.date = fDate.value; cart.meta.time = fTime.value; cart.meta.guests = fGuests.value;
      var z = $('input[name="zone"]:checked'); cart.meta.zone = z ? z.value : "nsk";
      store.set("wof-cart", cart); checkDate();
    };
    ["change", "input"].forEach(function (ev) { $("#orderForm").addEventListener(ev, saveMeta); });
    $("#orderForm").addEventListener("submit", function (e) {
      e.preventDefault(); saveMeta();
      if (!totals().count) return;
      if (!fDate.value) { fDate.focus(); toast("Укажите дату праздника"); return; }
      cart.meta.orderId = newOrderId(); store.set("wof-cart", cart); goContacts();
    });
    $("#backToStep1").addEventListener("click", function () { showStep(1); });
    $("#copyToVk").addEventListener("click", function () { copyText(orderText()); try { window.open(S.vkMessage || S.vk, "_blank", "noopener"); } catch (e) { /* ссылка ниже */ } });
    $("#clearCart").addEventListener("click", function () { cart = { lines: {}, sets: {}, meta: { zone: cart.meta.zone } }; saveCart(); closeCart(); toast("Корзина очищена. Спасибо за заказ!"); });
    checkDate();
  }

  /* ================= Диалоги: общее ================= */
  function setupDialogs() {
    $$("dialog").forEach(function (d) {
      d.addEventListener("click", function (e) { if (e.target === d) d.close(); });
      d.addEventListener("close", function () { if (!$("#cart").classList.contains("open") && !$("#mnav.open")) document.documentElement.style.overflow = ""; ovClose(d.id); });
      $$("[data-close-dialog]", d).forEach(function (b) { b.addEventListener("click", function () { d.close(); }); });
    });
  }

  /* ================= Калькулятор ================= */
  function countTo(el, text) {
    if (reduceMotion || el.dataset.v === text) { el.textContent = text; el.dataset.v = text; return; }
    el.dataset.v = text; el.animate([{ opacity: .2, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }], { duration: 350, easing: "ease-out" }); el.textContent = text;
  }
  function setupCalc() {
    var g = $("#calcGuests"), out = $("#calcGuestsOut"), seg = $("#calcDur"), res = $("#calcResult"); if (!g) return;
    var cur = (S.calc || [])[1] || (S.calc || [])[0];
    (S.calc || []).forEach(function (c) { var b = document.createElement("button"); b.type = "button"; b.textContent = c.title; b.dataset.id = c.id; b.addEventListener("click", function () { cur = c; upd(); }); seg.appendChild(b); });
    res.innerHTML = '<div><b data-k="kg"></b><span>кг еды на всех</span></div><div><b data-k="g"></b><span>г на гостя</span></div><div><b data-k="p"></b><span>разных блюд</span></div>';
    function kg(x) { return (Math.round(x / 100) / 10).toLocaleString("ru-RU"); }
    function upd() {
      var n = +g.value; out.textContent = n; $("#calcGuestsBtn").textContent = n + (n % 10 === 1 && n % 100 !== 11 ? " гостя" : " гостей");
      $$("button", seg).forEach(function (b) { b.setAttribute("aria-pressed", b.dataset.id === cur.id ? "true" : "false"); });
      countTo($('[data-k="kg"]', res), kg(n * cur.gFrom) + "–" + kg(n * cur.gTo));
      countTo($('[data-k="g"]', res), cur.gFrom + "–" + cur.gTo);
      countTo($('[data-k="p"]', res), cur.pFrom + "–" + cur.pTo);
    }
    g.addEventListener("input", upd); upd();
    $("#calcToQuiz").addEventListener("click", function () { openQuiz({ guests: +g.value }); });
  }

  /* ================= Toast ================= */
  var toastTimer;
  function toast(msg) { var t = $("#toast"); if (!t) return; t.textContent = msg; t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.hidden = true; }, 2800); }

  /* ================= Новогодний декор ================= */
  function setupSnow() {
    var c = $("#snow"), btn = $("#snowToggle"), hero = $("#hero");
    if (!c || S.season !== "newyear") return;
    var on = store.get("wof-snow", !reduceMotion);
    // Снежинки рисуются готовым спрайтом (быстрее, чем круг с новым цветом на каждый кадр);
    // плотность пикселей ограничена 1.5, на телефонах снежинок меньше, отталкивание — только мышью.
    var ctx = c.getContext("2d"), flakes = [], raf = null, visible = true, last = 0,
      dpr = Math.min(window.devicePixelRatio || 1, 1.5), px = -999, py = -999, W = 0, H = 0;
    var spr = document.createElement("canvas"); spr.width = spr.height = 32;
    var sc = spr.getContext("2d"), g = sc.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(.45, "rgba(255,255,255,.85)"); g.addColorStop(1, "rgba(255,255,255,0)");
    sc.fillStyle = g; sc.fillRect(0, 0, 32, 32);
    function size() {
      var r = c.getBoundingClientRect(); if (!r.width) return;
      if (Math.round(r.width * dpr) === W && Math.abs(Math.round(r.height * dpr) - H) < 80) return; // адресная строка телефона не пересоздаёт снег
      W = c.width = Math.round(r.width * dpr); H = c.height = Math.round(r.height * dpr);
      var n = Math.round(finePointer ? clamp(r.width / 22, 26, 64) : clamp(r.width / 26, 14, 28));
      if ((navigator.hardwareConcurrency || 8) <= 4 || (navigator.connection && navigator.connection.saveData)) n = Math.round(n * 0.6); // слабые устройства
      flakes = []; for (var i = 0; i < n; i++) flakes.push(mk(true));
    }
    function mk(any) { return { x: Math.random() * W, y: any ? Math.random() * H : -10, r: (1.4 + Math.random() * 3) * dpr, s: (0.3 + Math.random() * 0.9) * dpr, w: Math.random() * 6.28, o: 0.45 + Math.random() * 0.5, vx: 0 }; }
    function frame(t) {
      var k = last ? Math.min((t - last) / 16.7, 3) : 1; last = t;
      ctx.clearRect(0, 0, W, H);
      var R = 110 * dpr, R2 = R * R;
      for (var i = 0; i < flakes.length; i++) {
        var f = flakes[i];
        if (px > -999) { var dx = f.x - px, dy = f.y - py, d2 = dx * dx + dy * dy; if (d2 < R2) { var d = Math.sqrt(d2) || 1, q = (1 - d / R) * 2.4 * dpr; f.vx += dx / d * q; f.y += dy / d * q * .6; } }
        f.vx *= .92; f.y += f.s * k; f.w += 0.012 * k; f.x += (Math.sin(f.w) * 0.35 * dpr + f.vx) * k;
        if (f.y > H + 10 || f.x < -20 || f.x > W + 20) f = flakes[i] = mk(false);
        ctx.globalAlpha = f.o; ctx.drawImage(spr, f.x - f.r, f.y - f.r, f.r * 2, f.r * 2);
      }
      raf = requestAnimationFrame(frame);
    }
    function run() { if (raf) cancelAnimationFrame(raf); raf = null; last = 0; if (on && visible && !document.hidden) raf = requestAnimationFrame(frame); else ctx.clearRect(0, 0, W, H); }
    function label() { btn.setAttribute("aria-pressed", on ? "true" : "false"); $("span", btn).textContent = on ? "Снег: вкл" : "Снег: выкл"; }
    size(); label(); run();
    var rt; window.addEventListener("resize", function () { clearTimeout(rt); rt = setTimeout(size, 150); });
    document.addEventListener("visibilitychange", run);
    if ("IntersectionObserver" in window) new IntersectionObserver(function (e) { visible = e[0].isIntersecting; run(); }).observe(c);
    btn.addEventListener("click", function () { on = !on; store.set("wof-snow", on); label(); run(); });
    if (finePointer) {
      hero.addEventListener("pointermove", function (e) { var r = c.getBoundingClientRect(); px = (e.clientX - r.left) * dpr; py = (e.clientY - r.top) * dpr; });
      hero.addEventListener("pointerleave", function () { px = py = -999; });
    }
  }
  // Анимации первого экрана и бегущей строки замирают, когда их не видно
  function setupPause() {
    if (!("IntersectionObserver" in window)) return;
    var io = new IntersectionObserver(function (es) { es.forEach(function (e) { e.target.classList.toggle("paused", !e.isIntersecting); }); });
    $$("#hero, .marquee").forEach(function (el) { io.observe(el); });
  }
  function setupBaubles() {
    $$(".bauble").forEach(function (b) {
      var ring = function () { if (reduceMotion) return; b.classList.remove("ring"); void b.offsetWidth; b.classList.add("ring"); };
      b.addEventListener("pointerenter", ring); b.addEventListener("click", ring);
      b.addEventListener("animationend", function (e) { if (e.animationName === "ring") b.classList.remove("ring"); });
    });
  }
  function setupParallax() {
    var hero = $("#hero"), art = $("#heroArt"); if (!hero || !art || reduceMotion || !finePointer) return;
    var layers = $$("[data-depth]", art), raf = null, tx = 0, ty = 0;
    hero.addEventListener("pointermove", function (e) {
      var r = hero.getBoundingClientRect(); tx = (e.clientX - r.left) / r.width - .5; ty = (e.clientY - r.top) / r.height - .5;
      if (!raf) raf = requestAnimationFrame(function () { raf = null; layers.forEach(function (l) { var d = +l.dataset.depth; l.style.transform = "translate3d(" + (-tx * d) + "px," + (-ty * d) + "px,0)"; }); });
    });
    hero.addEventListener("pointerleave", function () { layers.forEach(function (l) { l.style.transform = ""; }); });
  }
  function setupCountdown() {
    var box = $("#countdown"); if (!box || S.season !== "newyear") return;
    var now = new Date(), target = new Date(now.getFullYear() + 1, 0, 1);
    if (now.getMonth() === 0 && now.getDate() <= 8) { $(".countdown-title", box).textContent = "С Новым годом!"; $(".cd-tiles", box).hidden = true; }
    var L = { d: ["день", "дня", "дней"], h: ["час", "часа", "часов"], m: ["минута", "минуты", "минут"], s: ["секунда", "секунды", "секунд"] };
    function tick() {
      var ms = Math.max(0, target - new Date()), v = { d: Math.floor(ms / 864e5), h: Math.floor(ms / 36e5) % 24, m: Math.floor(ms / 6e4) % 60, s: Math.floor(ms / 1e3) % 60 };
      Object.keys(v).forEach(function (k) {
        var el = $('[data-cd="' + k + '"]', box), t = k === "d" ? String(v[k]) : String(v[k]).padStart(2, "0");
        if (el.textContent !== t) { el.textContent = t; if (!reduceMotion) { el.classList.remove("tick"); void el.offsetWidth; el.classList.add("tick"); } }
        $('[data-cd-l="' + k + '"]', box).textContent = plural(v[k], L[k]);
      });
    }
    tick(); setInterval(function () { if (!box.closest(".paused")) tick(); }, 1000);
    var left = daysToDeadline(), note = $("#cdNote");
    if (left > 0) note.innerHTML = "Новогодние заказы принимаем ещё <b>" + left + " " + plural(left, ["день", "дня", "дней"]) + "</b> — до " + human(S.newYearDeadline);
    else note.textContent = "Приём новогодних заказов завершён — напишите Ирине, вдруг ещё успеем";
  }

  /* ================= Плавающие виджеты ================= */
  function setupFab() {
    var fab = $("#fab"), btn = $("#fabBtn"), menu = $("#fabMenu"); if (!fab) return;
    function set(open) { fab.classList.toggle("open", open); menu.hidden = !open; btn.setAttribute("aria-expanded", open ? "true" : "false"); }
    btn.addEventListener("click", function (e) { e.stopPropagation(); set(menu.hidden); });
    document.addEventListener("click", function (e) { if (!fab.contains(e.target)) set(false); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") set(false); });
    menu.addEventListener("click", function (e) { if (e.target.closest("a,button")) setTimeout(function () { set(false); }, 50); });
  }
  var nyShown = false;
  function hideNY() { var c = $("#nyCard"); document.body.classList.remove("ny-visible"); if (c && !c.hidden) { c.hidden = true; store.sset("wof-ny", "1"); } }
  function setupNYCard() {
    var c = $("#nyCard"); if (!c || S.season !== "newyear") return;
    var left = daysToDeadline(); if (left <= 0 || store.sget("wof-ny")) return;
    $("#nyCardText").innerHTML = "Приём новогодних заказов — до " + human(S.newYearDeadline) + ". Осталось <b>" + left + " " + plural(left, ["день", "дня", "дней"]) + "</b>.";
    function show() {
      if (nyShown || $("#cart").classList.contains("open") || $$("dialog[open]").length || totals().count) return;
      nyShown = true; c.hidden = false; document.body.classList.add("ny-visible");
    }
    var timer = setTimeout(show, 25000);
    window.addEventListener("scroll", function onS() { if (scrollY > innerHeight * (finePointer ? 1.8 : 3.5)) { clearTimeout(timer); show(); window.removeEventListener("scroll", onS); } }, { passive: true });
    $("#nyClose").addEventListener("click", hideNY); $("#nyLater").addEventListener("click", hideNY);
  }

  /* ================= Навигация: меню разделов, якоря, кнопка «Назад» ================= */
  // Открытые окна (меню разделов, корзина, просмотр блюда, подбор) записываются в историю браузера:
  // системная кнопка «Назад» на Android закрывает окно, а не уводит с сайта.
  var OV = [], ovArmed = false, ovSkip = 0, ovTimer = null;
  try { if ("scrollRestoration" in history) history.scrollRestoration = "manual"; if (history.state && history.state.wofOverlay) history.replaceState(null, ""); } catch (e) { /* нет истории */ }
  function ovOpen(name, close) {
    OV = OV.filter(function (o) { return o.name !== name; }); OV.push({ name: name, close: close });
    clearTimeout(ovTimer);
    if (!ovArmed) { try { history.pushState({ wofOverlay: 1 }, ""); ovArmed = true; } catch (e) { /* нет истории */ } }
  }
  function ovClose(name) {
    var had = OV.length; OV = OV.filter(function (o) { return o.name !== name; });
    if (had === OV.length || OV.length || !ovArmed) return;
    clearTimeout(ovTimer);
    ovTimer = setTimeout(function () { if (!OV.length && ovArmed) { ovArmed = false; ovSkip++; setTimeout(function () { ovSkip = 0; }, 900); history.back(); } }, 60);
  }
  window.addEventListener("popstate", function () {
    if (ovSkip) { ovSkip--; return; }
    if (!ovArmed) return;
    ovArmed = false;
    var o = OV.pop(); if (o) o.close();
    if (OV.length) { try { history.pushState({ wofOverlay: 1 }, ""); ovArmed = true; } catch (e) { /* нет истории */ } }
  });
  function headerOffset() { var h = $(".site-header"); return (h ? h.offsetHeight : 64) + 8; }
  function scrollToId(id) {
    var smooth = reduceMotion ? "auto" : "smooth";
    if (!id || id === "top") { window.scrollTo({ top: 0, behavior: smooth }); return; }
    var el = document.getElementById(id); if (!el) return;
    window.scrollTo({ top: scrollY + el.getBoundingClientRect().top - headerOffset(), behavior: smooth });
  }
  function setHash(id) { try { history.replaceState(history.state, "", id && id !== "top" ? "#" + id : location.pathname + location.search); } catch (e) { /* файл открыт локально */ } }
  function setupAnchors() {
    document.addEventListener("click", function (e) {
      var a = e.target.closest('a[href^="#"]'); if (!a || e.defaultPrevented || e.ctrlKey || e.metaKey) return;
      var id = a.getAttribute("href").slice(1);
      if (id && id !== "top" && !document.getElementById(id)) return;
      e.preventDefault();
      if (a.closest("#mnav")) { closeNav(); setTimeout(function () { scrollToId(id); setHash(id); }, 160); }
      else { scrollToId(id); setHash(id); }
    });
  }
  function openNav() {
    var n = $("#mnav"); if (!n || n.classList.contains("open")) return;
    $$("dialog[open]").forEach(function (d) { d.close(); });
    if ($("#cart").classList.contains("open")) closeCart(true);
    n.classList.add("open"); n.setAttribute("aria-hidden", "false"); $("#mnavBackdrop").hidden = false;
    document.documentElement.style.overflow = "hidden";
    $$("[data-open-nav]").forEach(function (b) { b.setAttribute("aria-expanded", "true"); });
    ovOpen("nav", closeNav);
    setTimeout(function () { n.focus(); }, 40);
  }
  function closeNav() {
    var n = $("#mnav"); if (!n || !n.classList.contains("open")) return;
    n.classList.remove("open"); n.setAttribute("aria-hidden", "true"); $("#mnavBackdrop").hidden = true;
    if (!$("#cart").classList.contains("open") && !$$("dialog[open]").length) document.documentElement.style.overflow = "";
    $$("[data-open-nav]").forEach(function (b) { b.setAttribute("aria-expanded", "false"); });
    ovClose("nav");
  }
  function setupNav() {
    var n = $("#mnav"); if (!n) return;
    var cats = $("#mnavCats");
    M.categories.forEach(function (cat) {
      var cnt = setsFor(cat.id).length; cat.groups.forEach(function (g) { cnt += g.cards.filter(function (c) { return !c.placeholder; }).length; });
      var b = document.createElement("button"); b.type = "button"; b.dataset.cat = cat.id;
      b.innerHTML = "<span>" + esc(cat.title) + '</span><span class="n">' + cnt + "</span>";
      b.addEventListener("click", function () {
        closeNav();
        setTimeout(function () { showCat(cat.id, false); var m = $(".menu-layout"); if (m) window.scrollTo({ top: scrollY + m.getBoundingClientRect().top - headerOffset(), behavior: reduceMotion ? "auto" : "smooth" }); setHash("menu"); }, 160);
      });
      cats.appendChild(b);
    });
    $$("#mnavCats button").forEach(function (b) { b.classList.toggle("active", b.dataset.cat === activeCat); });
    document.addEventListener("click", function (e) {
      if (e.target.closest("[data-open-nav]")) { e.preventDefault(); openNav(); }
      else if (e.target.closest("[data-close-nav]")) closeNav();
    });
    $("#mnavBackdrop").addEventListener("click", closeNav);
    n.addEventListener("click", function (e) { if (e.target.closest("[data-open-quiz]")) closeNav(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && n.classList.contains("open")) closeNav(); });
  }

  /* ================= Шапка, появление, FAQ ================= */
  function setupHeader() {
    var h = $(".site-header"), on = false, hero = $("#hero"), toTop = $("#toTop");
    if (toTop) toTop.addEventListener("click", function () { scrollToId("top"); });
    function upd() {
      var s = scrollY > 12; if (s !== on) { on = s; h.classList.toggle("scrolled", s); }
      var ph = scrollY > (hero ? hero.offsetHeight * 0.75 : 400); if (ph !== pastHero) { pastHero = ph; renderCart(); }
      if (toTop) { var tt = scrollY < innerHeight * 1.5; if (toTop.hidden !== tt) toTop.hidden = tt; }
    }
    window.addEventListener("scroll", upd, { passive: true }); upd();
    if (!("IntersectionObserver" in window)) return;
    var links = $$('.nav a, .mnav-list a, .bb-item[href^="#"]'), io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) links.forEach(function (a) { a.classList.toggle("active", a.getAttribute("href") === "#" + e.target.id); }); });
    }, { rootMargin: "-45% 0px -50% 0px" });
    links.forEach(function (a) { var s = $(a.getAttribute("href")); if (s) io.observe(s); });
  }
  function setupReveal() {
    var els = $$(".reveal");
    if (reduceMotion || !("IntersectionObserver" in window)) { els.forEach(function (e) { e.classList.add("in"); }); return; }
    els.forEach(function (e) {
      if (!e.style.getPropertyValue("--rd")) { var sib = Array.prototype.indexOf.call(e.parentNode.children, e); e.style.setProperty("--rd", Math.min(sib, 6) * 0.08 + "s"); }
    });
    var io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }); }, { rootMargin: "0px 0px -8% 0px", threshold: .05 });
    els.forEach(function (e) { io.observe(e); });
  }
  function setupFaq() {
    if (reduceMotion) return;
    $$(".faq-list details").forEach(function (d) {
      var a = $(".faq-a", d);
      $("summary", d).addEventListener("click", function (e) {
        e.preventDefault();
        if (d.open) { var h = a.offsetHeight; a.animate([{ height: h + "px", opacity: 1 }, { height: "0px", opacity: 0 }], { duration: 280, easing: "ease-in" }).onfinish = function () { d.open = false; }; }
        else { d.open = true; var h2 = a.offsetHeight; a.animate([{ height: "0px", opacity: 0 }, { height: h2 + "px", opacity: 1 }], { duration: 360, easing: "cubic-bezier(.2,.8,.2,1)" }); }
      });
    });
  }

  /* ================= Настройки на странице ================= */
  function applySettings() {
    document.body.className = document.body.className.replace(/season-\S+/g, "").trim() + " season-" + (S.season || "none");
    $$("[data-phone]").forEach(function (a) { a.href = "tel:" + S.phoneRaw; });
    $$("[data-phone-text]").forEach(function (e) { e.textContent = S.phone; });
    $$("[data-vk]").forEach(function (a) { a.href = S.vk; });
    $$("[data-vk-msg]").forEach(function (a) { a.href = S.vkMessage || S.vk; });
    $$("[data-hours]").forEach(function (e) { e.textContent = S.hours; });
    $$("[data-reply]").forEach(function (e) { e.textContent = S.replyTime; });
    if ($("#brandSub")) $("#brandSub").textContent = S.brandSub || "";
    if ($("#year")) $("#year").textContent = new Date().getFullYear();
    var extra = "", fx = "";
    if (S.telegram) { extra += '<a class="btn btn-ghost" href="' + esc(S.telegram) + '" target="_blank" rel="noopener">Telegram</a>'; fx += '<a class="fab-item" href="' + esc(S.telegram) + '" target="_blank" rel="noopener">' + ICON("i-chat") + "<span><b>Telegram</b><small>написать</small></span></a>"; }
    if (S.max) { extra += '<a class="btn btn-ghost" href="' + esc(S.max) + '" target="_blank" rel="noopener">MAX</a>'; fx += '<a class="fab-item" href="' + esc(S.max) + '" target="_blank" rel="noopener">' + ICON("i-chat") + "<span><b>MAX</b><small>написать</small></span></a>"; }
    if ($("#contactExtra")) $("#contactExtra").innerHTML = extra;
    if ($("#fabExtra")) $("#fabExtra").innerHTML = fx;
    var promo = $("#promo"), left = daysToDeadline();
    if (promo) { if (left > 0) $("#promoText").innerHTML = "Новогодние заказы — до " + human(S.newYearDeadline) + '<span class="opt"> включительно</span> · осталось ' + left + " " + plural(left, ["день", "дня", "дней"]); else promo.hidden = true; }
    if (S.metrikaId) {
      (function (m, e, t, r, i, k, a) { m[i] = m[i] || function () { (m[i].a = m[i].a || []).push(arguments); }; m[i].l = 1 * new Date(); k = e.createElement(t); a = e.getElementsByTagName(t)[0]; k.async = 1; k.src = r; a.parentNode.insertBefore(k, a); })(window, document, "script", "https://mc.yandex.ru/metrika/tag.js", "ym");
      window.ym(S.metrikaId, "init", { clickmap: true, trackLinks: true, accurateTrackBounce: true });
    }
  }

  applySettings();
  renderMarquee();
  renderHits();
  renderSets();
  renderBoxes();
  renderMenu();
  setupSearch();
  setupCart();
  setupAdded();
  setupDialogs();
  setupQV();
  setupQuiz();
  setupCalc();
  setupSnow();
  setupBaubles();
  setupParallax();
  setupPause();
  setupCountdown();
  setupFab();
  setupNYCard();
  setupNav();
  setupAnchors();
  setupFormHeight();
  setupHeader();
  setupReveal();
  setupFaq();
  renderCart();
  window.WOF = { cart: function () { return cart; }, ITEMS: ITEMS, orderText: orderText, orderLink: orderLink, openQuiz: openQuiz, openQV: openQV, CARDS: CARDS };
})();
