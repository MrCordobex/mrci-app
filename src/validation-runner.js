import { parseMedicationText } from "./core/parser.js";
import { scoreRegimen } from "./core/scoring.js";
import { DEFAULT_APP_CONFIG } from "./data/tables.js";
import { deepClone, escapeHtml, formatNumber } from "./utils/helpers.js";

const dom = {
  configSourceLabel: document.querySelector("#config-source-label"),
  runButton: document.querySelector("#run-validation-btn"),
  status: document.querySelector("#validation-status"),
  exactPassCount: document.querySelector("#exact-pass-count"),
  exactPassDetail: document.querySelector("#exact-pass-detail"),
  exactFailCount: document.querySelector("#exact-fail-count"),
  rankingStatus: document.querySelector("#ranking-status"),
  rankingDetail: document.querySelector("#ranking-detail"),
  parserWarningCount: document.querySelector("#parser-warning-count"),
  summary: document.querySelector("#validation-summary"),
  rankingBox: document.querySelector("#ranking-box"),
  exactCasesTable: document.querySelector("#exact-cases-table"),
};

function setStatus(message, tone = "info") {
  dom.status.textContent = message;
  dom.status.className = `status-bar ${tone}`;
}

function loadActiveConfig() {
  dom.configSourceLabel.textContent = "Por defecto (sin persistencia)";
  return deepClone(DEFAULT_APP_CONFIG);
}

function nearlyEqual(left, right, tolerance = 0.001) {
  return Math.abs(Number(left) - Number(right)) <= tolerance;
}

function checkSection(actual, expected) {
  return (
    nearlyEqual(actual.sectionA, expected.sectionA) &&
    nearlyEqual(actual.sectionB, expected.sectionB) &&
    nearlyEqual(actual.sectionC, expected.sectionC) &&
    nearlyEqual(actual.total, expected.total)
  );
}

function buildCaseResultHtml(result) {
  const toneClass = result.pass ? "success" : "warning";
  return `
    <tr>
      <td><strong>${escapeHtml(result.id)}</strong><br />${escapeHtml(result.title)}</td>
      <td><span class="pill ${toneClass}">${result.pass ? "PASS" : "FAIL"}</span></td>
      <td>${formatNumber(result.actual.mrci.total)}</td>
      <td>${formatNumber(result.expected.mrci.total)}</td>
      <td>${formatNumber(result.actual.amrci.total)}</td>
      <td>${formatNumber(result.expected.amrci.total)}</td>
      <td>${escapeHtml(result.notes.join(" | ") || "Sin incidencias")}</td>
    </tr>
  `;
}

function runExactCases(payload, config) {
  return payload.exactCases.map((testCase) => {
    const actual = scoreRegimen(testCase.regimen, config);
    const mrciPass = checkSection(actual.mrci, testCase.expected.mrci);
    const amrciPass = checkSection(actual.amrci, testCase.expected.amrci);
    const notes = [];

    if (!mrciPass) {
      notes.push(
        `MRCI real A ${formatNumber(actual.mrci.sectionA)} B ${formatNumber(actual.mrci.sectionB)} C ${formatNumber(actual.mrci.sectionC)}`
      );
    }

    if (!amrciPass) {
      notes.push(
        `A-MRCI real A ${formatNumber(actual.amrci.sectionA)} B ${formatNumber(actual.amrci.sectionB)} C ${formatNumber(actual.amrci.sectionC)}`
      );
    }

    return {
      id: testCase.id,
      title: testCase.title,
      pass: mrciPass && amrciPass,
      expected: testCase.expected,
      actual,
      notes,
    };
  });
}

function runRankingRegression(payload, config) {
  const suite = payload.literatureRegression[0];
  const expectedOrder = suite.expectedRanking.join(" < ");
  const scored = suite.expectedRanking.map((label) => {
    const lines = suite.regimens[label] || [];
    const parsed = parseMedicationText(lines.join("\n"), config);
    const regimen = {
      id: `lit-${label}`,
      title: `Regimen ${label}`,
      medications: parsed.medications,
    };
    const score = scoreRegimen(regimen, config);
    return {
      label,
      parsed,
      score,
    };
  });

  const actualOrder = scored
    .slice()
    .sort((left, right) => left.score.mrci.total - right.score.mrci.total)
    .map((entry) => entry.label)
    .join(" < ");

  const totalWarnings = scored.reduce(
    (sum, entry) =>
      sum +
      (entry.parsed.warnings?.length || 0) +
      (entry.score.mrci.warnings?.length || 0) +
      (entry.score.amrci.warnings?.length || 0),
    0
  );

  return {
    pass: actualOrder === expectedOrder,
    expectedOrder,
    actualOrder,
    totalWarnings,
    scored,
  };
}

function renderResults(exactResults, ranking) {
  const exactPass = exactResults.filter((entry) => entry.pass).length;
  const exactFail = exactResults.length - exactPass;

  dom.exactPassCount.textContent = String(exactPass);
  dom.exactPassDetail.textContent = `${exactPass} / ${exactResults.length}`;
  dom.exactFailCount.textContent = String(exactFail);
  dom.rankingStatus.textContent = ranking.pass ? "PASS" : "FAIL";
  dom.rankingDetail.textContent = ranking.actualOrder;
  dom.parserWarningCount.textContent = String(ranking.totalWarnings);

  dom.summary.innerHTML = [
    `<div class="bullet-item">Casos exactos superados: ${exactPass} de ${exactResults.length}</div>`,
    `<div class="bullet-item">Casos exactos fallidos: ${exactFail}</div>`,
    `<div class="bullet-item">Ranking esperado: ${escapeHtml(ranking.expectedOrder)}</div>`,
    `<div class="bullet-item">Ranking real: ${escapeHtml(ranking.actualOrder)}</div>`,
  ].join("");

  dom.rankingBox.innerHTML = ranking.scored
    .map(
      (entry) => `
        <div class="bullet-item">
          <strong>Regimen ${escapeHtml(entry.label)}</strong><br />
          MRCI ${formatNumber(entry.score.mrci.total)} | A-MRCI ${formatNumber(entry.score.amrci.total)} | Medicamentos parseados ${entry.parsed.medications.length}
        </div>
      `
    )
    .join("");

  dom.exactCasesTable.innerHTML = `
    <table class="results-table">
      <thead>
        <tr>
          <th>Caso</th>
          <th>Estado</th>
          <th>MRCI real</th>
          <th>MRCI esperado</th>
          <th>A-MRCI real</th>
          <th>A-MRCI esperado</th>
          <th>Notas</th>
        </tr>
      </thead>
      <tbody>
        ${exactResults.map((entry) => buildCaseResultHtml(entry)).join("")}
      </tbody>
    </table>
  `;
}

async function runValidation() {
  setStatus("Ejecutando validacion automatica...", "info");

  const response = await fetch("./validation-cases.json", { cache: "no-store" });
  if (!response.ok) {
    throw new Error("No se pudo cargar validation-cases.json");
  }

  const payload = await response.json();
  const config = loadActiveConfig();
  const exactResults = runExactCases(payload, config);
  const ranking = runRankingRegression(payload, config);

  renderResults(exactResults, ranking);

  if (exactResults.every((entry) => entry.pass) && ranking.pass) {
    setStatus("Validacion completada: todo en verde.", "success");
  } else {
    setStatus("Validacion completada: hay discrepancias que revisar.", "warning");
  }
}

dom.runButton.addEventListener("click", () => {
  runValidation().catch((error) => setStatus(error.message, "error"));
});

loadActiveConfig();
setStatus("Pulsa \"Ejecutar validacion\" para comprobar todos los casos de una vez.", "info");

const params = new URLSearchParams(window.location.search);
if (params.get("autorun") === "1") {
  runValidation().catch((error) => setStatus(error.message, "error"));
}
