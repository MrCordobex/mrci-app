export function createId(prefix = "id") {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

export function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function readJsonSafe(text, fallback = null) {
  try {
    return JSON.parse(text);
  } catch (error) {
    return fallback;
  }
}

export function normalizeText(value = "") {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function formatNumber(value, decimals = 1) {
  if (!Number.isFinite(value)) {
    return "0";
  }

  const hasDecimals = Math.abs(value % 1) > 0;
  return value.toLocaleString("es-ES", {
    minimumFractionDigits: hasDecimals ? decimals : 0,
    maximumFractionDigits: decimals,
  });
}

export function formatPercent(value, decimals = 1) {
  if (!Number.isFinite(value)) {
    return "0%";
  }

  return `${formatNumber(value, decimals)}%`;
}

export function downloadTextFile(filename, text, mimeType = "text/plain;charset=utf-8") {
  const blob = new Blob([text], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const [, base64 = ""] = result.split(",");
      resolve(base64);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function nonEmpty(array = []) {
  return array.filter(Boolean);
}

export function uniqueStrings(values = []) {
  return [...new Set(values.filter(Boolean))];
}

export function toCsv(rows = []) {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const value = String(cell ?? "");
          if (/[",\n;]/.test(value)) {
            return `"${value.replaceAll('"', '""')}"`;
          }
          return value;
        })
        .join(",")
    )
    .join("\n");
}

export function summarizeList(items = [], fallback = "Sin datos") {
  const clean = items.filter(Boolean);
  return clean.length ? clean.join(", ") : fallback;
}

export function average(values = []) {
  const clean = values.filter((value) => Number.isFinite(value));
  if (!clean.length) {
    return 0;
  }
  return clean.reduce((sum, value) => sum + value, 0) / clean.length;
}

export function maybeNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  const normalized = String(value ?? "")
    .replace(",", ".")
    .trim();

  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}
