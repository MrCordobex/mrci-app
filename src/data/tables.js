import { deepClone } from "../utils/helpers.js";

export const MRCI_TABLES = {
  metadata: {
    name: "MRCI",
    version: "George-2004-reference",
    note:
      "Implementacion de referencia basada en George et al. 2004. La seccion A puntua cada forma/ruta solo una vez por regimen.",
  },
  forms: {
    tablets_capsules: { weight: 1, label: "Comprimido/Capsula", routeGroup: "oral" },
    gargles_mouthwashes: { weight: 2, label: "Gargaras/Colutorio", routeGroup: "oral" },
    liquids: { weight: 2, label: "Liquido oral", routeGroup: "oral" },
    powders_granules: { weight: 2, label: "Polvo/Granulado oral", routeGroup: "oral" },
    sublingual_sprays_tabs: { weight: 2, label: "Sublingual", routeGroup: "oral" },
    creams_gels_ointments: { weight: 2, label: "Crema/Gel/Pomada", routeGroup: "topical" },
    dressings: { weight: 3, label: "Aposito", routeGroup: "topical" },
    paints_solutions: { weight: 2, label: "Solucion topica", routeGroup: "topical" },
    pastes: { weight: 3, label: "Pasta topica", routeGroup: "topical" },
    patches: { weight: 2, label: "Parche transdermico", routeGroup: "topical" },
    sprays: { weight: 1, label: "Spray topico", routeGroup: "topical" },
    ear_drops_creams_ointments: { weight: 3, label: "Otico", routeGroup: "ear-eye-nose" },
    eye_drops: { weight: 3, label: "Colirio", routeGroup: "ear-eye-nose" },
    eye_gels_ointments: { weight: 3, label: "Gel/Pomada oftalmica", routeGroup: "ear-eye-nose" },
    nasal_drops_cream_ointment: { weight: 3, label: "Nasal gota/crema/pomada", routeGroup: "ear-eye-nose" },
    nasal_spray: { weight: 2, label: "Spray nasal", routeGroup: "ear-eye-nose" },
    accuhalers: { weight: 3, label: "Accuhaler", routeGroup: "inhalation" },
    aerolizers: { weight: 3, label: "Aerolizer", routeGroup: "inhalation" },
    metered_dose_inhalers: { weight: 4, label: "Inhalador presurizado", routeGroup: "inhalation" },
    nebulizer: { weight: 5, label: "Nebulizador", routeGroup: "inhalation" },
    oxygen_concentrator: { weight: 3, label: "Oxigeno/Concentrador", routeGroup: "inhalation" },
    turbuhalers: { weight: 3, label: "Turbuhaler", routeGroup: "inhalation" },
    other_dry_powder_inhalers: { weight: 3, label: "Otro inhalador de polvo seco", routeGroup: "inhalation" },
    dialysate: { weight: 5, label: "Dializado", routeGroup: "other" },
    enemas: { weight: 2, label: "Enema", routeGroup: "other" },
    injections_prefilled: { weight: 3, label: "Inyectable precargado", routeGroup: "other" },
    ampules_vials: { weight: 4, label: "Inyectable ampolla/vial", routeGroup: "other" },
    pessaries: { weight: 3, label: "Pesario", routeGroup: "other" },
    patient_controlled_analgesia: { weight: 2, label: "Analgesia controlada por paciente", routeGroup: "other" },
    suppositories: { weight: 2, label: "Supositorio", routeGroup: "other" },
    vaginal_creams: { weight: 2, label: "Crema vaginal", routeGroup: "other" },
  },
  frequencies: {
    once_daily: { weight: 1, label: "Una vez al dia", administrationsPerDay: 1, prn: false },
    once_daily_prn: { weight: 0.5, label: "Una vez al dia PRN", administrationsPerDay: 1, prn: true },
    twice_daily: { weight: 2, label: "Dos veces al dia", administrationsPerDay: 2, prn: false },
    twice_daily_prn: { weight: 1, label: "Dos veces al dia PRN", administrationsPerDay: 2, prn: true },
    three_times_daily: { weight: 3, label: "Tres veces al dia", administrationsPerDay: 3, prn: false },
    three_times_daily_prn: { weight: 1.5, label: "Tres veces al dia PRN", administrationsPerDay: 3, prn: true },
    four_times_daily: { weight: 4, label: "Cuatro veces al dia", administrationsPerDay: 4, prn: false },
    four_times_daily_prn: { weight: 2, label: "Cuatro veces al dia PRN", administrationsPerDay: 4, prn: true },
    every_12_hours: { weight: 2.5, label: "Cada 12 horas", administrationsPerDay: 2, prn: false, fixedInterval: true, intervalHours: 12 },
    every_12_hours_prn: { weight: 1.5, label: "Cada 12 horas PRN", administrationsPerDay: 2, prn: true, fixedInterval: true, intervalHours: 12 },
    every_8_hours: { weight: 3.5, label: "Cada 8 horas", administrationsPerDay: 3, prn: false, fixedInterval: true, intervalHours: 8 },
    every_8_hours_prn: { weight: 2, label: "Cada 8 horas PRN", administrationsPerDay: 3, prn: true, fixedInterval: true, intervalHours: 8 },
    every_6_hours: { weight: 4.5, label: "Cada 6 horas", administrationsPerDay: 4, prn: false, fixedInterval: true, intervalHours: 6 },
    every_6_hours_prn: { weight: 2.5, label: "Cada 6 horas PRN", administrationsPerDay: 4, prn: true, fixedInterval: true, intervalHours: 6 },
    every_4_hours: { weight: 6.5, label: "Cada 4 horas", administrationsPerDay: 6, prn: false, fixedInterval: true, intervalHours: 4 },
    every_4_hours_prn: { weight: 3.5, label: "Cada 4 horas PRN", administrationsPerDay: 6, prn: true, fixedInterval: true, intervalHours: 4 },
    every_2_hours: { weight: 12.5, label: "Cada 2 horas", administrationsPerDay: 12, prn: false, fixedInterval: true, intervalHours: 2 },
    every_2_hours_prn: { weight: 6.5, label: "Cada 2 horas PRN", administrationsPerDay: 12, prn: true, fixedInterval: true, intervalHours: 2 },
    as_needed_if_necessary: { weight: 0.5, label: "Segun necesidad/PRN", administrationsPerDay: null, prn: true },
    alternate_or_less: { weight: 2, label: "Dias alternos o menos frecuente", administrationsPerDay: null, prn: false },
    oxygen_prn: { weight: 1, label: "Oxigeno PRN", administrationsPerDay: null, prn: true },
    oxygen_lt_15h: { weight: 2, label: "Oxigeno < 15 horas/dia", administrationsPerDay: null, prn: false },
    oxygen_gt_15h: { weight: 3, label: "Oxigeno > 15 horas/dia", administrationsPerDay: null, prn: false },
  },
  instructions: {
    break_or_crush: { weight: 1, label: "Partir o triturar" },
    dissolve_tablet_powder: { weight: 1, label: "Disolver comprimido/polvo" },
    multiple_units_at_one_time: { weight: 1, label: "Multiples unidades en una toma" },
    variable_dose: { weight: 1, label: "Dosis variable" },
    specified_times: { weight: 1, label: "Hora(s) especifica(s)" },
    relation_to_food: { weight: 1, label: "Relacion con comida" },
    specific_fluid: { weight: 1, label: "Tomar con liquido especifico" },
    take_as_directed: { weight: 2, label: "Usar segun indicacion" },
    tapering_increasing_dose: { weight: 2, label: "Escalada o descenso progresivo" },
    alternating_dose: { weight: 2, label: "Dosis alternante" },
  },
};

export const AMRCI_REFERENCE = {
  metadata: {
    name: "A-MRCI",
    version: "Scrivens-2024-reference-template",
    note:
      "Plantilla de referencia basada en Scrivens et al. 2024. Reutiliza las ponderaciones de George con exclusiones y reglas locales para automatizacion. Requiere validacion institucional.",
  },
  absorbedInstructionKeys: ["specified_times"],
  excludedFormKeys: [
    "dressings",
    "nasal_drops_cream_ointment",
    "accuhalers",
    "aerolizers",
    "oxygen_concentrator",
    "turbuhalers",
    "dialysate",
    "pessaries",
    "patient_controlled_analgesia",
  ],
  excludedFrequencyKeys: ["oxygen_prn", "oxygen_lt_15h", "oxygen_gt_15h"],
  excludedIntervalHours: [18],
  allowInterpolation: true,
  supportedAliases: {
    sublingual_strips: { mapsToFormKey: "sublingual_sprays_tabs", weight: 2, label: "Tira sublingual" },
    needles: { mapsToFormKey: "injections_prefilled", weight: 3, label: "Aguja/Dispositivo de inyeccion" },
    spacers: { mapsToFormKey: "other_dry_powder_inhalers", weight: 3, label: "Camara espaciadora" },
  },
  notes: [
    "En el paper, A-MRCI no implica siempre un valor mayor que MRCI para cualquier regimen individual.",
    "La diferencia positiva observada por Scrivens fue un resultado de cohorte, no una ley de scoring.",
    "En la plantilla por defecto, las horas especificas como 'nightly/at bedtime' se absorben dentro del mapeo de frecuencia A-MRCI y no suman una Seccion C aparte.",
    "Las prescripciones con frecuencias no oficiales o items locales deben revisarse y validarse antes de uso investigador.",
  ],
};

export const DEFAULT_GEMINI_SETTINGS = {
  enabled: false,
  apiKey: "",
  model: "gemini-2.5-flash",
  useForPdf: true,
  useForText: false,
};

export const DEFAULT_APP_CONFIG = {
  mrciTables: deepClone(MRCI_TABLES),
  amrciReference: deepClone(AMRCI_REFERENCE),
  parser: {
    assumeOralSolidWhenUnknown: true,
    autoAddMultipleUnitsDirection: true,
    autoAddVariableDoseDirection: true,
    autoAddSpecifiedTimesDirection: true,
  },
};

export const DOSAGE_FORM_OPTIONS = Object.entries(MRCI_TABLES.forms).map(([key, value]) => ({
  key,
  ...value,
}));

export const FREQUENCY_OPTIONS = Object.entries(MRCI_TABLES.frequencies).map(([key, value]) => ({
  key,
  ...value,
}));

export const INSTRUCTION_OPTIONS = Object.entries(MRCI_TABLES.instructions).map(([key, value]) => ({
  key,
  ...value,
}));

export const GEMINI_SCHEMA_ENUMS = {
  dosageForms: [...Object.keys(MRCI_TABLES.forms), "unknown"],
  frequencyCodes: [...Object.keys(MRCI_TABLES.frequencies), "custom_interval", "custom_daily_count", "unknown"],
  instructionKeys: [...Object.keys(MRCI_TABLES.instructions), "unknown"],
};
