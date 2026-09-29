// Mystery sensor: company ID 0x1044 (payload prefix 4410). Format divined
// from captured adverts; two layouts are recognized by length:
//   22 bytes — non-connectable advert (level, voltage, serial)
//   16 bytes — connectable advert (raw level, voltage, temperature, serial)
// Follows the sensor-ble decoder API; self-contained (no import/require).

function voltageFromCode(code) {
  return 1600 + code * 9;
}

function readSerial(buf, offset) {
  const raw = buf[offset] | (buf[offset + 1] << 8) | (buf[offset + 2] << 16);
  return raw.toString(16).padStart(6, "0").toUpperCase();
}

function decodeNonconn(manufacturerData) {
  if (
    manufacturerData[2] !== 0x33 ||
    manufacturerData[3] !== 0x50 ||
    manufacturerData[4] !== 0x30 ||
    manufacturerData[5] !== 0xbc ||
    manufacturerData[6] !== 0x45 ||
    manufacturerData[7] !== 0x4c ||
    manufacturerData[8] !== 0x47
  ) {
    return null;
  }

  const status = manufacturerData[9];
  const levelWord = manufacturerData.readUInt16LE(11);
  const serial = readSerial(manufacturerData, 16);
  const voltage_mV = voltageFromCode(manufacturerData[15] + 0x1e);

  const invalid = status !== 0 || levelWord === 0xffff;
  const level_raw_percent = invalid ? null : levelWord / 100;
  const level_percent = invalid ? null : levelWord / 80;

  return {
    status_dimensionless: status,
    level_raw_percent,
    level_percent,
    voltage_mV,
    serial_dimensionless: serial,
  };
}

function decodeAdvInd(manufacturerData) {
  const serial = readSerial(manufacturerData, 8);
  const level_raw = manufacturerData[11];
  const temperature_C = manufacturerData[15];

  return {
    level_raw_dimensionless: level_raw,
    voltage_mV: voltageFromCode(manufacturerData[14]),
    temperature_C,
    serial_dimensionless: serial,
  };
}

function decodeMystery(manufacturerData, _serviceData, meta) {
  if (
    manufacturerData.length < 2 ||
    manufacturerData[0] !== 0x44 ||
    manufacturerData[1] !== 0x10
  ) {
    return null;
  }

  let result = null;
  if (manufacturerData.length === 22) result = decodeNonconn(manufacturerData);
  else if (manufacturerData.length === 16) result = decodeAdvInd(manufacturerData);

  if (result && typeof meta?.connectable === "boolean") {
    result = { connectable: meta.connectable, ...result };
  }
  return result;
}

export const decoder = {
  decoderName: "mystery",
  manufacturer: "4410",
  advertisementDecode: decodeMystery,

  // Catalog metadata (ignored by hosts that don't know it).
  title: "Mystery sensor (company 0x1044)",
  description: "Level, voltage, temperature and serial from company-ID 0x1044 adverts (divined).",
  version: "1.0.0",
  author: "Michael Haberler",
  license: "MIT",
  tags: ["divined", "level"],
};

// Regression vectors: real 16-byte adverts captured with Sensor Logger; the
// expected values are this decoder's own output. The 22-byte non-connectable
// layout has no captured vector yet.
export const tests = [
  { given: { manufacturerData: "44106e85f6f1341cc70c0012d700a01c" }, expected: { level_raw_dimensionless: 18, voltage_mV: 3040, temperature_C: 28, serial_dimensionless: "000CC7" } },
  { given: { manufacturerData: "441038907774ba88138a00064e008f1d" }, expected: { level_raw_dimensionless: 6, voltage_mV: 2887, temperature_C: 29, serial_dimensionless: "008A13" } },
  { given: { manufacturerData: "44100b70f6f1341cc90c00182901a51c" }, expected: { level_raw_dimensionless: 24, voltage_mV: 3085, temperature_C: 28, serial_dimensionless: "000CC9" } },
  { given: { manufacturerData: "4c000215" }, expected: null },
];
