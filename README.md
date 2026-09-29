# sensor-ble decoder catalog (template)

A template for publishing your own [sensor-ble](https://github.com/tszheichoi/sensor-ble)
BLE decoders as a **catalog**: a browsable web page on GitHub Pages plus a
machine-readable `decoders.json` that apps can read to offer the decoders for
one-tap installation.

- **Live example:** <https://mhaberler.github.io/sensor-ble-decoder-catalog/>
- **Consumers:** the [Sensor-BLE web app and mobile app](https://github.com/mhaberler/theengs-online-decoder)
  (add the catalog URL, then install from the list), and
  [Sensor Logger](https://www.tszheichoi.com/sensorlogger) (copy a decoder URL
  into *Custom Decoders → Add Decoder*).

## Make your own catalog

1. Click **Use this template** → *Create a new repository*.
2. In the new repo: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Edit [catalog.config.json](catalog.config.json): `title`, `description`, `homepage`.
4. Replace or add decoders in [decoders/](decoders/) (see below) and push to `main`.

The [pages workflow](.github/workflows/pages.yml) builds the site, runs every
decoder's tests, and publishes to `https://<you>.github.io/<repo>/`. A failing
test fails the build, so a broken decoder is never published. Pull requests are
built and tested but not deployed.

## Add a decoder

Each decoder is **one self-contained ES module** in `decoders/<name>.js`,
following the [sensor-ble API](https://github.com/tszheichoi/sensor-ble#sensor-ble-api)
and Sensor Logger's custom-decoder rules:

- no `import` or `require`; `Buffer` and `console` are provided by the host
- exports a `decoder` object with a unique `decoderName` and an
  `advertisementDecode(manufacturerData, serviceData, meta)` function that
  returns an object of readings, or `null` if the payload isn't for it
- matched by `manufacturer` (company ID as it appears in the payload, e.g.
  `"9904"` for Ruuvi's 0x0499), `serviceUUID` (e.g. `"fcd2"`), or `name`
- output keys follow sensor-ble's conventions: `name_unit`, e.g.
  `temperature_C`, `acceleration_x_mg`, `battery_mV`, `…_dimensionless`
- exports `tests`: at least one `{ given: { manufacturerData: "<hex>" }, expected: {…} }`
  pair (`given.serviceData` is `{ "<uuid>": "<hex>" }`). The build compares
  `advertisementDecode` output with `expected` exactly.

Catalog metadata goes on the same `decoder` object; hosts that don't know it
ignore it:

| Field | Meaning |
|---|---|
| `title` | display name |
| `description` | one-line summary |
| `version` | semver; bump it on every change so apps can offer the update |
| `author`, `license` | shown on the page and in apps (the template is MIT; pick your own per decoder) |
| `tags` | keywords for search |

A longer description can go in `decoders/<name>.md` (paragraphs, `code`,
`**bold**`, `[links](https://…)`).

[decoders/ruuvi_example.js](decoders/ruuvi_example.js) is a complete example:
RuuviTag data format 5, written from Ruuvi's public spec, tested with the spec's
four test vectors. It's named `ruuvi_example` so it doesn't replace the
built-in `ruuvi` decoder of sensor-ble hosts.

## Build and preview locally

Node 20 or newer; nothing to install.

```sh
node scripts/build-catalog.js     # runs the tests, writes site/
node scripts/preview.js           # serves site/ on http://localhost:8080/ (CORS open)
```

## Catalog format

`site/decoders.json`:

```json
{
  "schema": 1,
  "title": "…", "description": "…", "homepage": "…", "generated": "2026-…",
  "decoders": [{
    "decoderName": "ruuvi_example", "title": "…", "description": "…",
    "version": "1.0.0", "author": "…", "license": "MIT", "tags": ["ruuvi"],
    "url": "decoders/ruuvi_example.js",
    "sha256": "…",
    "matchers": { "manufacturer": "9904" },
    "updated": "2026-…"
  }]
}
```

- `url` is relative to `decoders.json`, so a copy of the template works
  without edits. Absolute URLs (e.g. a gist's raw URL) are allowed too.
- `sha256` is the hash of the decoder file; apps refuse to install a file that
  doesn't match.
- `schema` is bumped only for incompatible changes.

The page links the JSON with
`<link rel="alternate" type="application/vnd.sensorble.catalog+json" href="decoders.json">`,
so apps accept either the page URL or the JSON URL.

## Page options

[catalog.config.json](catalog.config.json):

| Key | Effect |
|---|---|
| `title`, `description`, `homepage` | page header and `decoders.json` |
| `webAppUrl` | shows an **Add to Sensor-BLE** button linking to `<webAppUrl>?catalog=<this site>`; remove it to hide the button |
| `qrTarget` | what the page's QR code opens: `"web"` (the Add link, or the site URL without `webAppUrl`) or `"deeplink"` (`sensorble://catalog?url=…`, for when the mobile app supports it) |
| `siteUrl` | public URL of the site; normally set automatically from GitHub Pages (needed only for custom setups) |

## License

MIT — see [LICENSE](LICENSE). The vendored QR encoder
([scripts/vendor/qrcode.cjs](scripts/vendor/qrcode.cjs)) is MIT, © Kazuhiko Arase.
