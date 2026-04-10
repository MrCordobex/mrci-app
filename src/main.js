import {
  DEFAULT_APP_CONFIG,
  DEFAULT_GEMINI_SETTINGS,
  DOSAGE_FORM_OPTIONS,
  FREQUENCY_OPTIONS,
  INSTRUCTION_OPTIONS,
} from "./data/tables.js";
import { parseMedicationText, sanitizeGeminiPayload } from "./core/parser.js";
import { buildClinicalSummary, scoreRegimen } from "./core/scoring.js";
import { parseWithGeminiPdf, parseWithGeminiText } from "./integrations/gemini.js";
import {
  createId,
  deepClone,
  downloadTextFile,
  escapeHtml,
  fileToBase64,
  formatNumber,
  formatPercent,
  readJsonSafe,
  summarizeList,
  toCsv,
  uniqueStrings,
} from "./utils/helpers.js";

const STORAGE_KEYS = {
  regimen: "mrci-studio-regimen",
  compare: "mrci-studio-compare",
  config: "mrci-studio-config",
  gemini: "mrci-studio-gemini",
  audit: "mrci-studio-audit",
  parseInfo: "mrci-studio-parse-info",
};

const dom = {
  statusBar: document.querySelector("#status-bar"),
  metricMrciTotal: document.querySelector("#metric-mrci-total"),
  metricMrciSections: document.querySelector("#metric-mrci-sections"),
  metricAmrciTotal: document.querySelector("#metric-amrci-total"),
  metricAmrciSections: document.querySelector("#metric-amrci-sections"),
  metricDelta: document.querySelector("#metric-delta"),
  metricDeltaRelative: document.querySelector("#metric-delta-relative"),
  metricMedCount: document.querySelector("#metric-med-count"),
  metricParser: document.querySelector("#metric-parser"),
  tabs: [...document.querySelectorAll(".tab")],
  panels: [...document.querySelectorAll(".panel")],
  rawInput: document.querySelector("#raw-input"),
  pdfInput: document.querySelector("#pdf-input"),
  parseLocalBtn: document.querySelector("#parse-local-btn"),
  parseGeminiTextBtn: document.querySelector("#parse-gemini-text-btn"),
  parseGeminiPdfBtn: document.querySelector("#parse-gemini-pdf-btn"),
  clearTextBtn: document.querySelector("#clear-text-btn"),
  parseNotes: document.querySelector("#parse-notes"),
  manualName: document.querySelector("#manual-name"),
  manualForm: document.querySelector("#manual-form"),
  manualUnits: document.querySelector("#manual-units"),
  manualFrequency: document.querySelector("#manual-frequency"),
  manualCustomHours: document.querySelector("#manual-custom-hours"),
  manualCustomCount: document.querySelector("#manual-custom-count"),
  manualFrequencyPrn: document.querySelector("#manual-frequency-prn"),
  addFrequencyBtn: document.querySelector("#add-frequency-btn"),
  manualFrequencyList: document.querySelector("#manual-frequency-list"),
  manualInstructionGrid: document.querySelector("#manual-instruction-grid"),
  manualNotes: document.querySelector("#manual-notes"),
  manualAddBtn: document.querySelector("#manual-add-btn"),
  manualResetBtn: document.querySelector("#manual-reset-btn"),
  regimenPreview: document.querySelector("#regimen-preview"),
  clinicalSummary: document.querySelector("#clinical-summary"),
  qualityControl: document.querySelector("#quality-control"),
  resultsTable: document.querySelector("#results-table"),
  auditLog: document.querySelector("#audit-log"),
  formsBreakdown: document.querySelector("#forms-breakdown"),
  exportJsonBtn: document.querySelector("#export-json-btn"),
  exportCsvBtn: document.querySelector("#export-csv-btn"),
  copySummaryBtn: document.querySelector("#copy-summary-btn"),
  saveRegimenABtn: document.querySelector("#save-regimen-a-btn"),
  saveRegimenBBtn: document.querySelector("#save-regimen-b-btn"),
  compareBtn: document.querySelector("#compare-btn"),
  compareOutput: document.querySelector("#compare-output"),
  geminiApiKey: document.querySelector("#gemini-api-key"),
  geminiModel: document.querySelector("#gemini-model"),
  geminiEnableText: document.querySelector("#gemini-enable-text"),
  geminiEnablePdf: document.querySelector("#gemini-enable-pdf"),
  configForms: document.querySelector("#config-forms"),
  configFrequencies: document.querySelector("#config-frequencies"),
  configInstructions: document.querySelector("#config-instructions"),
  configAmrci: document.querySelector("#config-amrci"),
  saveConfigBtn: document.querySelector("#save-config-btn"),
  exportConfigBtn: document.querySelector("#export-config-btn"),
  triggerImportConfigBtn: document.querySelector("#trigger-import-config-btn"),
  importConfigInput: document.querySelector("#import-config-input"),
  restoreConfigBtn: document.querySelector("#restore-config-btn"),
  newCaseButtons: [...document.querySelectorAll('[data-action="new-case"]')],
};

const state = {
  regimen: createEmptyRegimen(),
  compare: { regimenA: null, regimenB: null },
  config: deepClone(DEFAULT_APP_CONFIG),
  gemini: deepClone(DEFAULT_GEMINI_SETTINGS),
  audit: [],
  parseInfo: null,
  manualFrequencyEntries: [],
};

function createEmptyRegimen() {
  return {
    id: createId("regimen"),
    title: "Regimen actual",
    medications: [],
    createdAt: new Date().toISOString(),
    source: "manual",
  };
}

function loadState(key, fallback) {
  const raw = localStorage.getItem(key);
  return raw ? readJsonSafe(raw, fallback) : fallback;
}

function persistState() {
  // La app funciona como consulta efimera: no persiste datos clinicos ni configuracion entre recargas.
}

function clearLegacyStorage() {
  Object.values(STORAGE_KEYS).forEach((key) => {
    localStorage.removeItem(key);
  });
}

function setStatus(message, tone = "info") {
  dom.statusBar.textContent = message;
  dom.statusBar.className = `status-bar ${tone}`;
}

function pushAudit(message) {
  state.audit.unshift({
    id: createId("audit"),
    message,
    at: new Date().toLocaleString("es-ES"),
  });
  state.audit = state.audit.slice(0, 60);
}

function renderTabs(activeTab = "input") {
  dom.tabs.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.tab === activeTab);
  });

  dom.panels.forEach((panel) => {
    panel.classList.toggle("is-active", panel.id === `tab-${activeTab}`);
  });
}

function buildOptionHtml(options, placeholder) {
  const entries = options
    .map((option) => `<option value="${option.key}">${escapeHtml(option.label)}</option>`)
    .join("");
  return `<option value="">${escapeHtml(placeholder)}</option>${entries}`;
}

function syncStaticControls() {
  dom.manualForm.innerHTML = buildOptionHtml(DOSAGE_FORM_OPTIONS, "Seleccione una forma/ruta");

  const frequencyOptions = [
    ...FREQUENCY_OPTIONS.map((entry) => ({ key: entry.key, label: entry.label })),
    { key: "custom_interval", label: "Frecuencia custom por horas" },
    { key: "custom_daily_count", label: "Frecuencia custom por numero de tomas/dia" },
  ];
  dom.manualFrequency.innerHTML = buildOptionHtml(
    frequencyOptions,
    "Seleccione un patron de frecuencia"
  );

  dom.manualInstructionGrid.innerHTML = INSTRUCTION_OPTIONS.map(
    (entry) => `
      <label>
        <input type="checkbox" value="${entry.key}" />
        <span>${escapeHtml(entry.label)}</span>
      </label>
    `
  ).join("");

  dom.geminiApiKey.value = state.gemini.apiKey || "";
  dom.geminiModel.value = state.gemini.model || "gemini-2.5-flash";
  dom.geminiEnableText.checked = Boolean(state.gemini.useForText);
  dom.geminiEnablePdf.checked = Boolean(state.gemini.useForPdf);

  syncConfigEditors();
}

function syncConfigEditors() {
  dom.configForms.value = JSON.stringify(state.config.mrciTables.forms, null, 2);
  dom.configFrequencies.value = JSON.stringify(state.config.mrciTables.frequencies, null, 2);
  dom.configInstructions.value = JSON.stringify(state.config.mrciTables.instructions, null, 2);
  dom.configAmrci.value = JSON.stringify(state.config.amrciReference, null, 2);
}

function resetManualForm() {
  dom.manualName.value = "";
  dom.manualForm.value = "";
  dom.manualUnits.value = "";
  dom.manualFrequency.value = "";
  dom.manualCustomHours.value = "";
  dom.manualCustomCount.value = "";
  dom.manualFrequencyPrn.checked = false;
  dom.manualNotes.value = "";
  state.manualFrequencyEntries = [];
  [...dom.manualInstructionGrid.querySelectorAll("input[type='checkbox']")].forEach((input) => {
    input.checked = false;
  });
  renderManualFrequencyEntries();
}

function renderManualFrequencyEntries() {
  if (!state.manualFrequencyEntries.length) {
    dom.manualFrequencyList.innerHTML = `<span class="muted">Sin patrones anadidos</span>`;
    return;
  }

  dom.manualFrequencyList.innerHTML = state.manualFrequencyEntries
    .map(
      (entry, index) => `
        <span class="chip">
          ${escapeHtml(entry.label)}
          <button type="button" data-remove-frequency="${index}">x</button>
        </span>
      `
    )
    .join("");

  dom.manualFrequencyList.querySelectorAll("[data-remove-frequency]").forEach((button) => {
    button.addEventListener("click", () => {
      state.manualFrequencyEntries.splice(Number(button.dataset.removeFrequency), 1);
      renderManualFrequencyEntries();
    });
  });
}

function buildManualFrequencyEntry() {
  const selected = dom.manualFrequency.value;
  if (!selected) {
    throw new Error("Seleccione un patron de frecuencia.");
  }

  if (selected === "custom_interval") {
    const hours = Number(dom.manualCustomHours.value);
    if (!Number.isFinite(hours) || hours <= 0) {
      throw new Error("Indique el intervalo en horas para la frecuencia custom.");
    }
    return {
      code: "custom_interval",
      label: `Cada ${hours} horas${dom.manualFrequencyPrn.checked ? " PRN" : ""}`,
      intervalHours: hours,
      prn: dom.manualFrequencyPrn.checked,
    };
  }

  if (selected === "custom_daily_count") {
    const count = Number(dom.manualCustomCount.value);
    if (!Number.isFinite(count) || count <= 0) {
      throw new Error("Indique el numero de tomas por dia para la frecuencia custom.");
    }
    return {
      code: "custom_daily_count",
      label: `${count} veces al dia${dom.manualFrequencyPrn.checked ? " PRN" : ""}`,
      administrationsPerDay: count,
      prn: dom.manualFrequencyPrn.checked,
    };
  }

  return {
    code: selected,
    label: state.config.mrciTables.frequencies[selected]?.label || selected,
  };
}

function inferManualInstructions(unitsText, selectedKeys) {
  const nextKeys = [...selectedKeys];
  const normalized = unitsText.trim().toLowerCase();
  if (/^\s*\d+(?:[.,]\d+)?\s*-\s*\d+(?:[.,]\d+)?\s*$/.test(unitsText)) {
    nextKeys.push("variable_dose");
  }

  const numeric = Number(String(unitsText).replace(",", "."));
  const impliesMultipleDosageUnits =
    /(comp|caps|tab|puff|gota|gotas|unidades)\b/.test(normalized) ||
    /^\s*\d+(?:[.,]\d+)?\s*$/.test(normalized);

  if (Number.isFinite(numeric) && numeric > 1 && impliesMultipleDosageUnits) {
    nextKeys.push("multiple_units_at_one_time");
  }

  return uniqueStrings(nextKeys);
}

function buildManualMedication() {
  const name = dom.manualName.value.trim();
  const dosageFormKey = dom.manualForm.value;

  if (!name) {
    throw new Error("El nombre del medicamento es obligatorio.");
  }
  if (!dosageFormKey) {
    throw new Error("Seleccione una forma/ruta MRCI.");
  }
  if (!state.manualFrequencyEntries.length) {
    throw new Error("Anada al menos un patron de frecuencia.");
  }

  const selectedDirectionKeys = [...dom.manualInstructionGrid.querySelectorAll("input:checked")].map(
    (input) => input.value
  );

  return {
    id: createId("med"),
    name,
    rawLine: "",
    dosageFormKey,
    frequencyEntries: deepClone(state.manualFrequencyEntries),
    additionalDirectionKeys: inferManualInstructions(dom.manualUnits.value.trim(), selectedDirectionKeys),
    unitsPerDose: dom.manualUnits.value.trim(),
    notes: dom.manualNotes.value.trim(),
    source: "manual",
    confidence: 1,
    warnings: [],
  };
}

function mergeParsedResult(result, sourceLabel) {
  if (!result.medications.length) {
    setStatus("No se pudieron extraer medicamentos validos.", "warning");
    return;
  }

  state.regimen.medications.push(...result.medications);
  state.regimen.source = sourceLabel;
  state.parseInfo = result;
  pushAudit(`Se anadieron ${result.medications.length} medicamentos mediante ${sourceLabel}.`);
  persistState();
  renderAll();
  setStatus(`Se incorporaron ${result.medications.length} medicamentos al regimen.`, "success");
}

function renderParseNotes() {
  if (!state.parseInfo) {
    dom.parseNotes.innerHTML = `<p class="muted">Todavia no hay parseos registrados.</p>`;
    return;
  }

  const notes = [
    `<div class="bullet-item"><strong>Origen:</strong> ${escapeHtml(state.parseInfo.parser)}</div>`,
    `<div class="bullet-item"><strong>Lineas procesadas:</strong> ${state.parseInfo.rawLineCount}</div>`,
    `<div class="bullet-item"><strong>Confianza media:</strong> ${formatPercent(
      (state.parseInfo.averageConfidence || 0) * 100
    )}</div>`,
    ...uniqueStrings(state.parseInfo.warnings || []).map(
      (warning) => `<div class="bullet-item">${escapeHtml(warning)}</div>`
    ),
  ];
  dom.parseNotes.innerHTML = notes.join("");
}

function renderRegimenPreview() {
  if (!state.regimen.medications.length) {
    dom.regimenPreview.innerHTML = `<p class="muted">No hay medicamentos en el regimen actual.</p>`;
    return;
  }

  dom.regimenPreview.innerHTML = state.regimen.medications
    .map((medication) => {
      const formLabel =
        state.config.mrciTables.forms[medication.dosageFormKey]?.label || "Sin forma";
      const frequencies = summarizeList(
        (medication.frequencyEntries || []).map((entry) => entry.label),
        "Sin frecuencia"
      );
      const directions = summarizeList(
        (medication.additionalDirectionKeys || []).map(
          (key) => state.config.mrciTables.instructions[key]?.label || key
        ),
        "Sin instrucciones"
      );

      return `
        <div class="preview-item">
          <strong>${escapeHtml(medication.name)}</strong><br />
          <span class="muted">${escapeHtml(formLabel)} | ${escapeHtml(frequencies)} | ${escapeHtml(directions)}</span>
        </div>
      `;
    })
    .join("");
}

function buildResultsTableHtml(score) {
  if (!score.medicationCount) {
    return `<p class="muted">No hay medicamentos cargados.</p>`;
  }

  const rows = score.mrci.medicationBreakdown.map((mrciEntry, index) => {
    const amrciEntry = score.amrci.medicationBreakdown[index];
    const medication = state.regimen.medications[index];
    const formLabel =
      state.config.mrciTables.forms[medication?.dosageFormKey]?.label || "Sin forma";

    return `
      <tr>
        <td>
          <strong>${escapeHtml(mrciEntry.name)}</strong>
          ${medication?.notes ? `<div class="muted">${escapeHtml(medication.notes)}</div>` : ""}
        </td>
        <td>${escapeHtml(formLabel)}</td>
        <td>${(mrciEntry.frequencyItems || [])
          .map((entry) => `<span class="pill">${escapeHtml(entry.label)} (${formatNumber(entry.weight)})</span>`)
          .join("")}</td>
        <td>${(mrciEntry.instructionItems || [])
          .map((entry) => `<span class="pill success">${escapeHtml(entry.label)} (${formatNumber(entry.weight)})</span>`)
          .join("")}</td>
        <td>${formatNumber(mrciEntry.total)}</td>
        <td>${formatNumber(amrciEntry?.total || 0)}</td>
        <td>${uniqueStrings([...(mrciEntry.warnings || []), ...(amrciEntry?.warnings || [])])
          .map((warning) => `<span class="pill warning">${escapeHtml(warning)}</span>`)
          .join("")}</td>
      </tr>
    `;
  });

  return `
    <table class="results-table">
      <thead>
        <tr>
          <th>Medicamento</th>
          <th>Forma/ruta</th>
          <th>Frecuencias puntuadas</th>
          <th>Instrucciones puntuadas</th>
          <th>MRCI B+C</th>
          <th>A-MRCI B+C</th>
          <th>Avisos</th>
        </tr>
      </thead>
      <tbody>${rows.join("")}</tbody>
    </table>
  `;
}

function renderQualityControl(score) {
  const warnings = uniqueStrings([
    ...score.mrci.warnings,
    ...score.amrci.warnings,
    ...score.mrci.qualityFlags,
    ...score.amrci.qualityFlags,
  ]);

  const generic = [
    "No existe un umbral universal unico de MRCI validado para todos los contextos clinicos.",
    "El A-MRCI de esta app es una plantilla de referencia editable que debe validarse localmente.",
  ];

  dom.qualityControl.innerHTML = [...generic, ...warnings]
    .map((item) => `<div class="bullet-item">${escapeHtml(item)}</div>`)
    .join("");
}

function renderAudit() {
  if (!state.audit.length) {
    dom.auditLog.innerHTML = `<p class="muted">Sin eventos de auditoria.</p>`;
    return;
  }

  dom.auditLog.innerHTML = state.audit
    .map(
      (entry) => `
        <div class="bullet-item">
          <strong>${escapeHtml(entry.at)}</strong><br />
          ${escapeHtml(entry.message)}
        </div>
      `
    )
    .join("");
}

function renderFormsBreakdown(score) {
  const items = score.mrci.formBreakdown.map(
    (entry) => `<div class="bullet-item">${escapeHtml(entry.label)} (${formatNumber(entry.weight)})</div>`
  );

  dom.formsBreakdown.innerHTML = items.length
    ? items.join("")
    : `<p class="muted">Sin formas/rutas registradas.</p>`;
}

function renderScoreboard(score) {
  dom.metricMrciTotal.textContent = formatNumber(score.mrci.total);
  dom.metricMrciSections.textContent = `A ${formatNumber(score.mrci.sectionA)} | B ${formatNumber(
    score.mrci.sectionB
  )} | C ${formatNumber(score.mrci.sectionC)}`;
  dom.metricAmrciTotal.textContent = formatNumber(score.amrci.total);
  dom.metricAmrciSections.textContent = `A ${formatNumber(score.amrci.sectionA)} | B ${formatNumber(
    score.amrci.sectionB
  )} | C ${formatNumber(score.amrci.sectionC)}`;
  dom.metricDelta.textContent = `${score.deltaAbsolute >= 0 ? "+" : ""}${formatNumber(score.deltaAbsolute)}`;
  dom.metricDeltaRelative.textContent = formatPercent(score.deltaRelative);
  dom.metricMedCount.textContent = String(score.medicationCount);
  dom.metricParser.textContent = state.regimen.source || "Sin regimen";
}

function renderCompare() {
  const { regimenA, regimenB } = state.compare;
  if (!regimenA || !regimenB) {
    dom.compareOutput.innerHTML = `
      <p class="muted">Guarda un regimen en A y otro en B para comparar.</p>
      <p class="muted">A: ${regimenA ? regimenA.title : "vacio"} | B: ${regimenB ? regimenB.title : "vacio"}</p>
    `;
    return;
  }

  const scoreA = scoreRegimen(regimenA, state.config);
  const scoreB = scoreRegimen(regimenB, state.config);
  const delta = scoreB.mrci.total - scoreA.mrci.total;

  dom.compareOutput.innerHTML = `
    <div class="grid two-up">
      <div>
        <h3>Regimen A</h3>
        <p><strong>${escapeHtml(regimenA.title)}</strong></p>
        <p>MRCI ${formatNumber(scoreA.mrci.total)} | A-MRCI ${formatNumber(scoreA.amrci.total)}</p>
        <p>${scoreA.medicationCount} medicamentos</p>
      </div>
      <div>
        <h3>Regimen B</h3>
        <p><strong>${escapeHtml(regimenB.title)}</strong></p>
        <p>MRCI ${formatNumber(scoreB.mrci.total)} | A-MRCI ${formatNumber(scoreB.amrci.total)}</p>
        <p>${scoreB.medicationCount} medicamentos</p>
      </div>
    </div>
    <div class="bullet-box">
      <div class="bullet-item">Diferencia MRCI B - A: ${delta >= 0 ? "+" : ""}${formatNumber(delta)}</div>
      <div class="bullet-item">Diferencia A-MRCI B - A: ${formatNumber(scoreB.amrci.total - scoreA.amrci.total)}</div>
      <div class="bullet-item">Medicamentos B - A: ${scoreB.medicationCount - scoreA.medicationCount}</div>
    </div>
  `;
}

function renderResults() {
  const score = scoreRegimen(state.regimen, state.config);
  renderScoreboard(score);
  dom.clinicalSummary.textContent = buildClinicalSummary(score);
  dom.resultsTable.innerHTML = buildResultsTableHtml(score);
  renderQualityControl(score);
  renderFormsBreakdown(score);
  renderCompare();
}

function renderAll() {
  renderParseNotes();
  renderManualFrequencyEntries();
  renderRegimenPreview();
  renderAudit();
  renderResults();
}

function saveCurrentRegimenTo(slot) {
  const snapshot = deepClone(state.regimen);
  snapshot.title = `Regimen ${slot} - ${new Date().toLocaleString("es-ES")}`;
  state.compare[slot === "A" ? "regimenA" : "regimenB"] = snapshot;
  pushAudit(`Se guardo el regimen actual como regimen ${slot}.`);
  persistState();
  renderCompare();
  renderAudit();
  setStatus(`Regimen guardado en ${slot}.`, "success");
}

function exportCurrentJson() {
  const payload = {
    regimen: state.regimen,
    score: scoreRegimen(state.regimen, state.config),
    config: state.config,
  };
  downloadTextFile("mrci-regimen.json", JSON.stringify(payload, null, 2), "application/json");
}

function exportCurrentCsv() {
  const score = scoreRegimen(state.regimen, state.config);
  const rows = [
    [
      "nombre",
      "forma_ruta",
      "frecuencias",
      "instrucciones",
      "mrci_b_c",
      "amrci_b_c",
      "avisos",
    ],
  ];

  score.mrci.medicationBreakdown.forEach((mrciEntry, index) => {
    const medication = state.regimen.medications[index];
    const amrciEntry = score.amrci.medicationBreakdown[index];
    rows.push([
      medication?.name || "",
      state.config.mrciTables.forms[medication?.dosageFormKey]?.label || "",
      summarizeList((mrciEntry.frequencyItems || []).map((entry) => entry.label), ""),
      summarizeList((mrciEntry.instructionItems || []).map((entry) => entry.label), ""),
      formatNumber(mrciEntry.total),
      formatNumber(amrciEntry?.total || 0),
      summarizeList(uniqueStrings([...(mrciEntry.warnings || []), ...(amrciEntry?.warnings || [])]), ""),
    ]);
  });

  downloadTextFile("mrci-regimen.csv", toCsv(rows), "text/csv;charset=utf-8");
}

async function copySummary() {
  const text = [
    `MRCI ${dom.metricMrciTotal.textContent}`,
    `A-MRCI ${dom.metricAmrciTotal.textContent}`,
    dom.clinicalSummary.textContent,
  ].join("\n");

  await navigator.clipboard.writeText(text);
  setStatus("Resumen copiado al portapapeles.", "success");
}

async function handleLocalParse() {
  const text = dom.rawInput.value.trim();
  if (!text) {
    setStatus("Pegue primero una lista de medicamentos.", "warning");
    return;
  }

  const result = parseMedicationText(text, state.config);
  mergeParsedResult(result, "parser-local");
}

async function handleGeminiTextParse() {
  const text = dom.rawInput.value.trim();
  if (!text) {
    setStatus("Pegue primero una lista de medicamentos.", "warning");
    return;
  }

  if (!dom.geminiApiKey.value.trim()) {
    setStatus("Introduzca la API key de Gemini en Configuracion.", "warning");
    return;
  }

  setStatus("Consultando Gemini para parseo estructurado...", "info");
  const payload = await parseWithGeminiText({
    apiKey: dom.geminiApiKey.value.trim(),
    model: dom.geminiModel.value.trim() || "gemini-2.5-flash",
    text,
  });

  mergeParsedResult(sanitizeGeminiPayload(payload, state.config), "gemini-text");
}

async function handleGeminiPdfParse() {
  const file = dom.pdfInput.files?.[0];
  if (!file) {
    setStatus("Seleccione un PDF primero.", "warning");
    return;
  }

  if (!dom.geminiApiKey.value.trim()) {
    setStatus("Introduzca la API key de Gemini en Configuracion.", "warning");
    return;
  }

  setStatus("Extrayendo PDF con Gemini...", "info");
  const payload = await parseWithGeminiPdf({
    apiKey: dom.geminiApiKey.value.trim(),
    model: dom.geminiModel.value.trim() || "gemini-2.5-flash",
    base64Pdf: await fileToBase64(file),
  });

  mergeParsedResult(sanitizeGeminiPayload(payload, state.config), "gemini-pdf");
}

function handleManualAdd() {
  const medication = buildManualMedication();
  state.regimen.medications.push(medication);
  state.regimen.source = "manual";
  pushAudit(`Se anadio manualmente ${medication.name}.`);
  persistState();
  resetManualForm();
  renderAll();
  setStatus(`Medicamento ${medication.name} anadido al regimen.`, "success");
}

function resetCase() {
  state.regimen = createEmptyRegimen();
  state.audit = [];
  state.parseInfo = null;
  state.manualFrequencyEntries = [];
  persistState();
  resetManualForm();
  dom.rawInput.value = "";
  dom.pdfInput.value = "";
  renderAll();
  setStatus("Se inicio un nuevo caso.", "success");
}

function saveConfig() {
  const forms = readJsonSafe(dom.configForms.value);
  const frequencies = readJsonSafe(dom.configFrequencies.value);
  const instructions = readJsonSafe(dom.configInstructions.value);
  const amrciReference = readJsonSafe(dom.configAmrci.value);

  if (!forms || !frequencies || !instructions || !amrciReference) {
    throw new Error("Revise el JSON de configuracion. Al menos una seccion no es valida.");
  }

  state.config.mrciTables.forms = forms;
  state.config.mrciTables.frequencies = frequencies;
  state.config.mrciTables.instructions = instructions;
  state.config.amrciReference = amrciReference;
  state.gemini.apiKey = dom.geminiApiKey.value.trim();
  state.gemini.model = dom.geminiModel.value.trim() || "gemini-2.5-flash";
  state.gemini.useForText = dom.geminiEnableText.checked;
  state.gemini.useForPdf = dom.geminiEnablePdf.checked;
  persistState();
  renderAll();
  setStatus("Configuracion guardada.", "success");
}

function exportConfig() {
  const payload = {
    config: state.config,
    gemini: {
      ...state.gemini,
      apiKey: dom.geminiApiKey.value.trim(),
      model: dom.geminiModel.value.trim() || "gemini-2.5-flash",
      useForText: dom.geminiEnableText.checked,
      useForPdf: dom.geminiEnablePdf.checked,
    },
  };
  downloadTextFile("mrci-config.json", JSON.stringify(payload, null, 2), "application/json");
}

async function importConfig(file) {
  const text = await file.text();
  const payload = readJsonSafe(text);
  if (!payload?.config) {
    throw new Error("Archivo de configuracion invalido.");
  }
  state.config = payload.config;
  state.gemini = payload.gemini || deepClone(DEFAULT_GEMINI_SETTINGS);
  persistState();
  syncStaticControls();
  renderAll();
  setStatus("Configuracion importada.", "success");
}

function restoreDefaultConfig() {
  state.config = deepClone(DEFAULT_APP_CONFIG);
  state.gemini = deepClone(DEFAULT_GEMINI_SETTINGS);
  persistState();
  syncStaticControls();
  renderAll();
  setStatus("Configuracion restaurada a valores por defecto.", "success");
}

function bindEvents() {
  dom.tabs.forEach((button) => {
    button.addEventListener("click", () => renderTabs(button.dataset.tab));
  });

  dom.addFrequencyBtn.addEventListener("click", () => {
    try {
      state.manualFrequencyEntries.push(buildManualFrequencyEntry());
      renderManualFrequencyEntries();
      dom.manualFrequency.value = "";
      dom.manualCustomHours.value = "";
      dom.manualCustomCount.value = "";
      dom.manualFrequencyPrn.checked = false;
    } catch (error) {
      setStatus(error.message, "warning");
    }
  });

  dom.manualAddBtn.addEventListener("click", () => {
    try {
      handleManualAdd();
    } catch (error) {
      setStatus(error.message, "warning");
    }
  });

  dom.manualResetBtn.addEventListener("click", resetManualForm);
  dom.clearTextBtn.addEventListener("click", () => {
    dom.rawInput.value = "";
    setStatus("Entrada de texto limpiada.", "success");
  });

  dom.parseLocalBtn.addEventListener("click", () => handleLocalParse().catch((error) => setStatus(error.message, "error")));
  dom.parseGeminiTextBtn.addEventListener("click", () => handleGeminiTextParse().catch((error) => setStatus(error.message, "error")));
  dom.parseGeminiPdfBtn.addEventListener("click", () => handleGeminiPdfParse().catch((error) => setStatus(error.message, "error")));

  dom.exportJsonBtn.addEventListener("click", exportCurrentJson);
  dom.exportCsvBtn.addEventListener("click", exportCurrentCsv);
  dom.copySummaryBtn.addEventListener("click", () => copySummary().catch((error) => setStatus(error.message, "error")));

  dom.saveRegimenABtn.addEventListener("click", () => saveCurrentRegimenTo("A"));
  dom.saveRegimenBBtn.addEventListener("click", () => saveCurrentRegimenTo("B"));
  dom.compareBtn.addEventListener("click", renderCompare);

  dom.saveConfigBtn.addEventListener("click", () => {
    try {
      saveConfig();
    } catch (error) {
      setStatus(error.message, "error");
    }
  });
  dom.exportConfigBtn.addEventListener("click", exportConfig);
  dom.triggerImportConfigBtn.addEventListener("click", () => dom.importConfigInput.click());
  dom.importConfigInput.addEventListener("change", () => {
    const file = dom.importConfigInput.files?.[0];
    if (!file) {
      return;
    }
    importConfig(file).catch((error) => setStatus(error.message, "error"));
  });
  dom.restoreConfigBtn.addEventListener("click", restoreDefaultConfig);
  dom.newCaseButtons.forEach((button) => button.addEventListener("click", resetCase));
}

function init() {
  clearLegacyStorage();
  syncStaticControls();
  bindEvents();
  renderTabs("input");
  renderAll();
  setStatus("App lista. Esta sesion no guarda casos anteriores al recargar.", "info");
}

init();
