# Apps Script backend

Source of truth for the backend (`doc/astrobase.md` §3.7): this folder is
pushed/pulled with [clasp](https://github.com/google/clasp), never edited only
in the web editor.

Services used (all built-ins of `appsscript.json`, no external libraries):
`SpreadsheetApp`, `PropertiesService`, `Utilities`, `LockService`,
`ContentService` — see `doc/appscriptbase.md` §2.

## Files

| File | Responsibility |
|---|---|
| `Code.gs` | `doGet`/`doPost` entry points + `despacharAccion` router |
| `auth.gs` | login, session creation (+12h), token validation + expired-row cleanup |
| `productos.gs` | public catalog read (active rows, light fields) |
| `ventas.gs` | `registrarVenta` / `actualizarStock` (token + lock) + `buscarFilaPorId` + `historialVentas` (token-gated **read** of the whole log, §4.15) |
| `caja.gs` | `abrirCaja` / `cerrarCaja` (token + lock, upsert por `id_caja`) |
| `categorias.gs` | `obtenerCategorias` + CRUD de categorías con cascade a Productos |
| `utils.gs` | `obtenerLibro()` spreadsheet access (standalone + container-bound) + `respuestaJson` / `respuestaError` (internal detail → Logger only) |
| `appsscript.json` | manifest (V8, `America/Lima`, web app `ANYONE_ANONYMOUS` / `USER_DEPLOYING`) — lives in the clasp root `src/api/` |

The clasp root is **`src/api/`**: it holds `.clasp.json` (script link,
gitignored), `.claspignore` and `appsscript.json`; this folder only has the
`.gs` sources + README.

## clasp workflow

```bash
npm i -g @google/clasp
clasp login
cd src/api
```

The script project is **standalone** (created with `clasp create` at
`src/api/` — a deviation from the container-bound flow sketched in
`doc/extras.md` §3.2): the Sheet is linked through the `SPREADSHEET_ID`
Script Property, which `obtenerLibro()` reads as fallback.

On a fresh clone of this repo (this machine is already linked), re-link from
`src/api/`:

```bash
echo '{ "scriptId": "<SCRIPT_ID>" }' > .clasp.json
```

```bash
cd src/api
clasp push    # repo → Google (deploy the real code)
clasp pull    # Google → repo (pick up manual web-editor edits)
```

`.clasp.json` holds the script ID and is **gitignored** — never commit it
(re-link per clone with the line above).

### Endpoint smoke test

```bash
export PUBLIC_API_URL='https://script.google.com/macros/s/<DEPLOY>/exec'
curl -sL "$PUBLIC_API_URL?action=productos"   # → {"ok":true,...}
curl -sL -H 'Content-Type: text/plain' \
  -d '{"action":"login","usuario":"x","clave":"y"}' "$PUBLIC_API_URL"
# historialVentas needs the token from the login response (§4.15):
curl -sL -H 'Content-Type: text/plain' \
  -d '{"action":"historialVentas","token":"<TOKEN>","data":{}}' "$PUBLIC_API_URL"
```

A backend that predates §4.15 answers `{"ok":false,"error":"accion_no_soportada"}`
to that last one — the client then keeps the local list and stops calling until
its TTL. Remember to `clasp push` + redeploy: **the deployed script is what
serves `PUBLIC_API_URL`, not this repo**.

Do **not** add `-X` to those: Apps Script answers `302` to a
`script.googleusercontent.com/macros/echo` URL that must be re-requested as
**GET** (the executed response is stored server-side per `user_content_key`);
forcing `-X POST` through the redirect returns Google's HTML error page.

## Full deployment checklist

Human-only steps (account/Google required) live in `doc/plan.md`
(Fase 6 — "Checklist humano") and `doc/extras.md` §3:

1. **Sheets** — run `crearHojas()` (see [`../setup/README.md`](../setup/README.md)):
   creates `Productos`, `Categorias`, `Ventas`, `Cajas` and `Sesiones` with
   their exact headers, idempotently.
2. **Script Properties** — `SPREADSHEET_ID` (or `vincularLibroActivo()`),
   `USUARIO`, `CLAVE`.
3. Web-app deploy as "Anyone", seed, first login.

## Sheet bootstrap (`../setup/`)

`../setup/setup.gs` owns the spreadsheet **schema** (sheet names + header
rows, mirroring `doc/base.md` §2.1–§2.5). Run `crearHojas()` from the editor
to create everything a fresh spreadsheet needs; `estadoSetup()` reports what
is missing without writing. Full details in [`../setup/README.md`](../setup/README.md).

## One-shot seed

```bash
node scripts/seed-dummyjson.mjs > seed-productos.csv
```

Paste the CSV into the `Productos` sheet (header row included). Columns are
exactly `doc/base.md` §2.1. After that the Sheet is the real source —
DummyJSON is never touched again (`doc/base.md` §4).
