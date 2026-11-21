(function () {
  "use strict";

  var TG_USER = "yunkers0";
  var PAGE_SIZE = 48;
  var PLACEHOLDER = "assets/placeholder.svg";

  var data = window.MEGAVOLT_DATA || { products: [] };
  var ALL = (data.products || []).slice();
  var byId = new Map();
  var collator = new Intl.Collator("ru");
  var priceFormatter = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });

  var state = {
    q: "",
    category: "",
    subcategory: "",
    brand: "",
    min: null,
    max: null,
    stock: false,
    sort: "default"
  };

  var filtered = [];
  var shown = 0;
  var current = null;

  var el = {
    grid: document.getElementById("grid"),
    empty: document.getElementById("empty"),
    loadMore: document.getElementById("loadMore"),
    resultCount: document.getElementById("resultCount"),
    search: document.getElementById("search"),
    searchForm: document.getElementById("searchForm"),
    searchClear: document.getElementById("searchClear"),
    category: document.getElementById("category"),
    subcategory: document.getElementById("subcategory"),
    brand: document.getElementById("brand"),
    priceMin: document.getElementById("priceMin"),
    priceMax: document.getElementById("priceMax"),
    inStock: document.getElementById("inStock"),
    sort: document.getElementById("sort"),
    resetFilters: document.getElementById("resetFilters"),
    emptyReset: document.getElementById("emptyReset"),
    filters: document.getElementById("filters"),
    filtersToggle: document.getElementById("filtersToggle"),
    year: document.getElementById("year"),
    modal: document.getElementById("modal"),
    toast: document.getElementById("toast"),
    mMain: document.getElementById("mMain"),
    mThumbs: document.getElementById("mThumbs"),
    mSale: document.getElementById("mSale"),
    mBrand: document.getElementById("mBrand"),
    mTitle: document.getElementById("mTitle"),
    mSku: document.getElementById("mSku"),
    mPrice: document.getElementById("mPrice"),
    mOldPrice: document.getElementById("mOldPrice"),
    mStock: document.getElementById("mStock"),
    mBuy: document.getElementById("mBuy"),
    mSpecsWrap: document.getElementById("mSpecsWrap"),
    mSpecs: document.getElementById("mSpecs"),
    mDescWrap: document.getElementById("mDescWrap"),
    mDesc: document.getElementById("mDesc"),
    copySku: document.getElementById("copySku")
  };

  function normalize(value) {
    return String(value || "").toLowerCase().replace(/ё/g, "е");
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function formatPrice(value) {
    return priceFormatter.format(Math.round(Number(value) || 0)) + " \u20BD";
  }

  function discount(product) {
    if (!product.oldPrice || product.oldPrice <= product.price) return 0;
    return Math.round((1 - product.price / product.oldPrice) * 100);
  }

  function plural(count, one, few, many) {
    var mod10 = count % 10;
    var mod100 = count % 100;
    if (mod10 === 1 && mod100 !== 11) return one;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
    return many;
  }

  function telegramLink(product) {
    var text = [
      "Здравствуйте! Хочу оформить заказ на МегаВольт24.",
      "Артикул: " + (product.sku || "—"),
      "Товар: " + product.title,
      "Цена: " + formatPrice(product.price),
      "Количество: 1"
    ].join("\n");
    return "https://t.me/" + TG_USER + "?text=" + encodeURIComponent(text);
  }

  function isInStock(product) {
    return product.availability === "В наличии";
  }

  function stockBadge(product) {
    if (isInStock(product)) {
      return '<span class="badge badge--in">В наличии</span>';
    }
    return '<span class="badge badge--pre">' + escapeHtml(product.availability || "Под заказ") + "</span>";
  }

  function cardHtml(product) {
    var sale = discount(product);
    var badges = "";
    if (sale > 0) badges += '<span class="badge badge--sale">-' + sale + "%</span>";
    badges += stockBadge(product);

    var image = product.images && product.images[0] ? product.images[0] : PLACEHOLDER;
    var oldPrice = product.oldPrice
      ? "<s>" + formatPrice(product.oldPrice) + "</s>"
      : "";

    return (
      '<article class="card" data-id="' + escapeHtml(product.id) + '">' +
        '<button class="card__media" type="button" data-open="' + escapeHtml(product.id) + '" aria-label="Открыть ' + escapeHtml(product.title) + '">' +
          '<img src="' + escapeHtml(image) + '" alt="' + escapeHtml(product.title) + '" loading="lazy" decoding="async" referrerpolicy="no-referrer">' +
          '<span class="card__badges">' + badges + "</span>" +
        "</button>" +
        '<div class="card__body">' +
          '<p class="card__brand">' + escapeHtml(product.brand) + "</p>" +
          '<h3 class="card__title"><button type="button" data-open="' + escapeHtml(product.id) + '">' + escapeHtml(product.title) + "</button></h3>" +
          '<p class="card__sku">Арт. ' + escapeHtml(product.sku || "—") + "</p>" +
          '<div class="card__bottom">' +
            '<div class="card__price"><span>' + formatPrice(product.price) + "</span>" + oldPrice + "</div>" +
            '<a class="card__buy" href="' + escapeHtml(telegramLink(product)) + '" target="_blank" rel="noopener" data-buy>Купить</a>' +
          "</div>" +
        "</div>" +
      "</article>"
    );
  }

  function buildIndex() {
    ALL.forEach(function (product) {
      product.id = String(product.id || product.sku || product.title);
      product._hay = normalize(
        [product.title, product.sku, product.brand, product.category, product.subcategory].join(" ")
      );
      byId.set(product.id, product);
    });
  }

  function uniqueSorted(values) {
    return Array.from(new Set(values.filter(Boolean))).sort(collator.compare);
  }

  function fillSelect(select, values, placeholder) {
    var html = '<option value="">' + placeholder + "</option>";
    values.forEach(function (value) {
      html += '<option value="' + escapeHtml(value) + '">' + escapeHtml(value) + "</option>";
    });
    select.innerHTML = html;
  }

  function fillSubcategories(category) {
    var values = uniqueSorted(
      ALL.filter(function (product) {
        return !category || product.category === category;
      }).map(function (product) {
        return product.subcategory;
      })
    );
    fillSelect(el.subcategory, values, "Все подкатегории");
    el.subcategory.disabled = values.length === 0;
  }

  function initFilters() {
    fillSelect(el.category, uniqueSorted(ALL.map(function (p) { return p.category; })), "Все категории");
    fillSelect(el.brand, uniqueSorted(ALL.map(function (p) { return p.brand; })), "Все бренды");
    fillSubcategories("");
  }

  function applyFilters() {
    var tokens = normalize(state.q).split(/\s+/).filter(Boolean);
    var result = [];

    for (var i = 0; i < ALL.length; i++) {
      var product = ALL[i];

      if (state.category && product.category !== state.category) continue;
      if (state.subcategory && product.subcategory !== state.subcategory) continue;
      if (state.brand && product.brand !== state.brand) continue;
      if (state.stock && !isInStock(product)) continue;
      if (state.min !== null && product.price < state.min) continue;
      if (state.max !== null && product.price > state.max) continue;

      if (tokens.length) {
        var hay = product._hay;
        var matches = true;
        for (var t = 0; t < tokens.length; t++) {
          if (hay.indexOf(tokens[t]) === -1) {
            matches = false;
            break;
          }
        }
        if (!matches) continue;
      }

      result.push(product);
    }

    if (state.sort === "price-asc") {
      result.sort(function (a, b) { return a.price - b.price; });
    } else if (state.sort === "price-desc") {
      result.sort(function (a, b) { return b.price - a.price; });
    } else if (state.sort === "name") {
      result.sort(function (a, b) { return collator.compare(a.title, b.title); });
    }

    return result;
  }

  function render(reset) {
    if (reset) {
      filtered = applyFilters();
      shown = 0;
      el.grid.innerHTML = "";
    }

    var end = Math.min(shown + PAGE_SIZE, filtered.length);
    var html = "";
    for (var i = shown; i < end; i++) {
      html += cardHtml(filtered[i]);
    }
    if (html) el.grid.insertAdjacentHTML("beforeend", html);
    shown = end;

    el.empty.hidden = filtered.length !== 0;
    el.loadMore.hidden = shown >= filtered.length;

    if (filtered.length === 0) {
      el.resultCount.innerHTML = "Ничего не найдено";
    } else {
      el.resultCount.innerHTML =
        "Найдено: <strong>" + filtered.length + "</strong> " +
        plural(filtered.length, "товар", "товара", "товаров") +
        (filtered.length > shown ? " · показано " + shown : "");
    }
  }

  function parsePrice(input) {
    var value = parseFloat(input.value);
    return isNaN(value) || value < 0 ? null : value;
  }

  function debounce(fn, delay) {
    var timer = null;
    return function () {
      clearTimeout(timer);
      timer = setTimeout(fn, delay);
    };
  }

  function resetAll() {
    state.q = "";
    state.category = "";
    state.subcategory = "";
    state.brand = "";
    state.min = null;
    state.max = null;
    state.stock = false;
    state.sort = "default";

    el.search.value = "";
    el.searchClear.hidden = true;
    el.category.value = "";
    el.brand.value = "";
    el.priceMin.value = "";
    el.priceMax.value = "";
    el.inStock.checked = false;
    el.sort.value = "default";
    fillSubcategories("");
    el.subcategory.value = "";
    render(true);
  }

  function toast(message) {
    el.toast.textContent = message;
    el.toast.classList.add("is-visible");
    clearTimeout(toast._timer);
    toast._timer = setTimeout(function () {
      el.toast.classList.remove("is-visible");
    }, 2200);
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      try {
        var area = document.createElement("textarea");
        area.value = text;
        area.setAttribute("readonly", "");
        area.style.position = "fixed";
        area.style.opacity = "0";
        document.body.appendChild(area);
        area.select();
        document.execCommand("copy");
        document.body.removeChild(area);
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  }

  function setImage(img, src, alt) {
    delete img.dataset.fallback;
    img.classList.remove("is-placeholder");
    img.src = src || PLACEHOLDER;
    if (alt != null) img.alt = alt;
  }

  function openProduct(id, push) {
    var product = byId.get(String(id));
    if (!product) return;

    current = product;

    var images = (product.images || []).slice();
    setImage(el.mMain, images[0] || PLACEHOLDER, product.title);

    var sale = discount(product);
    el.mSale.hidden = sale <= 0;
    el.mSale.textContent = sale > 0 ? "-" + sale + "%" : "";

    el.mThumbs.innerHTML = images.length > 1
      ? images.map(function (src, index) {
          return (
            '<button type="button" data-index="' + index + '" class="' + (index === 0 ? "is-active" : "") + '" aria-label="Фото ' + (index + 1) + '">' +
              '<img src="' + escapeHtml(src) + '" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">' +
            "</button>"
          );
        }).join("")
      : "";

    el.mBrand.textContent = product.brand;
    el.mTitle.textContent = product.title;
    el.mSku.textContent = product.sku || "—";
    el.copySku.hidden = !product.sku;

    el.mPrice.textContent = formatPrice(product.price);
    el.mOldPrice.hidden = !product.oldPrice;
    el.mOldPrice.textContent = product.oldPrice ? formatPrice(product.oldPrice) : "";

    el.mStock.textContent = product.availability || "Уточняйте наличие";
    el.mStock.className = "product__stock " + (isInStock(product) ? "is-in" : "is-pre");

    el.mBuy.href = telegramLink(product);

    var specs = product.specs || {};
    var keys = Object.keys(specs);
    el.mSpecsWrap.hidden = keys.length === 0;
    el.mSpecs.innerHTML = keys.map(function (key) {
      return "<tr><td>" + escapeHtml(key) + "</td><td>" + escapeHtml(specs[key]) + "</td></tr>";
    }).join("");

    el.mDescWrap.hidden = !product.description;
    el.mDesc.textContent = product.description || "";

    el.modal.hidden = false;
    document.body.classList.add("no-scroll");

    if (push !== false && window.location.hash !== "#product-" + encodeURIComponent(product.id)) {
      history.pushState({ product: product.id }, "", "#product-" + encodeURIComponent(product.id));
    }

    el.modal.querySelector(".modal__close").focus({ preventScroll: true });
  }

  function closeModal(updateHash) {
    if (el.modal.hidden) return;
    el.modal.hidden = true;
    document.body.classList.remove("no-scroll");
    current = null;
    if (updateHash !== false && window.location.hash.indexOf("#product-") === 0) {
      history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  }

  function route() {
    var match = window.location.hash.match(/^#product-(.+)$/);
    if (match) {
      openProduct(decodeURIComponent(match[1]), false);
    } else {
      closeModal(false);
    }
  }

  function bindEvents() {
    el.searchForm.addEventListener("submit", function (event) {
      event.preventDefault();
    });

    var onSearch = debounce(function () {
      state.q = el.search.value;
      render(true);
    }, 130);

    el.search.addEventListener("input", function () {
      el.searchClear.hidden = el.search.value === "";
      onSearch();
    });

    el.searchClear.addEventListener("click", function () {
      el.search.value = "";
      el.searchClear.hidden = true;
      state.q = "";
      render(true);
      el.search.focus();
    });

    el.category.addEventListener("change", function () {
      state.category = el.category.value;
      state.subcategory = "";
      fillSubcategories(state.category);
      el.subcategory.value = "";
      render(true);
    });

    el.subcategory.addEventListener("change", function () {
      state.subcategory = el.subcategory.value;
      render(true);
    });

    el.brand.addEventListener("change", function () {
      state.brand = el.brand.value;
      render(true);
    });

    var onPrice = debounce(function () {
      state.min = parsePrice(el.priceMin);
      state.max = parsePrice(el.priceMax);
      render(true);
    }, 300);

    el.priceMin.addEventListener("input", onPrice);
    el.priceMax.addEventListener("input", onPrice);

    el.inStock.addEventListener("change", function () {
      state.stock = el.inStock.checked;
      render(true);
    });

    el.sort.addEventListener("change", function () {
      state.sort = el.sort.value;
      render(true);
    });

    el.resetFilters.addEventListener("click", resetAll);
    el.emptyReset.addEventListener("click", resetAll);

    el.loadMore.addEventListener("click", function () {
      render(false);
    });

    el.grid.addEventListener("click", function (event) {
      if (event.target.closest("a[data-buy]")) return;
      var opener = event.target.closest("[data-open]");
      if (opener) openProduct(opener.getAttribute("data-open"));
    });

    el.filtersToggle.addEventListener("click", function () {
      var open = el.filters.classList.toggle("is-open");
      el.filtersToggle.classList.toggle("is-active", open);
      el.filtersToggle.setAttribute("aria-expanded", String(open));
    });

    el.mThumbs.addEventListener("click", function (event) {
      var button = event.target.closest("button[data-index]");
      if (!button || !current) return;
      var index = Number(button.getAttribute("data-index"));
      var images = current.images || [];
      setImage(el.mMain, images[index] || PLACEHOLDER, current.title);
      Array.prototype.forEach.call(el.mThumbs.children, function (item) {
        item.classList.toggle("is-active", item === button);
      });
    });

    el.modal.addEventListener("click", function (event) {
      if (event.target.closest("[data-close]")) closeModal();
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") closeModal();
    });

    el.copySku.addEventListener("click", function () {
      if (!current) return;
      var sku = current.sku;
      copyText(sku).then(function () {
        toast("Артикул скопирован: " + sku);
      }).catch(function () {
        toast("Не удалось скопировать. Артикул: " + sku);
      });
    });

    document.addEventListener("error", function (event) {
      var target = event.target;
      if (!target || target.tagName !== "IMG" || target.dataset.fallback) return;
      target.dataset.fallback = "1";
      target.classList.add("is-placeholder");
      target.src = PLACEHOLDER;
    }, true);

    window.addEventListener("hashchange", route);
  }

  function init() {
    buildIndex();
    initFilters();
    bindEvents();
    el.year.textContent = new Date().getFullYear();
    render(true);
    route();
  }

  if (!window.MEGAVOLT_DATA) {
    el.grid.innerHTML = '<p class="loading">Не удалось загрузить каталог. Обновите страницу.</p>';
    return;
  }

  init();
})();
