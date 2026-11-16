/* whatsappCheckout.js
   Tallies the visitor's current on-page selections and redirects to wa.me.
   No cart, no total-cost math — this only assembles what the visitor picked
   into a formatted message, per the agreed blueprint. */

/**
 * @param {Object} selection
 * @param {string} selection.categoryName     e.g. "Soft Cover"
 * @param {string} selection.subCategoryName  e.g. "Bifold & Trifold"
 * @param {string} selection.customerName     e.g. "Rudi & Erika" (used as the model reference)
 * @param {string} selection.tierLabel        e.g. "500 pcs"
 * @param {number} selection.tierPrice        e.g. 3100 (Rp/pcs at that tier)
 * @param {string[]} selection.addOns         e.g. ["Wax Seal", "Tali Rami"]
 * @param {string} selection.productLink      full URL of the detail page being viewed
 */
function buildWhatsAppMessage(selection) {
  const addOnLine = selection.addOns.length ? selection.addOns.join(", ") : "Tidak ada";

  const lines = [
    "Halo, saya tertarik dengan undangan Enzo Wedding dan ingin melakukan pemesanan.",
    "",
    "Detail Pesanan:",
    `- Kategori: ${selection.categoryName} - ${selection.subCategoryName}`,
    `- Model: ${selection.customerName}`,
    `- Paket: ${selection.tierLabel} (${formatRupiah(selection.tierPrice)}/pcs)`,
    `- Tambahan (Add-on): ${addOnLine}`,
    "",
    "Link Produk:",
    selection.productLink,
    "",
    "Mohon info selanjutnya ya kak. Terima kasih!",
  ];

  return lines.join("\n");
}

/** Reads the current selection state from the detail page and redirects to WhatsApp */
function sendToWhatsApp(selection) {
  const text = buildWhatsAppMessage(selection);
  const url = `https://wa.me/${ENZO_WA_NUMBER}?text=${encodeURIComponent(text)}`;
  window.open(url, "_blank", "noopener");
}

/**
 * Same idea as buildWhatsAppMessage/sendToWhatsApp but for the new
 * schema-driven catalog items (renderItemOverlay.js), which don't have a
 * fixed category/sub-category/customerName shape.
 * @param {Object} selection
 * @param {string} selection.itemName
 * @param {string} selection.subCategory
 * @param {string} selection.tierLabel
 * @param {number} selection.tierPrice     base price per pcs
 * @param {Object[]} [selection.addOns]    e.g. [{ name: "Wax Seal", price: 1300 }]
 */
function buildItemWhatsAppMessage(selection) {
  const addOns = selection.addOns || [];
  const addOnTotal = addOns.reduce((sum, a) => sum + a.price, 0);
  const grandTotal = selection.tierPrice + addOnTotal;

  const lines = [
    "Halo, saya tertarik dengan undangan Enzo Wedding dan ingin melakukan pemesanan.",
    "",
    "Detail Pesanan:",
    `- Model: ${selection.itemName}`,
    `- Kategori: ${selection.subCategory}`,
    `- Jumlah: ${selection.tierLabel}`,
    `- Harga Dasar: ${formatRupiah(selection.tierPrice)}/pcs`,
  ];

  if (addOns.length) {
    lines.push(`- Tambahan (Add-on): ${addOns.map((a) => `${a.name} (+${formatRupiah(a.price)})`).join(", ")}`);
    lines.push(`- Total: ${formatRupiah(grandTotal)}/pcs`);
  }

  lines.push("", "Mohon info selanjutnya ya kak. Terima kasih!");
  return lines.join("\n");
}

function sendItemToWhatsApp(selection) {
  const text = buildItemWhatsAppMessage(selection);
  const url = `https://wa.me/${ENZO_WA_NUMBER}?text=${encodeURIComponent(text)}`;
  window.open(url, "_blank", "noopener");
}