# `setup/` — spreadsheet bootstrap

One function that creates **every sheet the backend reads**, with the exact
header row each handler expects. No hand-typed column names, no guessing the
order — the schema lives in one place (`setup.gs` → `HOJAS`) and mirrors
`doc/base.md` §2.1–§2.6.

These are `.gs` sources in the clasp root (`src/api/`), so `clasp push` ships
them with the rest of the backend. The README itself is ignored by
`.claspignore` (`*.md`) — it stays local.

## Quick start (fresh spreadsheet)

1. `cd src/api && clasp push` — upload the `.gs` sources.
2. Open the Apps Script editor bound to the script.
3. *(Optional, container-bound only)* run `vincularLibroActivo()` — stores
   `SPREADSHEET_ID` in the Script Properties. A standalone script has no
   active spreadsheet: set that property by hand instead.
4. Run **`crearHojas()`**.
5. Set the remaining Script Properties: `USUARIO`, `CLAVE` — run
   **`guardarCredenciales()`** (local, gitignored `credenciales.gs`, so the
   password never reaches git) or set them by hand in
   `Configuración del proyecto → Propiedades del script`.
6. Deploy the Web App and smoke-test `?action=productos`.

| Function | Effect |
|---|---|
| `crearHojas()` | Creates missing sheets + headers, appends missing columns. Idempotent. |
| `estadoSetup()` | Read-only: what exists, what is missing, what will change. |
| `vincularLibroActivo()` | Writes `SPREADSHEET_ID` from the currently open spreadsheet. |
| `guardarCredenciales()` | Writes `USUARIO`/`CLAVE` Script Properties (never deletes the others). |
| `estadoCredenciales()` | Read-only: are `USUARIO`/`CLAVE` stored? Values stay masked. |

## Sheets created

| Sheet | Source | Read style |
|---|---|---|
| `Productos` | `base.md` §2.1 | header-name lookup (`productos.gs`) |
| `Categorias` | `base.md` §2.5 | header-name lookup (`categorias.gs`) |
| `Marcas` | `base.md` §2.6 | header-name lookup (`marcas.gs`) |
| `Ventas` | `base.md` §2.2 | **positional** — order is the contract (`ventas.gs`) |
| `Cajas` | `base.md` §2.4 | header-name lookup + upsert by `id_caja` (`caja.gs`) |
| `Sesiones` | `auth.gs` | **positional** — `validarToken()` skips row 1 as header |

### Why the two read styles matter

`Productos`, `Categorias`, `Marcas` and `Cajas` resolve their columns **by
header name**, so a missing header can be appended as a trailing column
without breaking anything. `Ventas` and `Sesiones` read by **fixed
position**:

```
Ventas:   fecha_hora | id_venta | items | total | metodo_pago | sincronizado
Sesiones: token      | creado   | expira
```

If one of those two is short a column, appending it at the end would shift
the contract. `crearHojas()` handles this the safe way: for a sheet that
already has data and **none** of the expected headers it refuses to write,
reports `FILA1_NO_ES_ENCABEZADO`, and asks a human to look at row 1 first.
It never renames, moves or deletes a column, and it never touches data rows.

### `fecha_día` stays text

`Cajas.fecha_día` is a client-supplied `YYYY-MM-DD` string (regex-validated
on write, grouping key of the historial). On a **newly created** sheet the
column gets the `@` (plain text) format so Google Sheets never parses it into
a date. The format is deliberately not applied to a sheet that already holds
data — reformatting a parsed date column would turn it into a serial number.

## Verify

```js
estadoSetup(); // → one entry per sheet: existe / encabezadosFaltantes / ...
crearHojas();  // → estado: 'creada' | 'ya_existia_completa' | 'columnas_agregadas' | 'FILA1_NO_ES_ENCABEZADO'
```

Both return the report array and mirror it to `Logger` (Execution log).

## After the sheets exist

Seeding the catalog and creating the first session stay outside this folder
on purpose — they are data, not schema:

- **Products**: `node scripts/seed-dummyjson.mjs > seed-productos.csv`, then
  paste the CSV into `Productos` (header row included).
- **Categories & brands**: paste `seed-categorias.csv` / `seed-marcas.csv`
  into `Categorias` / `Marcas` — derived FROM the product seed (distinct
  values, deduped, sorted), so every `categoria`/`marca` a product references
  already exists in its companion sheet. Skip any sheet that already has
  rows: pasting over them would duplicate names.
- **First login**: `USUARIO` / `CLAVE` Script Properties (run
  `guardarCredenciales()` or set them by hand), then `login`.

## Credentials (`credenciales.gs`, local only)

`guardarCredenciales()` writes the initial pair with
`setProperties({...}, false)` — the `false` keeps `SPREADSHEET_ID` (passing
`true` would wipe every other Script Property). The file is in `.gitignore`:
`clasp push` still ships it (`.claspignore` only blocks `*.md`, `*.json`,
`actions/`), git never does. Once run, the values live server-side in Script
Properties and the file is only needed again to rotate them.
