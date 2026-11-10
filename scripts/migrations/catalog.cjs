// Top-level arrays are sets of catalog objects. Their order depends on the
// database collation, not the schema; enum ordering remains in enumsortorder.
function normalizeCatalog(catalog) {
  const result = {};
  for (const key of Object.keys(catalog).sort()) {
    const rows = catalog[key];
    result[key] = rows === null ? null : rows.map(row =>
      Object.fromEntries(Object.keys(row).sort().map(field => [field, row[field]]))
    ).sort((a,b) => {
      const left=JSON.stringify(a), right=JSON.stringify(b);
      return left < right ? -1 : left > right ? 1 : 0;
    });
  }
  return result;
}
module.exports = { normalizeCatalog };
