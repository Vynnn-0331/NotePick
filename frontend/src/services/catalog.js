import catalog from '../data/catalog.json';

// Keep imported source records intact; withdrawn products are excluded from all site views.
const withdrawnProductIds = new Set(['np-cef7acfb325f51bb6719']);
const activeCatalog = catalog.filter(product => !withdrawnProductIds.has(product.id));
export function getCatalog() { return activeCatalog; }
export function getCatalogProduct(id) { return activeCatalog.find(row => row.id === id) ?? null; }
