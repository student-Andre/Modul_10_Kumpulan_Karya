/* app.js — global config + shared utilities (Tier A: no backend, no build step).
   Catalog data now comes from window.products (set by data.js, loaded before
   this file) instead of a fetched catalog.json. */

const ENZO_WA_NUMBER = "62895377696312";

/* Site-wide promo strip shown at the top of the page. Edit freely — no
   longer tied to per-product data. */
const PROMO_MESSAGES = [
  "Official Vendor Kaesang–Erina Wedding 2022",
  "Free Hotprint Gold di setiap pesanan",
  "Free Undangan Website aktif 3 bulan",
];

function formatRupiah(n) {
  return "Rp " + Number(n).toLocaleString("id-ID");
}

/** 2-letter monogram fallback for products without photography yet */
function initialsFromName(name) {
  return (
    name.replace(/[()]/g, "").trim().split(/\s+/)
      .filter((w) => w.length > 1 || /[A-Za-z]/.test(w))
      .slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "EW"
  );
}

function getParams() {
  return Object.fromEntries(new URLSearchParams(window.location.search).entries());
}

/** Build a ?a=b&c=d query string from a params object, dropping empty/undefined values */
function buildQuery(params) {
  const usp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") usp.set(k, v);
  });
  const qs = usp.toString();
  return qs ? "?" + qs : window.location.pathname;
}

/** Lowest tier price across every variant of a product */
function lowestVariantPrice(product) {
  let min = null;
  (product.variants || []).forEach((v) => {
    (v.tiers || []).forEach((t) => {
      if (min === null || t.price < min) min = t.price;
    });
  });
  return min;
}

/** Pretty label for a tier qty, e.g. 200 -> "200 pcs" */
function formatQtyLabel(qty) {
  return qty + " pcs";
}

/* Hero video: if assets/video/hero-bg.mp4 exists and can play, show it;
   otherwise keep the fallback hero-bg.png (default visible in markup). */
(function initHeroVideo() {
  const video = document.getElementById("heroVideo");
  const img = document.getElementById("heroImg");
  if (!video || !img) return;

  video.addEventListener("loadeddata", () => {
    video.style.display = "block";
    img.style.display = "none";
  });
  video.addEventListener("error", () => {
    video.style.display = "none";
    img.style.display = "block";
  });
  video.load();
})();