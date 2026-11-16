/* catalogView.js — Tier 1, index.html.
   Schema-driven catalog navigation: 5 primary tabs (Terbaru, Motif,
   Hard Cover, Soft Cover, Color), reading from window.products (data.js)
   instead of a fetched catalog.json. State lives entirely in the URL
   (?tab=&sub=&color=&item=) so every view is a shareable link and
   back/forward works normally. */

(function () {
  const TABS = [
    { key: "terbaru", label: "Terbaru" },
    { key: "motif", label: "Motif" },
    { key: "hardcover", label: "Hard Cover" },
    { key: "softcover", label: "Soft Cover" },
    { key: "color", label: "Color" },
  ];
  const HARDCOVER_SUB_ORDER = [
    "Undangan Ekonomis", "Undangan Envelope Exclusive", "Undangan Fold Exclusive",
    "Undangan Prestige Exclusive", "Roll Invitation Luxury Box",
  ];
  const SOFTCOVER_SUB_ORDER = [
    "Undangan Ekonomis", "Undangan Standard", "Undangan Envelope Exclusive",
  ];
  const MOTIF_ORDER = ["Java", "Nusantara", "Modern", "Minimalis"];
  const MOTIF_TITLE = { Java: "Java", Nusantara: "Nusantara / Etnik", Modern: "Modern", Minimalis: "Minimalis"};

  const tabBarEl = document.getElementById("catalogTabs");
  const subNavEl = document.getElementById("catalogSubNav");
  const gridEl = document.getElementById("catalogGrid");
  const bannerEl = document.getElementById("promoBanner");

  function slug(s) {
    return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  }

  function orderedUnique(values, order) {
    const uniq = Array.from(new Set(values));
    return uniq.sort((a, b) => {
      const ia = order.indexOf(a), ib = order.indexOf(b);
      if (ia === -1 && ib === -1) return a.localeCompare(b);
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
  }

  function currentState() {
    const p = getParams();
    // Cek penyimpanan browser untuk tab terakhir
    const savedTab = sessionStorage.getItem('enzo_active_tab');
    const defaultTab = savedTab && TABS.some(t => t.key === savedTab) ? savedTab : "terbaru";
    
    return { tab: p.tab || defaultTab, sub: p.sub || "", color: p.color || "", item: p.item || "" };
  }

  function navigate(next, push) {
    const state = { ...currentState(), ...next };
    
    // Simpan tab ke memori browser setiap kali ada navigasi
    if (next.tab) sessionStorage.setItem('enzo_active_tab', next.tab);
    
    const url = buildQuery(state);
    if (push) history.pushState(null, "", url);
    else history.replaceState(null, "", url);
    render();
  }

  function renderBanner() {
    bannerEl.innerHTML = `
      <div class="wrap promo-banner-inner">
        ${PROMO_MESSAGES.map((m) => `<span>✦ ${m}</span>`).join("")}
      </div>`;
  }

  function renderTabs(state) {
    tabBarEl.innerHTML = TABS.map((t) => `
      <button class="cat-tab${t.key === state.tab ? " active" : ""}" data-tab="${t.key}">${t.label}</button>
    `).join("");
    tabBarEl.querySelectorAll(".cat-tab").forEach((btn) => {
      btn.addEventListener("click", () => navigate({ tab: btn.dataset.tab, sub: "", color: "" }, true));
    });
  }

/** Motifs actually present in the catalog, in canonical order (Java, Nusantara, ...) */
function activeMotifSubs() {
    return orderedUnique(products.filter((p) => p.motifCategory).map((p) => p.motifCategory), MOTIF_ORDER);
  }

  function renderSubNav(state) {
    subNavEl.innerHTML = "";
    subNavEl.style.display = "flex";

    if (state.tab === "hardcover" || state.tab === "softcover") {
      const items = products.filter((p) => p.coverType === state.tab);
      const order = state.tab === "hardcover" ? HARDCOVER_SUB_ORDER : SOFTCOVER_SUB_ORDER;
      const subs = orderedUnique(items.map((p) => p.category), order);
      subNavEl.innerHTML = `<button class="filter-pill${!state.sub ? " active" : ""}" data-sub="">Semua</button>` +
        subs.map((s) => `<button class="filter-pill${state.sub === slug(s) ? " active" : ""}" data-sub="${slug(s)}">${s}</button>`).join("");
      subNavEl.querySelectorAll(".filter-pill").forEach((btn) => {
        btn.addEventListener("click", () => navigate({ sub: btn.dataset.sub }, true));
      });
    } else if (state.tab === "motif") {
      const subs = activeMotifSubs();
      const activeSub = state.sub || slug(subs[0] || "");
      subNavEl.innerHTML = subs.map((s) => `<button class="filter-pill${activeSub === slug(s) ? " active" : ""}" data-sub="${slug(s)}">${MOTIF_TITLE[s] || s}</button>`).join("");
      subNavEl.querySelectorAll(".filter-pill").forEach((btn) => {
        btn.addEventListener("click", () => navigate({ sub: btn.dataset.sub }, true));
      });
    } else if (state.tab === "color") {
      const colors = orderedUnique(products.flatMap((p) => p.colors || []), []);
      subNavEl.innerHTML = colors.map((c) => `
        <button class="filter-pill color-pill${state.color === slug(c) ? " active" : ""}" data-color="${slug(c)}">
          <span class="swatch" style="background:${COLOR_SWATCHES[c] || "#ccc"}"></span>${c}
        </button>`).join("");
      subNavEl.querySelectorAll(".filter-pill").forEach((btn) => {
        btn.addEventListener("click", () => navigate({ color: btn.dataset.color }, true));
      });
    } else {
      subNavEl.style.display = "none";
    }
  }

  function badge(p) {
    if (p.isNew) return `<span class="best-badge new-badge">Baru</span>`;
    if (p.bestSeller) return `<span class="best-badge">Best Seller</span>`;
    return "";
  }

  function cardHtml(p) {
    const img = p.variants[0] && (Array.isArray(p.variants[0].img) ? p.variants[0].img[0] : p.variants[0].img);
    const price = p.startingPrice ? `Mulai ${formatRupiah(p.startingPrice)}/pcs` : "";
    return `
      <article class="feed-card catalog-card" data-item="${p.id}">
        <div class="feed-photo${img ? " has-photo" : ""}">
          ${badge(p)}
          ${img
            ? `<img src="${img}" alt="${p.name}" loading="lazy">`
            : `<div class="mono-tile"><div class="ring">${initialsFromName(p.name)}</div></div>`}
          <div class="feed-scrim"></div>
          <div class="feed-caption">
            <h4>${p.name}</h4>
            <span class="feed-theme">${p.category}</span>
            <div class="catalog-price">${price}</div>
          </div>
        </div>
      </article>`;
  }

  function renderGridItems(items, emptyMsg) {
    if (!items.length) {
      gridEl.innerHTML = `<p style="padding:40px 0;color:rgba(43,36,32,.5);font-size:13px">${emptyMsg}</p>`;
      return;
    }
    gridEl.innerHTML = `<div class="gallery-feed">${items.map(cardHtml).join("")}</div>`;
    attachCardClicks();
  }

  function attachCardClicks() {
    gridEl.querySelectorAll(".catalog-card").forEach((card) => {
      card.addEventListener("click", () => {
        navigate({ item: card.dataset.item }, true);
      });
    });
  }

  function render() {
    const state = currentState();
    renderTabs(state);
    renderSubNav(state);

    let items = products;
    if (state.tab === "terbaru") {
      items = items.filter((p) => p.isNew);
      renderGridItems(items, "Belum ada model terbaru untuk saat ini.");
    } else if (state.tab === "motif") {
      const subs = activeMotifSubs();
      const activeSub = state.sub || slug(subs[0] || "");
      items = items.filter((p) => p.motifCategory && slug(p.motifCategory) === activeSub);
      renderGridItems(items, "Belum ada model untuk motif ini.");
    } else if (state.tab === "hardcover" || state.tab === "softcover") {
      items = items.filter((p) => p.coverType === state.tab);
      if (state.sub) items = items.filter((p) => slug(p.category) === state.sub);
      renderGridItems(items, "Belum ada model untuk kategori ini.");
    } else if (state.tab === "color") {
      if (state.color) {
        items = items.filter((p) => (p.colors || []).some((c) => slug(c) === state.color));
        renderGridItems(items, "Belum ada model dengan warna ini.");
      } else {
        gridEl.innerHTML = `<p style="padding:40px 0;color:rgba(43,36,32,.5);font-size:13px">Pilih warna di atas untuk melihat modelnya.</p>`;
      }
    }

    if (state.item) {
      const item = products.find((p) => p.id === state.item);
      if (item) window.openItemOverlay(item);
    } else if (window.closeItemOverlay) {
      window.closeItemOverlay();
    }
  }

  window.__enzoOnOverlayClose = () => {
    const p = getParams();
    if (p.item) { delete p.item; history.replaceState(null, "", buildQuery(p)); }
  };

  window.addEventListener("popstate", render);

  renderBanner();
  render();
})();