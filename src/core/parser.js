import { GEMINI_SCHEMA_ENUMS, MRCI_TABLES } from "../data/tables.js";
import {
  average,
  createId,
  maybeNumber,
  normalizeText,
  uniqueStrings,
} from "../utils/helpers.js";

const SOLID_DEFAULT_FORM = "tablets_capsules";

const FORM_PATTERNS = [
  { key: "nebulizer", patterns: [/nebul/i, /\bneb\b/i] },
  { key: "metered_dose_inhalers", patterns: [/inhalad/i, /\bmdi\b/i, /\bpuff\b/i] },
  { key: "other_dry_powder_inhalers", patterns: [/polvo seco/i, /\bdpi\b/i] },
  { key: "accuhalers", patterns: [/accuhaler/i] },
  { key: "aerolizers", patterns: [/aerolizer/i] },
  { key: "turbuhalers", patterns: [/turbuhaler/i] },
  { key: "nasal_spray", patterns: [/spray nasal/i] },
  { key: "nasal_drops_cream_ointment", patterns: [/gotas nasales/i, /pomada nasal/i, /crema nasal/i] },
  { key: "eye_drops", patterns: [/colirio/i, /gotas oft/i] },
  { key: "eye_gels_ointments", patterns: [/gel oft/i, /pomada oft/i] },
  { key: "ear_drops_creams_ointments", patterns: [/gotas ot/i, /otico/i] },
  { key: "patches", patterns: [/parche/i, /transderm/i] },
  { key: "creams_gels_ointments", patterns: [/crema/i, /\bgel\b/i, /pomada/i, /unguento/i] },
  { key: "pastes", patterns: [/pasta/i] },
  { key: "sprays", patterns: [/spray top/i, /spray cuta/i] },
  { key: "paints_solutions", patterns: [/solucion topica/i, /locion/i] },
  { key: "liquids", patterns: [/jarabe/i, /suspension/i, /solucion oral/i, /\bml\b/i, /gotas orales/i] },
  { key: "powders_granules", patterns: [/sobres/i, /granulado/i, /polvo/i] },
  { key: "gargles_mouthwashes", patterns: [/colutorio/i, /enjuague/i, /gargar/i] },
  { key: "gums_lozenges", patterns: [/pastilla/i, /lozenge/i, /chicle/i, /bucal/i] },
  { key: "sublingual_sprays_tabs", patterns: [/sublingual/i] },
  { key: "suppositories", patterns: [/supositorio/i] },
  { key: "enemas", patterns: [/enema/i, /microenema/i] },
  { key: "vaginal_creams", patterns: [/vaginal/i] },
  { key: "injections_prefilled", patterns: [/pluma/i, /pen\b/i, /jeringa precargada/i, /precargad/i] },
  { key: "ampules_vials", patterns: [/ampolla/i, /vial/i, /inyectable/i, /subcut/i, /intramuscular/i, /intraven/i] },
  { key: "oxygen_concentrator", patterns: [/oxigeno/i, /concentrador/i] },
  { key: "dialysate", patterns: [/dialis/i] },
  { key: "pessaries", patterns: [/pesario/i] },
  { key: "patient_controlled_analgesia", patterns: [/pca\b/i, /analgesia controlada/i] },
];

const FOOD_PATTERNS = [
  /ayunas/i,
  /antes de (desayuno|comida|cena|almuerzo)/i,
  /despues de (desayuno|comida|cena|almuerzo)/i,
  /con comida/i,
  /con alimentos/i,
  /antes de comer/i,
  /despues de comer/i,
  /after food/i,
  /after meals?/i,
  /before meals?/i,
  /with food/i,
];

const SPECIFIC_TIME_PATTERNS = [
  /\bnocte\b/i,
  /\bnoche\b/i,
  /\bmanana\b/i,
  /\btarde\b/i,
  /\bcena\b/i,
  /\bdesayuno\b/i,
  /\bal acostarse\b/i,
  /\bbedtime\b/i,
  /\bmorning\b/i,
  /\bafternoon\b/i,
  /\bevening\b/i,
  /\bnight\b/i,
  /\bmidday\b/i,
  /\bnoon\b/i,
  /\blunch\b/i,
  /\b\d{1,2}:\d{2}\b/,
];

const FLUID_PATTERNS = [/con agua/i, /con abundante agua/i, /con un vaso de agua/i, /with water/i, /with a glass of water/i];
const TAKE_AS_DIRECTED_PATTERNS = [/segun indicacion/i, /segun pauta/i, /use as directed/i];
const TAPERING_PATTERNS = [/descenso/i, /reduccion progresiva/i, /taper/i, /escalad/i, /ajustar dosis/i];
const BREAK_PATTERNS = [/tritur/i, /machacar/i, /partir/i];
const DISSOLVE_PATTERNS = [/disolver/i];

function detectForm(line) {
  for (const matcher of FORM_PATTERNS) {
    if (matcher.patterns.some((pattern) => pattern.test(line))) {
      return matcher.key;
    }
  }
  return null;
}

function inferMedicationName(rawLine) {
  const line = rawLine
    .replace(/^[\s\-*.\d]+/, "")
    .replace(/\s+/g, " ")
    .trim();

  const stop = line.match(
    /\s+\d+(?:[.,]\d+)?\s*(mg|mcg|ug|g|ml|ui|iu|meq|mmol|%|puff|gotas?|comp|caps|tab)\b/i
  );
  if (stop?.index) {
    return line.slice(0, stop.index).trim();
  }

  const altStop = line.match(/\b(cada|c\/|q\d+h|prn|si precisa|rescate|noche|nocte|desayuno|cena)\b/i);
  if (altStop?.index) {
    return line.slice(0, altStop.index).trim();
  }

  return line.trim();
}

function parseSchedulePattern(line) {
  const match = line.match(/\b(\d+(?:\/\d+)?)-(\d+(?:\/\d+)?)-(\d+(?:\/\d+)?)(?:-(\d+(?:\/\d+)?))?\b/);
  if (!match) {
    return null;
  }

  const values = match.slice(1).filter(Boolean).map((value) => {
    if (value.includes("/")) {
      const [left, right] = value.split("/").map(Number);
      return right ? left / right : 0;
    }
    return Number(value);
  });

  const nonZero = values.filter((value) => value > 0).length;
  const entries = [];
  if (nonZero === 1) {
    entries.push({ code: "once_daily", label: "Una vez al dia" });
  } else if (nonZero === 2) {
    entries.push({ code: "twice_daily", label: "Dos veces al dia" });
  } else if (nonZero === 3) {
    entries.push({ code: "three_times_daily", label: "Tres veces al dia" });
  } else if (nonZero >= 4) {
    entries.push({ code: "four_times_daily", label: "Cuatro veces al dia" });
  }

  return {
    entries,
    additionalDirections: ["specified_times"],
    scheduleText: match[0],
  };
}

function parseIntervalFrequency(line) {
  const rangeMatch = line.match(/\b(?:every|cada|c\/|q)\s*(\d+(?:[.,]\d+)?)\s*[-–]\s*(\d+(?:[.,]\d+)?)\s*(?:h|hora|horas|hours?)\b/i);
  if (rangeMatch) {
    const leftHours = maybeNumber(rangeMatch[1]);
    const rightHours = maybeNumber(rangeMatch[2]);
    const hours = Math.min(leftHours || Infinity, rightHours || Infinity);
    const hasPrn = /\b(prn|si precisa|si dolor|rescate|a demanda|cuando precise|as needed|if necessary)\b/i.test(line);
    const map = {
      12: hasPrn ? "every_12_hours_prn" : "every_12_hours",
      8: hasPrn ? "every_8_hours_prn" : "every_8_hours",
      6: hasPrn ? "every_6_hours_prn" : "every_6_hours",
      4: hasPrn ? "every_4_hours_prn" : "every_4_hours",
      2: hasPrn ? "every_2_hours_prn" : "every_2_hours",
    };

    if (map[hours]) {
      return {
        entries: [
          {
            code: map[hours],
            label: `Cada ${rangeMatch[1]}-${rangeMatch[2]} horas (asimilado a ${MRCI_TABLES.frequencies[map[hours]].label})`,
            intervalHours: hours,
            prn: hasPrn,
          },
        ],
        additionalDirections: [],
      };
    }

    return {
      entries: [
        {
          code: "custom_interval",
          label: `Cada ${rangeMatch[1]}-${rangeMatch[2]} horas`,
          intervalHours: hours,
          prn: hasPrn,
        },
      ],
      additionalDirections: [],
    };
  }

  const match = line.match(/\b(?:every|cada|c\/|q)\s*(\d+(?:[.,]\d+)?)\s*(?:h|hora|horas|hours?)\b/i);
  if (!match) {
    return null;
  }

  const hours = maybeNumber(match[1]);
  const hasPrn = /\b(prn|si precisa|si dolor|rescate|a demanda|cuando precise)\b/i.test(line);
  const map = {
    12: hasPrn ? "every_12_hours_prn" : "every_12_hours",
    8: hasPrn ? "every_8_hours_prn" : "every_8_hours",
    6: hasPrn ? "every_6_hours_prn" : "every_6_hours",
    4: hasPrn ? "every_4_hours_prn" : "every_4_hours",
    2: hasPrn ? "every_2_hours_prn" : "every_2_hours",
  };

  if (map[hours]) {
    return {
      entries: [
        {
          code: map[hours],
          label: MRCI_TABLES.frequencies[map[hours]].label,
          intervalHours: hours,
          prn: hasPrn,
        },
      ],
      additionalDirections: [],
    };
  }

  return {
    entries: [
      {
        code: "custom_interval",
        label: `Cada ${hours} horas${hasPrn ? " PRN" : ""}`,
        intervalHours: hours,
        prn: hasPrn,
      },
    ],
    additionalDirections: [],
  };
}

function parseWordFrequency(line) {
  const normalized = normalizeText(line);
  const regularAndPrn =
    /\b(y|and|\+)\b.*\b(prn|si precisa|rescate|a demanda|as needed|if necessary)\b/.test(normalized);
  const rules = [
    {
      pattern: /\b(each morning and afternoon|morning and afternoon|morning and evening|morning and night)\b/,
      code: "twice_daily",
      extraDirection: "specified_times",
    },
    {
      pattern: /\b(each morning|each night|each evening|at night|at midday|at noon|at lunch|in the morning|in the evening)\b/,
      code: "once_daily",
      extraDirection: "specified_times",
    },
    { pattern: /\b(1 vez al dia|una vez al dia|diario|cada dia|od)\b/, code: "once_daily" },
    { pattern: /\b(once daily|daily|every day)\b/, code: "once_daily" },
    { pattern: /\b(2 veces al dia|dos veces al dia|bid)\b/, code: "twice_daily" },
    { pattern: /\b(twice daily)\b/, code: "twice_daily" },
    { pattern: /\b(3 veces al dia|tres veces al dia|tid)\b/, code: "three_times_daily" },
    { pattern: /\b(three times daily)\b/, code: "three_times_daily" },
    { pattern: /\b(4 veces al dia|cuatro veces al dia|qid)\b/, code: "four_times_daily" },
    { pattern: /\b(four times daily)\b/, code: "four_times_daily" },
    { pattern: /\b(5 veces al dia|cinco veces al dia)\b/, code: "custom_daily_count", administrationsPerDay: 5 },
    { pattern: /\b(7 veces al dia|siete veces al dia)\b/, code: "custom_daily_count", administrationsPerDay: 7 },
    { pattern: /\b(semanal|cada semana|mensual|cada mes|dias alternos|un dia si y otro no)\b/, code: "alternate_or_less" },
    { pattern: /\b(weekly|each week|once weekly)\b/, code: "alternate_or_less" },
  ];

  for (const rule of rules) {
    if (rule.pattern.test(normalized)) {
      const entries = [];
      if (regularAndPrn && !String(rule.code).endsWith("_prn")) {
        entries.push({
          code: rule.code,
          label: MRCI_TABLES.frequencies[rule.code]?.label || "Patron regular",
          administrationsPerDay: rule.administrationsPerDay || null,
        });
        entries.push({
          code: "as_needed_if_necessary",
          label: MRCI_TABLES.frequencies.as_needed_if_necessary.label,
          prn: true,
        });
      } else if (/\b(prn|si precisa|rescate|a demanda)\b/.test(normalized) && MRCI_TABLES.frequencies[`${rule.code}_prn`]) {
        entries.push({
          code: `${rule.code}_prn`,
          label: MRCI_TABLES.frequencies[`${rule.code}_prn`].label,
          administrationsPerDay: rule.administrationsPerDay || null,
          prn: true,
        });
      } else {
        entries.push({
          code: rule.code,
          label: MRCI_TABLES.frequencies[rule.code]?.label || `Patron ${rule.code}`,
          administrationsPerDay: rule.administrationsPerDay || null,
        });
      }

      return {
        entries,
        additionalDirections: rule.extraDirection ? [rule.extraDirection] : [],
      };
    }
  }

  if (/\b(prn|si precisa|rescate|a demanda|as needed|if necessary)\b/.test(normalized)) {
    return {
      entries: [
        {
          code: "as_needed_if_necessary",
          label: MRCI_TABLES.frequencies.as_needed_if_necessary.label,
          prn: true,
        },
      ],
      additionalDirections: [],
    };
  }

  return null;
}

function parseUnitsPerDose(rawLine) {
  const rangeMatch = rawLine.match(/\b(\d+(?:[.,]\d+)?)\s*[-–]\s*(\d+(?:[.,]\d+)?)\s*(comp|caps|tab|puff|gotas?|ui|ml)\b/i);
  if (rangeMatch) {
    return {
      value: `${rangeMatch[1]}-${rangeMatch[2]}`,
      numericMax: Math.max(Number(rangeMatch[1]), Number(rangeMatch[2])),
      variableDose: true,
      unitToken: String(rangeMatch[3] || "").toLowerCase(),
    };
  }

  const match = rawLine.match(/\b(\d+(?:[.,]\d+)?)\s*(comp|caps|tab|puff|gotas?|ui|unidades?|ml)\b/i);
  if (!match) {
    return { value: "", numericMax: null, variableDose: false, unitToken: "" };
  }

  return {
    value: match[1],
    numericMax: Number(match[1].replace(",", ".")),
    variableDose: false,
    unitToken: String(match[2] || "").toLowerCase(),
  };
}

function detectAdditionalDirections(line, unitsInfo, parserConfig) {
  const keys = [];
  const normalized = normalizeText(line);
  const multiUnitTokens = ["comp", "caps", "tab", "puff", "gota", "gotas", "unidades"];

  if (
    parserConfig.autoAddMultipleUnitsDirection &&
    Number(unitsInfo.numericMax) > 1 &&
    multiUnitTokens.includes(unitsInfo.unitToken)
  ) {
    keys.push("multiple_units_at_one_time");
  }

  if (parserConfig.autoAddVariableDoseDirection && unitsInfo.variableDose) {
    keys.push("variable_dose");
  }

  if (BREAK_PATTERNS.some((pattern) => pattern.test(normalized))) {
    keys.push("break_or_crush");
  }

  if (DISSOLVE_PATTERNS.some((pattern) => pattern.test(normalized))) {
    keys.push("dissolve_tablet_powder");
  }

  if (parserConfig.autoAddSpecifiedTimesDirection && SPECIFIC_TIME_PATTERNS.some((pattern) => pattern.test(normalized))) {
    keys.push("specified_times");
  }

  if (FOOD_PATTERNS.some((pattern) => pattern.test(normalized))) {
    keys.push("relation_to_food");
  }

  if (FLUID_PATTERNS.some((pattern) => pattern.test(normalized))) {
    keys.push("specific_fluid");
  }

  if (TAKE_AS_DIRECTED_PATTERNS.some((pattern) => pattern.test(normalized))) {
    keys.push("take_as_directed");
  }

  if (TAPERING_PATTERNS.some((pattern) => pattern.test(normalized))) {
    keys.push("tapering_increasing_dose");
  }

  if (/un dia si y otro no/i.test(normalized) || /altern/i.test(normalized)) {
    keys.push("alternating_dose");
  }

  return uniqueStrings(keys);
}

function inferFrequency(rawLine) {
  return parseSchedulePattern(rawLine) || parseIntervalFrequency(rawLine) || parseWordFrequency(rawLine);
}

function createBaseMedication(rawLine) {
  return {
    id: createId("med"),
    name: inferMedicationName(rawLine),
    rawLine: rawLine.trim(),
    dosageFormKey: null,
    frequencyEntries: [],
    additionalDirectionKeys: [],
    unitsPerDose: "",
    notes: "",
    source: "local-parser",
    confidence: 0.4,
  };
}

export function parseMedicationLine(rawLine, config) {
  const parserConfig = config?.parser || {};
  const medication = createBaseMedication(rawLine);
  const warnings = [];
  const confidenceSignals = [];

  const formKey = detectForm(rawLine);
  if (formKey) {
    medication.dosageFormKey = formKey;
    confidenceSignals.push(0.2);
  } else if (parserConfig.assumeOralSolidWhenUnknown) {
    medication.dosageFormKey = SOLID_DEFAULT_FORM;
    warnings.push("Forma/ruta inferida como comprimido/capsula por ausencia de pistas explicitas.");
    confidenceSignals.push(0.05);
  }

  const unitsInfo = parseUnitsPerDose(rawLine);
  medication.unitsPerDose = unitsInfo.value;

  const frequency = inferFrequency(rawLine);
  if (frequency?.entries?.length) {
    medication.frequencyEntries = frequency.entries;
    confidenceSignals.push(0.25);
  } else {
    warnings.push("No se pudo inferir la frecuencia con seguridad.");
  }

  medication.additionalDirectionKeys = uniqueStrings([
    ...(frequency?.additionalDirections || []),
    ...detectAdditionalDirections(rawLine, unitsInfo, parserConfig),
  ]);

  if (medication.name) {
    confidenceSignals.push(0.2);
  }

  if (medication.additionalDirectionKeys.length) {
    confidenceSignals.push(0.1);
  }

  medication.confidence = Math.min(0.98, 0.25 + average(confidenceSignals));
  medication.warnings = warnings;
  return medication;
}

export function parseMedicationText(text, config) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const medications = lines.map((line) => parseMedicationLine(line, config));
  const warnings = medications.flatMap((medication) =>
    (medication.warnings || []).map((warning) => `${medication.name || "Medicamento"}: ${warning}`)
  );

  return {
    medications,
    parser: "local",
    averageConfidence: average(medications.map((medication) => medication.confidence)),
    warnings,
    rawLineCount: lines.length,
  };
}

function sanitizeFrequencyEntry(entry = {}) {
  const safeCode = GEMINI_SCHEMA_ENUMS.frequencyCodes.includes(entry.code)
    ? entry.code
    : "unknown";

  if (safeCode === "unknown") {
    return null;
  }

  return {
    code: safeCode,
    label: entry.label || entry.code || "Patron",
    intervalHours: maybeNumber(entry.interval_hours),
    administrationsPerDay: maybeNumber(entry.administrations_per_day),
    prn: Boolean(entry.prn),
  };
}

export function sanitizeGeminiMedication(payload = {}, config) {
  const parserConfig = config?.parser || {};
  const fallbackRaw = payload.raw_line || payload.name || "";
  const unitsInfo = {
    value: payload.units_per_dose || "",
    numericMax: maybeNumber(payload.units_per_dose),
    variableDose: false,
  };

  const formKey = GEMINI_SCHEMA_ENUMS.dosageForms.includes(payload.dosage_form_key)
    ? payload.dosage_form_key
    : parserConfig.assumeOralSolidWhenUnknown
      ? SOLID_DEFAULT_FORM
      : null;

  const medication = {
    id: createId("med"),
    name: payload.name || inferMedicationName(fallbackRaw),
    rawLine: fallbackRaw,
    dosageFormKey: formKey === "unknown" ? null : formKey,
    frequencyEntries: (payload.frequency_entries || [])
      .map((entry) => sanitizeFrequencyEntry(entry))
      .filter(Boolean),
    additionalDirectionKeys: uniqueStrings(
      (payload.additional_direction_keys || []).filter((key) =>
        GEMINI_SCHEMA_ENUMS.instructionKeys.includes(key) && key !== "unknown"
      )
    ),
    unitsPerDose: payload.units_per_dose || "",
    notes: payload.notes || "",
    source: "gemini",
    confidence: Math.max(0, Math.min(1, maybeNumber(payload.confidence) || 0.7)),
    warnings: uniqueStrings(payload.warnings || []),
  };

  if (!medication.additionalDirectionKeys.length) {
    medication.additionalDirectionKeys = detectAdditionalDirections(
      fallbackRaw,
      unitsInfo,
      parserConfig
    );
  }

  return medication;
}

export function sanitizeGeminiPayload(payload, config) {
  const medications = (payload?.medications || [])
    .map((item) => sanitizeGeminiMedication(item, config))
    .filter((item) => item.name || item.rawLine);

  return {
    medications,
    parser: "gemini",
    averageConfidence: average(medications.map((medication) => medication.confidence)),
    warnings: uniqueStrings(payload?.warnings || []),
    rawLineCount: medications.length,
  };
}
