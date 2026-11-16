/* renderItemOverlay.js — full-screen detail overlay for a single product.
   Reworked for the data.js schema: product.variants[] (each with its own
   img + tiers[]), and product.addOns (already resolved per-product by
   data.js — either auto-filled for envelopes or assigned manually). */

(function () {
  let overlayEl = null;
  let selectedVariantIdx = 0;
  let selectedTierIdx = 0;
  let galleryIndex = 0;
  let currentItem = null;
  let selectedAddonIds = new Set();
  let lastClickedAddonId = null;
  let foilCover = null; // null | 'sedang' | 'besar'
  let foilIsi = false;
  let foilColor = "Gold"; // default, no surcharge

  function ensureOverlay() {
    if (overlayEl) return overlayEl;
    overlayEl = document.createElement("div");
    overlayEl.className = "detail-overlay";
    overlayEl.innerHTML = `
      <div class="detail-sheet">
        <button class="overlay-close" aria-label="Tutup">×</button>
        <div class="overlay-scroll">
          <div class="detail-slider" id="itemSlider">
            <img id="itemMainImg" alt="" style="display:none">
            <div class="mono-tile" id="itemMonoTile" style="display:flex"><div class="ring" id="itemRing"></div></div>
            <div class="gallery-arrow prev" id="itemPrev">‹</div>
            <div class="gallery-arrow next" id="itemNext">›</div>
            <div class="slide-counter" id="itemSlideCounter"></div>
          </div>
          <div class="detail-body">
            <span class="eyebrow-tag" id="itemTheme"></span>
            <h2 class="detail-h1" id="itemTitle"></h2>
            <p class="detail-material" id="itemSpecs"></p>

            <div class="section" id="itemDescSection" style="display:none">
              <p class="section-title">Deskripsi</p>
              <p class="detail-material" id="itemDesc"></p>
            </div>

            <div class="section" id="itemVariantSection" style="display:none">
              <p class="section-title">Pilihan</p>
              <div class="tier-row" id="itemVariantRow"></div>
            </div>

            <div class="section">
              <p class="section-title">Pilih Jumlah Pesanan</p>
              <div class="tier-row" id="itemTierRow"></div>
            </div>

            <div class="section" id="itemAddonSection" style="display:none">
              <p class="section-title">Tambahan Aksesoris</p>
              <div class="addon-picker" id="itemAddonPicker"></div>
              <div class="addon-preview" id="itemAddonPreview"><span class="addon-placeholder">Pilih aksesoris untuk melihat preview</span></div>
            </div>

            <div class="section" id="itemFoilSection">
              <p class="section-title">Pilihan Foil</p>
              <p class="detail-material" style="margin:-4px 0 10px">Foil Emas Standard · harga mengikuti jumlah pesanan di atas.</p>
              <div class="addon-picker" id="itemFoilCoverPicker"></div>
              <div class="addon-picker" id="itemFoilIsiPicker" style="margin-top:8px"></div>
              <div class="addon-picker" id="itemFoilColorPicker" style="margin-top:8px"></div>
              <p class="detail-material" id="itemFoilNote" style="margin-top:8px;font-size:12px"></p>
            </div>

            <div class="order-box">
              <div class="order-line"><span>Jumlah dipilih</span><b id="itemSummaryTier"></b></div>
            </div>
          </div>
        </div>
        <div class="overlay-cta">
          <button class="btn btn-whatsapp" id="itemWaBtn">
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.5 14.4c-.3-.1-1.7-.8-2-.9-.3-.1-.5-.1-.7.1-.2.3-.8.9-.9 1.1-.2.2-.3.2-.6.1-1.6-.8-2.6-1.4-3.7-3.2-.3-.5.3-.5.8-1.5.1-.2 0-.4 0-.5-.1-.1-.6-1.5-.8-2-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.5.1-.7.3-.2.3-.9.9-.9 2.1s1 2.5 1.1 2.6c.1.2 2 3 4.8 4.2.7.3 1.2.5 1.6.6.7.2 1.3.2 1.8.1.5-.1 1.7-.7 1.9-1.4.2-.7.2-1.2.2-1.3-.1-.1-.3-.2-.6-.4z"/><path d="M12 2C6.5 2 2 6.5 2 12c0 1.8.5 3.5 1.3 5L2 22l5.1-1.3c1.5.8 3.2 1.3 4.9 1.3 5.5 0 10-4.5 10-10S17.5 2 12 2zm0 18.1c-1.6 0-3.1-.4-4.5-1.2l-.3-.2-3 .8.8-3-.2-.3C4 14.8 3.6 13.4 3.6 12c0-4.6 3.8-8.4 8.4-8.4s8.4 3.8 8.4 8.4-3.8 8.4-8.4 8.4z"/></svg>
            Pesan via WhatsApp
          </button>
        </div>
      </div>`;
    document.body.appendChild(overlayEl);
    overlayEl.querySelector(".overlay-close").addEventListener("click", closeItemOverlay);
    overlayEl.addEventListener("click", (e) => { if (e.target === overlayEl) closeItemOverlay(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && overlayEl.classList.contains("open")) closeItemOverlay(); });
    return overlayEl;
  }

  function closeItemOverlay() {
    if (!overlayEl) return;
    overlayEl.classList.remove("open");
    document.body.style.overflow = "";
    if (window.__enzoOnOverlayClose) window.__enzoOnOverlayClose();
  }

  function activeVariant() {
    return currentItem.variants[selectedVariantIdx];
  }

  function activeTiers() {
    return activeVariant().tiers || [];
  }

  function selectedAddons() {
    return (currentItem.addOns || []).filter((a) => selectedAddonIds.has(a.id));
  }

  /** Foil selections as {name, price} lines, at the currently active tier's
   * qty — combo discount and color surcharge already folded into the price. */
  function selectedFoilLines() {
    if (!foilCover && !foilIsi) return [];
    const tiers = activeTiers();
    const tier = tiers[selectedTierIdx];
    if (!tier) return [];
    const qty = tier.qty;
    const faces = [];
    if (foilCover) faces.push({ key: foilCover, label: foilCover === "sedang" ? "Foil Cover (Uk. Sedang)" : "Foil Cover (Uk. Besar)" });
    if (foilIsi) faces.push({ key: "isi", label: "Foil Isi Nama Mempelai" });

    const colorSurcharge = foilColor !== "Gold" ? FOIL_COLOR_SURCHARGE : 0;
    let total = faces.reduce((sum, f) => sum + foilRate(qty, f.key) + colorSurcharge, 0);
    if (faces.length === 2) total -= FOIL_COMBO_DISCOUNT;

    const colorNote = foilColor !== "Gold" ? ` (${foilColor})` : "";
    const comboNote = faces.length === 2 ? " + combo diskon" : "";
    const name = faces.map((f) => f.label).join(" + ") + colorNote + comboNote;
    return [{ name, price: total }];
  }

  function renderFoilPicker(el) {
    const tiers = activeTiers();
    const tier = tiers[selectedTierIdx];
    const qty = tier ? tier.qty : 0;

    el.querySelector("#itemFoilCoverPicker").innerHTML = `
      <button class="addon-chip${foilCover === null ? " on" : ""}" data-cover="none">Tanpa Foil Cover</button>
      <button class="addon-chip${foilCover === "sedang" ? " on" : ""}" data-cover="sedang">Foil Cover Uk. Sedang +${formatRupiah(foilRate(qty, "sedang"))}</button>
      <button class="addon-chip${foilCover === "besar" ? " on" : ""}" data-cover="besar">Foil Cover Uk. Besar +${formatRupiah(foilRate(qty, "besar"))}</button>`;
    el.querySelectorAll("#itemFoilCoverPicker .addon-chip").forEach((btn) => {
      btn.addEventListener("click", () => {
        const v = btn.dataset.cover;
        foilCover = v === "none" ? null : v;
        renderFoilPicker(el);
        updateSummary(el);
      });
    });

    el.querySelector("#itemFoilIsiPicker").innerHTML = `
      <button class="addon-chip${foilIsi ? " on" : ""}" data-isi="1">Foil Isi Nama Mempelai +${formatRupiah(foilRate(qty, "isi"))}</button>`;
    el.querySelector("#itemFoilIsiPicker .addon-chip").addEventListener("click", () => {
      foilIsi = !foilIsi;
      renderFoilPicker(el);
      updateSummary(el);
    });

    const colorSection = el.querySelector("#itemFoilColorPicker");
    const foilActive = !!(foilCover || foilIsi);
    colorSection.style.display = foilActive ? "flex" : "none";
    if (!foilActive) foilColor = "Gold";
    colorSection.innerHTML = FOIL_COLORS.map((c) => `
      <button class="addon-chip${foilColor === c ? " on" : ""}" data-color="${c}">${c}${c !== "Gold" ? ` +${formatRupiah(FOIL_COLOR_SURCHARGE)}/sisi` : ""}</button>`).join("");
    el.querySelectorAll("#itemFoilColorPicker .addon-chip").forEach((btn) => {
      btn.addEventListener("click", () => {
        foilColor = btn.dataset.color;
        renderFoilPicker(el);
        updateSummary(el);
      });
    });

    const note = el.querySelector("#itemFoilNote");
    note.textContent = (foilCover && foilIsi)
      ? `Pilih Cover + Isi sekaligus: diskon Rp${FOIL_COMBO_DISCOUNT}/pcs otomatis diterapkan.`
      : "";
  }

  function renderVariants(el) {
    const variants = currentItem.variants || [];
    const section = el.querySelector("#itemVariantSection");
    section.style.display = variants.length > 1 ? "block" : "none";
    if (variants.length <= 1) return;

    el.querySelector("#itemVariantRow").innerHTML = variants.map((v, i) => `
      <button class="tier-btn${i === selectedVariantIdx ? " active" : ""}" data-idx="${i}">
        <span class="qty">${v.name}</span>
      </button>`).join("");
    el.querySelectorAll("#itemVariantRow .tier-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        selectedVariantIdx = Number(btn.dataset.idx);
        selectedTierIdx = 0;
        galleryIndex = 0;
        renderVariants(el);
        renderTiers(el);
        renderFoilPicker(el);
        renderSlider(el);
      });
    });
  }

  function renderTiers(el) {
    const tiers = activeTiers();
    if (selectedTierIdx >= tiers.length) selectedTierIdx = 0;
    el.querySelector("#itemTierRow").innerHTML = tiers.map((t, i) => `
      <button class="tier-btn${i === selectedTierIdx ? " active" : ""}" data-idx="${i}">
        <span class="qty">${t.qtyLabel || formatQtyLabel(t.qty)}</span>
        <span class="price">${formatRupiah(t.price)} <small>/pcs</small></span>
      </button>`).join("");
    el.querySelectorAll("#itemTierRow .tier-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        selectedTierIdx = Number(btn.dataset.idx);
        renderTiers(el);
        renderFoilPicker(el);
        updateSummary(el);
      });
    });
    updateSummary(el);
  }

  function renderAddonPicker(el) {
    const section = el.querySelector("#itemAddonSection");
    const addOns = currentItem.addOns || [];
    if (!addOns.length) { section.style.display = "none"; return; }
    section.style.display = "block";

    el.querySelector("#itemAddonPicker").innerHTML = addOns.map((a) => `
      <button class="addon-chip${selectedAddonIds.has(a.id) ? " on" : ""}" data-addon="${a.id}">
        ${a.name} +${formatRupiah(a.price)}
      </button>`).join("");
    el.querySelectorAll("#itemAddonPicker .addon-chip").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.addon;
        selectedAddonIds.has(id) ? selectedAddonIds.delete(id) : selectedAddonIds.add(id);
        renderAddonPicker(el);
        updateSummary(el);
      });
    });

    const preview = el.querySelector("#itemAddonPreview");
    const chosen = selectedAddons();
    if (!chosen.length) {
      preview.className = "addon-preview";
      preview.innerHTML = `<span class="addon-placeholder">Pilih aksesoris untuk melihat preview</span>`;
    } else {
      preview.className = "addon-preview has-items";
      preview.innerHTML = chosen.map((a) => `
        <div class="addon-card">
          <img src="${a.image}" alt="${a.name}">
          <span class="addon-badge">${a.name} +${formatRupiah(a.price)}</span>
        </div>`).join("");
    }
  }

  function updateSummary(el) {
    const tiers = activeTiers();
    const tier = tiers[selectedTierIdx];
    const addOns = selectedAddons().concat(selectedFoilLines());
    const addOnTotal = addOns.reduce((sum, a) => sum + a.price, 0);
    const label = `${tier.qtyLabel || formatQtyLabel(tier.qty)} (` +
      (addOns.length
        ? `${formatRupiah(tier.price)} base + ${formatRupiah(addOnTotal)} add-ons/pcs`
        : `${formatRupiah(tier.price)}/pcs`) + `)`;
    el.querySelector("#itemSummaryTier").textContent = label;
  }

  function renderSlider(el) {
    const variant = activeVariant();
    const images = variant.img ? (Array.isArray(variant.img) ? variant.img : [variant.img]) : [];
    const hasPhoto = images.length > 0;

    const mainImg = el.querySelector("#itemMainImg");
    const monoTile = el.querySelector("#itemMonoTile");
    mainImg.style.display = hasPhoto ? "block" : "none";
    monoTile.style.display = hasPhoto ? "none" : "flex";
    el.querySelector("#itemRing").textContent = initialsFromName(currentItem.name);

    const prevBtn = el.querySelector("#itemPrev");
    const nextBtn = el.querySelector("#itemNext");
    const counter = el.querySelector("#itemSlideCounter");
    const showNav = images.length > 1;
    prevBtn.style.display = showNav ? "grid" : "none";
    nextBtn.style.display = showNav ? "grid" : "none";
    counter.style.display = showNav ? "flex" : "none";

    function showSlide(i) {
      galleryIndex = (i + images.length) % images.length;
      mainImg.src = images[galleryIndex];
      counter.textContent = `${galleryIndex + 1} / ${images.length}`;
    }
    prevBtn.onclick = () => showSlide(galleryIndex - 1);
    nextBtn.onclick = () => showSlide(galleryIndex + 1);
    if (hasPhoto) showSlide(0);
  }

  function openItemOverlay(item) {
    const el = ensureOverlay();
    currentItem = item;
    selectedVariantIdx = 0;
    selectedTierIdx = 0;
    galleryIndex = 0;
    selectedAddonIds = new Set();
    foilCover = null;
    foilIsi = false;
    foilColor = "Gold";

    el.querySelector("#itemTheme").textContent = item.category;
    el.querySelector("#itemTitle").textContent = item.name;
    const lamText = item.lamination && item.lamination !== "None" && item.lamination !== "Not specified"
      ? `Laminasi ${item.lamination}` : "";
    const specs = [item.material, lamText].filter(Boolean).join(" · ");
    el.querySelector("#itemSpecs").textContent = specs;

    const descSection = el.querySelector("#itemDescSection");
    if (item.description) {
      descSection.style.display = "block";
      el.querySelector("#itemDesc").textContent = item.description;
    } else {
      descSection.style.display = "none";
    }

    renderSlider(el);
    renderVariants(el);
    renderTiers(el);
    renderAddonPicker(el);
    renderFoilPicker(el);

    el.querySelector("#itemWaBtn").onclick = () => {
      const tier = activeTiers()[selectedTierIdx];
      sendItemToWhatsApp({
        itemName: item.name,
        subCategory: item.category,
        tierLabel: tier.qtyLabel || formatQtyLabel(tier.qty),
        tierPrice: tier.price,
        addOns: selectedAddons().concat(selectedFoilLines()),
      });
    };

    el.classList.add("open");
    document.body.style.overflow = "hidden";
    el.querySelector(".overlay-scroll").scrollTop = 0;
  }

  window.openItemOverlay = openItemOverlay;
  window.closeItemOverlay = closeItemOverlay;
})();