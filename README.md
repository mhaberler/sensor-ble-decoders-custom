# Sensor-BLE decoders (mhaberler)

Custom [sensor-ble](https://github.com/tszheichoi/sensor-ble) BLE decoders for
[Sensor Logger](https://www.tszheichoi.com/sensorlogger), published at
**<https://mhaberler.github.io/sensor-ble-decoders-custom/>** — one QR code per
decoder.

| Decoder | What it decodes | License | Add to Sensor Logger |
| --- | --- | --- | --- |
| `mystery` | level, voltage, temperature and serial from company-ID 0x1044 adverts (divined) | MIT | `sensorlogger://decoder/https%3A%2F%2Fmhaberler.github.io%2Fsensor-ble-decoders-custom%2Fdecoders%2Fmystery.js` |
| `tess5600` | temperature, pressure and battery from the TE Connectivity M5600/U5600 pressure transducer (connected sensor) | GPL-3.0-only | `sensorlogger://decoder/https%3A%2F%2Fmhaberler.github.io%2Fsensor-ble-decoders-custom%2Fdecoders%2Ftess5600.js` |
| `theengs` | every device [TheengsDecoder](https://decoder.theengs.io/) supports — a catch-all fallback (`matchAll`) | GPL-3.0-only | `sensorlogger://decoder/https%3A%2F%2Fmhaberler.github.io%2Fsensor-ble-decoders-custom%2Fdecoders%2Ftheengs.js` |

Scan a QR code on the page, or open a link above on the phone: Sensor Logger
(1.68 or newer) opens *Add Custom Decoder* with the URL pre-filled
([deep link docs](https://github.com/tszheichoi/awesome-sensor-logger/blob/main/DEEP_LINKS.md#custom-ble-decoders)).

`theengs` needs `matchAll`, which Sensor Logger doesn't support: it imports but
stays inactive there.

`decoders/theengs.js` is **generated** in
[theengs-online-decoder](https://github.com/mhaberler/theengs-online-decoder) —
don't edit it here.

## Add a decoder

Each decoder is **one self-contained ES module** in `decoders/<name>.js`,
following the [sensor-ble API](https://github.com/tszheichoi/sensor-ble#sensor-ble-api)
and Sensor Logger's custom-decoder rules:

- no `import` or `require`; `Buffer` and `console` are provided by the host
- exports a `decoder` object with a unique `decoderName` and an
  `advertisementDecode(manufacturerData, serviceData, meta)` function that
  returns an object of readings, or `null` if the payload isn't for it
  (connected sensors: `start()` and a `notify` array instead)
- matched by `manufacturer` (company ID as it appears in the payload, e.g.
  `"9904"` for Ruuvi's 0x0499), `serviceUUID` (e.g. `"fcd2"`), or `name`
- output keys follow sensor-ble's conventions: `name_unit`, e.g.
  `temperature_C`, `acceleration_x_mg`, `battery_mV`, `…_dimensionless`
- exports `tests`: at least one `{ given: { manufacturerData: "<hex>" }, expected: {…} }`
  pair (`given.serviceData` is `{ "<uuid>": "<hex>" }`). The build compares
  the decoder's output with `expected` exactly.

Page metadata goes on the same `decoder` object; hosts that don't know it
ignore it: `title`, `description`, `version`, `author`, `license`, `tags`.
A longer description can go in `decoders/<name>.md` (paragraphs, `code`,
`**bold**`, `[links](https://…)`).

Push to `main`: the [pages workflow](.github/workflows/pages.yml) runs every
decoder's tests and publishes the page. A failing test fails the build, so a
broken decoder is never published.

## Build and preview locally

Node 20 or newer; nothing to install.

```sh
node scripts/build.js       # runs the tests, writes site/
node scripts/preview.js     # serves site/ on http://localhost:8080/
```

`siteUrl` in [site.config.json](site.config.json) is the public URL the deep
links point at; CI overrides it with the GitHub Pages URL (`SITE_URL`).

## License

MIT — see [LICENSE](LICENSE); each decoder states its own license. The vendored
QR encoder ([scripts/vendor/qrcode.cjs](scripts/vendor/qrcode.cjs)) is MIT,
© Kazuhiko Arase.
