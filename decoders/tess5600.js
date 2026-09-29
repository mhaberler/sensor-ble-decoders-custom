// TE Connectivity M5600/U5600 ("TESS 5600") wireless pressure transducer.
// Protocol: TE_M5600_U5600_Software_Manual.pdf

const BASE_UUID = "f0000000-0451-4000-b000-000000000000";
const PRESSURE_SVC = "f000ab30-0451-4000-b000-000000000000";
const DATA_CHAR = "f000ab31-0451-4000-b000-000000000000";
const BATTERY_SVC = "f000180f-0451-4000-b000-000000000000";
const BATTERY_CHAR = "f0002a19-0451-4000-b000-000000000000";

const ERR_T = 0x7fff;
const ERR_P = 0x7fffffff;

function onData(deviceId, data) {
  if (!data || data.length < 14) return null;

  const tRaw = data.readInt16LE(0);
  const pRaw = data.readInt32LE(2);
  const pMinRaw = data.readInt32LE(6);
  const pMaxRaw = data.readInt32LE(10);

  return {
    temperature_C: tRaw === ERR_T ? null : tRaw / 100,
    pressure_Pa: pRaw === ERR_P ? null : pRaw / 10,
    pressureMin_Pa: pMinRaw === ERR_P ? null : pMinRaw / 10,
    pressureMax_Pa: pMaxRaw === ERR_P ? null : pMaxRaw / 10,
  };
}

function onBattery(deviceId, data) {
  if (!data || data.length < 2) return null;

  return {
    batteryLevel_percent: data.readUInt8(0),
    batteryCharging_dimensionless: data.readUInt8(1),
  };
}

async function start() {}
async function stop() {}

/** @type {import('../types.js').Decoder} */
export const decoder = {
  decoderName: "tess5600",
  name: null,
  manufacturer: null,
  serviceUUID: BASE_UUID,
  advertisementDecode: null,
  start,
  stop,
  notify: [
    { service: PRESSURE_SVC, characteristic: DATA_CHAR, onNotification: onData },
    { service: BATTERY_SVC, characteristic: BATTERY_CHAR, onNotification: onBattery },
  ],
  units: "Temperature in °C. Pressure, pressureMin, pressureMax in Pa. Battery level in %, charging is 1 (charging) or 0 (discharging).",
  frequency: "Set by the device's configured data rate.",

  // Catalog metadata (ignored by hosts that don't know it).
  title: "TE TESS 5600 pressure transducer",
  description: "Temperature, pressure (current/min/max) and battery from the TE Connectivity M5600/U5600 wireless pressure transducer. Connected sensor: connect to stream readings.",
  version: "1.0.0",
  author: "Michael Haberler",
  license: "GPL-3.0-only",
  tags: ["pressure", "connected", "te-connectivity"],
};

/** @type {import('../types.js').Test[]} */
export const tests = [
  {
    // Live capture from a TESS 5600 unit.
    given: { data: [{ service: PRESSURE_SVC, characteristic: DATA_CHAR, data: "48098305000000000000449d3b01" }] },
    expected: { temperature_C: 23.76, pressure_Pa: 141.1, pressureMin_Pa: 0, pressureMax_Pa: 2068410 },
  },
  {
    // All fields at their error sentinel values.
    given: {
      data: [
        {
          service: PRESSURE_SVC,
          characteristic: DATA_CHAR,
          data: "ff7fffffff7fffffff7fffffff7f",
        },
      ],
    },
    expected: { temperature_C: null, pressure_Pa: null, pressureMin_Pa: null, pressureMax_Pa: null },
  },
  {
    given: { data: [{ service: BATTERY_SVC, characteristic: BATTERY_CHAR, data: "6400" }] },
    expected: { batteryLevel_percent: 100, batteryCharging_dimensionless: 0 },
  },
];
