// One-shot seed (doc/base.md §4): fetch DummyJSON /products, transform to
// the "Productos" sheet columns (doc/base.md §2.1) and print CSV to stdout —
// no credentials, no sync logic, run once and forget:
//
//   node scripts/seed-dummyjson.mjs > seed-productos.csv
//
// Then paste into the sheet. The Sheet becomes the real source from there.

const FUENTE = 'https://dummyjson.com/products?limit=0';

/** Escape one CSV field (RFC 4180): quote when it holds , " or newline. */
function campo(valor) {
  const texto = String(valor ?? '');
  return /[",\n]/.test(texto) ? `"${texto.replaceAll('"', '""')}"` : texto;
}

async function main() {
  const respuesta = await fetch(FUENTE);
  if (!respuesta.ok) {
    throw new Error(`DummyJSON responde ${respuesta.status}`);
  }
  const { products } = await respuesta.json();
  if (!Array.isArray(products) || products.length === 0) {
    throw new Error('DummyJSON devolvió 0 productos');
  }

  const encabezados = [
    'id',
    'nombre',
    'categoria',
    'precio',
    'stock',
    'sku/codigo_barras',
    'imagen_url',
    'activo',
  ];
  const filas = products.map((p) => [
    `p${String(p.id).padStart(3, '0')}`, // doc examples use p001-style ids
    p.title,
    Array.isArray(p.tags) && p.tags.length > 0 ? p.tags[0] : 'general',
    p.price,
    p.stock,
    p.sku ?? '',
    p.thumbnail ?? '',
    'true',
  ]);

  const csv = [encabezados, ...filas].map((fila) => fila.map(campo).join(',')).join('\n');
  process.stdout.write(csv + '\n');
  console.error(`Seed listo: ${products.length} productos → stdout`);
}

main().catch((error) => {
  console.error(`Seed falló: ${error.message}`);
  process.exit(1);
});
