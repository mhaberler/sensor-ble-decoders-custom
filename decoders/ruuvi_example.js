// RuuviTag, data format 5 ("RAWv2") — example decoder for this catalog.
//
// Written from Ruuvi's public spec:
//   https://docs.ruuvi.com/communication/bluetooth-advertisements/data-format-5-rawv2
// Follows the sensor-ble decoder API (github.com/tszheichoi/sensor-ble) and
// Sensor Logger's custom-decoder rules: one self-contained file, no import or
// require. `Buffer` is provided by the host.
//
// Named ruuvi_example so it doesn't replace the built-in `ruuvi` decoder.
// Custom decoders are tried before built-ins, so this one still wins for
// Ruuvi adverts once installed.

// Readings a sensor couldn't take are sent as these sentinel values.
const invalid = (raw, sentinel, value) => (raw === sentinel ? null : value);
const round = (x, digits) => Math.round(x * 10 ** digits) / 10 ** digits;

function decodeRuuvi(manufacturerData) {
  // Company ID 0x0499 (little endian) then the format byte 5.
  if (!manufacturerData || manufacturerData.length < 26 || manufacturerData[2] !== 0x05) return null;
  const d = manufacturerData.subarray(2);

  const temp = d.readInt16BE(1);
  const hum = d.readUInt16BE(3);
  const pres = d.readUInt16BE(5);
  const ax = d.readInt16BE(7);
  const ay = d.readInt16BE(9);
  const az = d.readInt16BE(11);
  const power = d.readUInt16BE(13);
  const battery = power >> 5; // 11 bits
  const tx = power & 0x1f; // 5 bits

  return {
    temperature_C: invalid(temp, -0x8000, round(temp * 0.005, 3)),
    humidity_percent: invalid(hum, 0xffff, round(hum * 0.0025, 4)),
    pressure_hPa: invalid(pres, 0xffff, round((pres + 50000) / 100, 2)),
    acceleration_x_mg: invalid(ax, -0x8000, ax),
    acceleration_y_mg: invalid(ay, -0x8000, ay),
    acceleration_z_mg: invalid(az, -0x8000, az),
    battery_mV: invalid(battery, 0x7ff, battery + 1600),
    txPower_dBm: invalid(tx, 0x1f, tx * 2 - 40),
    movementCounter_dimensionless: invalid(d[15], 0xff, d[15]),
    measurementSequence_dimensionless: invalid(d.readUInt16BE(16), 0xffff, d.readUInt16BE(16)),
    macAddress: [...d.subarray(18, 24)].map((b) => b.toString(16).padStart(2, '0')).join(':'),
  };
}

export const decoder = {
  decoderName: 'ruuvi_example',
  manufacturer: '9904',
  advertisementDecode: decodeRuuvi,

  // Catalog metadata (ignored by hosts that don't know it).
  title: 'RuuviTag (RAWv2, example)',
  description: 'Temperature, humidity, pressure, acceleration, battery and movement from RuuviTag data format 5.',
  version: '1.0.0',
  author: 'Michael Haberler',
  license: 'MIT',
  tags: ['ruuvi', 'environment', 'example'],
};

// The four test vectors from the Ruuvi spec: valid, maximum, minimum, invalid.
export const tests = [
  {
    given: { manufacturerData: '99040512fc5394c37c0004fffc040cac364200cdcbb8334c884f' },
    expected: {
      temperature_C: 24.3, humidity_percent: 53.49, pressure_hPa: 1000.44,
      acceleration_x_mg: 4, acceleration_y_mg: -4, acceleration_z_mg: 1036,
      battery_mV: 2977, txPower_dBm: 4,
      movementCounter_dimensionless: 66, measurementSequence_dimensionless: 205,
      macAddress: 'cb:b8:33:4c:88:4f',
    },
  },
  {
    given: { manufacturerData: '9904057ffffffefffe7fff7fff7fffffdefefffecbb8334c884f' },
    expected: {
      temperature_C: 163.835, humidity_percent: 163.835, pressure_hPa: 1155.34,
      acceleration_x_mg: 32767, acceleration_y_mg: 32767, acceleration_z_mg: 32767,
      battery_mV: 3646, txPower_dBm: 20,
      movementCounter_dimensionless: 254, measurementSequence_dimensionless: 65534,
      macAddress: 'cb:b8:33:4c:88:4f',
    },
  },
  {
    given: { manufacturerData: '9904058001000000008001800180010000000000cbb8334c884f' },
    expected: {
      temperature_C: -163.835, humidity_percent: 0, pressure_hPa: 500,
      acceleration_x_mg: -32767, acceleration_y_mg: -32767, acceleration_z_mg: -32767,
      battery_mV: 1600, txPower_dBm: -40,
      movementCounter_dimensionless: 0, measurementSequence_dimensionless: 0,
      macAddress: 'cb:b8:33:4c:88:4f',
    },
  },
  {
    given: { manufacturerData: '9904058000ffffffff800080008000ffffffffffffffffffffff' },
    expected: {
      temperature_C: null, humidity_percent: null, pressure_hPa: null,
      acceleration_x_mg: null, acceleration_y_mg: null, acceleration_z_mg: null,
      battery_mV: null, txPower_dBm: null,
      movementCounter_dimensionless: null, measurementSequence_dimensionless: null,
      macAddress: 'ff:ff:ff:ff:ff:ff',
    },
  },
];
