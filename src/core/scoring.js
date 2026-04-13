import { MRCI_TABLES } from "../data/tables.js";
import { deepClone, maybeNumber, uniqueStrings } from "../utils/helpers.js";

function roundToNearestHalf(value) {
  return Math.round(value * 2) / 2;
}

function createEmptyModeScore(mode) {
  return {
    mode,
    total: 0,
    sectionA: 0,
    sectionB: 0,
    sectionC: 0,
    formBreakdown: [],
    medicationBreakdown: [],
    warnings: [],
    qualityFlags: [],
  };
}

function resolveTables(config) {
  return config?.mrciTables || MRCI_TABLES;
}

function buildReferenceConfig(config) {
  return config?.amrciReference || {};
}

function addWarning(target, text) {
  if (!target.includes(text)) {
    target.push(text);
  }
}

function getKnownIntervalFrequencyEntries(tables, prn) {
  return Object.entries(tables.frequencies)
    .filter(([, value]) => Boolean(value.fixedInterval) && Boolean(value.prn) === Boolean(prn))
    .map(([code, value]) => ({
      code,
      weight: value.weight,
      intervalHours: value.intervalHours,
      label: value.label,
    }))
    .sort((left, right) => left.intervalHours - right.intervalHours);
}

function getKnownDailyCountEntries(tables, prn) {
  return Object.entries(tables.frequencies)
    .filter(
      ([, value]) =>
        Number.isFinite(value.administrationsPerDay) &&
        !value.fixedInterval &&
        Boolean(value.prn) === Boolean(prn)
    )
    .map(([code, value]) => ({
      code,
      weight: value.weight,
      administrationsPerDay: value.administrationsPerDay,
      label: value.label,
    }))
    .sort((left, right) => left.administrationsPerDay - right.administrationsPerDay);
}

function interpolateIntervalWeight(entry, mode, tables, referenceConfig) {
  if (mode !== "amrci" || !referenceConfig.allowInterpolation) {
    return null;
  }

  const hours = maybeNumber(entry.intervalHours);
  if (!Number.isFinite(hours)) {
    return null;
  }

  if (referenceConfig.excludedIntervalHours?.includes(hours)) {
    return {
      excluded: true,
      reason: `Frecuencia cada ${hours} horas excluida en la plantilla A-MRCI por baja aplicabilidad al alta.`,
    };
  }

  const official = getKnownIntervalFrequencyEntries(tables, entry.prn);
  const exact = official.find((candidate) => candidate.intervalHours === hours);
  if (exact) {
    return {
      weight: exact.weight,
      label: exact.label,
      method: "official",
    };
  }

  const lower = official
    .filter((candidate) => candidate.intervalHours > hours)
    .sort((left, right) => left.intervalHours - right.intervalHours)[0];
  const upper = official
    .filter((candidate) => candidate.intervalHours < hours)
    .sort((left, right) => right.intervalHours - left.intervalHours)[0];

  if (!lower || !upper) {
    return null;
  }

  return {
    weight: roundToNearestHalf((lower.weight + upper.weight) / 2),
    label: entry.label || `Cada ${hours} horas${entry.prn ? " PRN" : ""}`,
    method: "interpolated-midpoint",
    detail: `Interpolado entre ${upper.label} y ${lower.label}.`,
  };
}

function interpolateDailyCountWeight(entry, mode, tables, referenceConfig) {
  if (mode !== "amrci" || !referenceConfig.allowInterpolation) {
    return null;
  }

  const administrationsPerDay = maybeNumber(entry.administrationsPerDay);
  if (!Number.isFinite(administrationsPerDay)) {
    return null;
  }

  const official = getKnownDailyCountEntries(tables, entry.prn);
  const exact = official.find(
    (candidate) => candidate.administrationsPerDay === administrationsPerDay
  );

  if (exact) {
    return {
      weight: exact.weight,
      label: exact.label,
      method: "official",
    };
  }

  const lower = official
    .filter((candidate) => candidate.administrationsPerDay < administrationsPerDay)
    .sort((left, right) => right.administrationsPerDay - left.administrationsPerDay)[0];
  const upper = official
    .filter((candidate) => candidate.administrationsPerDay > administrationsPerDay)
    .sort((left, right) => left.administrationsPerDay - right.administrationsPerDay)[0];

  if (!lower || !upper) {
    return null;
  }

  return {
    weight: roundToNearestHalf((lower.weight + upper.weight) / 2),
    label:
      entry.label ||
      `${administrationsPerDay} veces al dia${entry.prn ? " PRN" : ""}`,
    method: "interpolated-midpoint",
    detail: `Interpolado entre ${lower.label} y ${upper.label}.`,
  };
}

function resolveFrequency(entry, mode, tables, referenceConfig) {
  if (!entry) {
    return { warning: "Frecuencia vacia." };
  }

  if (entry.code) {
    const official = tables.frequencies?.[entry.code];
    if (official) {
      if (
        mode === "amrci" &&
        referenceConfig.excludedFrequencyKeys?.includes(entry.code)
      ) {
        return {
          excluded: true,
          reason: `${official.label} esta excluida en la plantilla A-MRCI.`,
        };
      }

      return {
        weight: official.weight,
        label: official.label,
        method: "official",
      };
    }
  }

  const interpolatedInterval = interpolateIntervalWeight(entry, mode, tables, referenceConfig);
  if (interpolatedInterval) {
    return interpolatedInterval;
  }

  const interpolatedDailyCount = interpolateDailyCountWeight(
    entry,
    mode,
    tables,
    referenceConfig
  );
  if (interpolatedDailyCount) {
    return interpolatedDailyCount;
  }

  return {
    warning:
      entry.label ||
      entry.code ||
      "Frecuencia no soportada por las tablas actuales; revisar manualmente.",
  };
}

function shouldAbsorbDirectionInReferenceMode(medication, directionKey, mode, referenceConfig) {
  if (mode !== "amrci") {
    return false;
  }

  if (!referenceConfig.absorbedInstructionKeys?.includes(directionKey)) {
    return false;
  }

  return Boolean((medication.frequencyEntries || []).length);
}

function scoreDirections(medication, mode, modeScore, tables, referenceConfig) {
  const result = [];
  uniqueStrings(medication.additionalDirectionKeys || []).forEach((directionKey) => {
    if (shouldAbsorbDirectionInReferenceMode(medication, directionKey, mode, referenceConfig)) {
      return;
    }

    const direction = tables.instructions?.[directionKey];
    if (!direction) {
      addWarning(
        modeScore.warnings,
        `Instruccion no reconocida en ${medication.name || "medicamento sin nombre"}: ${directionKey}.`
      );
      return;
    }

    result.push({
      key: directionKey,
      label: direction.label,
      weight: direction.weight,
    });
  });

  return result;
}

function scoreFrequencies(medication, mode, modeScore, tables, referenceConfig) {
  const result = [];
  (medication.frequencyEntries || []).forEach((entry) => {
    const resolved = resolveFrequency(entry, mode, tables, referenceConfig);
    if (resolved.excluded) {
      addWarning(
        modeScore.warnings,
        `${medication.name || "Medicamento"}: ${resolved.reason}`
      );
      return;
    }

    if (resolved.warning) {
      addWarning(
        modeScore.warnings,
        `${medication.name || "Medicamento"}: ${resolved.warning}`
      );
      return;
    }

    result.push({
      label: resolved.label,
      weight: resolved.weight,
      method: resolved.method,
      detail: resolved.detail || "",
    });
  });

  return result;
}

function scoreForms(regimen, mode, modeScore, tables, referenceConfig) {
  const seen = new Set();

  (regimen.medications || []).forEach((medication) => {
    const formKey = medication.dosageFormKey;
    if (!formKey || seen.has(formKey)) {
      return;
    }

    const form = tables.forms?.[formKey];
    if (!form) {
      addWarning(
        modeScore.warnings,
        `Forma/ruta no reconocida: ${medication.dosageFormKey || "sin especificar"}.`
      );
      return;
    }

    if (mode === "amrci" && referenceConfig.excludedFormKeys?.includes(formKey)) {
      addWarning(
        modeScore.warnings,
        `${form.label} esta excluida en la plantilla A-MRCI por baja aplicabilidad a prescripciones de alta.`
      );
      seen.add(formKey);
      return;
    }

    seen.add(formKey);
    modeScore.sectionA += form.weight;
    modeScore.formBreakdown.push({
      key: formKey,
      label: form.label,
      weight: form.weight,
    });
  });
}

function scoreMode(regimen, mode, config) {
  const modeScore = createEmptyModeScore(mode);
  const tables = resolveTables(config);
  const referenceConfig = buildReferenceConfig(config);

  scoreForms(regimen, mode, modeScore, tables, referenceConfig);

  (regimen.medications || []).forEach((medication) => {
    const medicationResult = {
      id: medication.id,
      name: medication.name || "Medicamento sin nombre",
      rawLine: medication.rawLine || "",
      sectionB: 0,
      sectionC: 0,
      frequencyItems: [],
      instructionItems: [],
      warnings: [],
    };

    if (!medication.name) {
      medicationResult.warnings.push("Nombre ausente.");
    }

    if (!medication.dosageFormKey) {
      medicationResult.warnings.push("Forma/ruta ausente.");
    }

    if (!(medication.frequencyEntries || []).length) {
      medicationResult.warnings.push("Frecuencia ausente.");
    }

    const scoredFrequencies = scoreFrequencies(
      medication,
      mode,
      modeScore,
      tables,
      referenceConfig
    );
    scoredFrequencies.forEach((entry) => {
      medicationResult.sectionB += entry.weight;
      medicationResult.frequencyItems.push(entry);
      modeScore.sectionB += entry.weight;
    });

    const scoredDirections = scoreDirections(
      medication,
      mode,
      modeScore,
      tables,
      referenceConfig
    );
    scoredDirections.forEach((entry) => {
      medicationResult.sectionC += entry.weight;
      medicationResult.instructionItems.push(entry);
      modeScore.sectionC += entry.weight;
    });

    medicationResult.total = medicationResult.sectionB + medicationResult.sectionC;
    modeScore.medicationBreakdown.push(medicationResult);

    medicationResult.warnings.forEach((warning) => {
      addWarning(modeScore.qualityFlags, `${medicationResult.name}: ${warning}`);
    });
  });

  modeScore.total = modeScore.sectionA + modeScore.sectionB + modeScore.sectionC;
  return modeScore;
}

export function scoreRegimen(regimen, config) {
  const safeRegimen = deepClone(regimen || { medications: [] });
  const mrci = scoreMode(safeRegimen, "mrci", config);
  const amrci = scoreMode(safeRegimen, "amrci", config);
  const deltaAbsolute = amrci.total - mrci.total;
  const deltaRelative = mrci.total > 0 ? (deltaAbsolute / mrci.total) * 100 : 0;

  return {
    regimenId: safeRegimen.id || null,
    medicationCount: (safeRegimen.medications || []).length,
    mrci,
    amrci,
    deltaAbsolute,
    deltaRelative,
  };
}

export function buildClinicalSummary(score) {
  const drivers = [];
  const mrci = score?.mrci;

  if (!mrci) {
    return "Sin datos de regimen.";
  }

  if (mrci.formBreakdown.length) {
    const topForms = mrci.formBreakdown
      .slice()
      .sort((left, right) => right.weight - left.weight)
      .slice(0, 3)
      .map((entry) => `${entry.label} (${entry.weight})`);
    drivers.push(`Formas/rutas unicas: ${topForms.join(", ")}`);
  }

  const heavyMeds = mrci.medicationBreakdown
    .slice()
    .sort((left, right) => right.total - left.total)
    .slice(0, 3)
    .filter((entry) => entry.total > 0)
    .map((entry) => `${entry.name} (${entry.total})`);

  if (heavyMeds.length) {
    drivers.push(`Mayores contribuyentes por frecuencia/instrucciones: ${heavyMeds.join(", ")}`);
  }

  if (score.deltaAbsolute !== 0) {
    drivers.push(
      `Diferencia A-MRCI vs MRCI: ${score.deltaAbsolute > 0 ? "+" : ""}${score.deltaAbsolute.toFixed(
        1
      )} puntos.`
    );
  }

  return drivers.length
    ? drivers.join(" ")
    : "No hay suficientes datos para un resumen interpretable.";
}
