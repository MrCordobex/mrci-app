import { GEMINI_SCHEMA_ENUMS } from "../data/tables.js";

function buildMedicationSchema() {
  return {
    type: "object",
    properties: {
      name: { type: "string", description: "Nombre del medicamento, sin dosis." },
      raw_line: { type: "string", description: "Linea original o fragmento original." },
      dosage_form_key: {
        type: "string",
        enum: GEMINI_SCHEMA_ENUMS.dosageForms,
        description: "Clave de forma/ruta MRCI.",
      },
      units_per_dose: {
        type: "string",
        description: "Numero de unidades por toma, por ejemplo 1, 2 puff, 20 UI.",
      },
      frequency_entries: {
        type: "array",
        items: {
          type: "object",
          properties: {
            code: {
              type: "string",
              enum: GEMINI_SCHEMA_ENUMS.frequencyCodes,
              description: "Clave oficial si existe o custom_interval/custom_daily_count.",
            },
            label: { type: "string", description: "Etiqueta legible del patron." },
            interval_hours: {
              type: "number",
              description: "Numero de horas si el patron es tipo custom_interval.",
            },
            administrations_per_day: {
              type: "number",
              description: "Numero de administraciones diarias si el patron es custom_daily_count.",
            },
            prn: { type: "boolean", description: "Si es PRN/segun necesidad." },
          },
          required: ["code", "label"],
        },
      },
      additional_direction_keys: {
        type: "array",
        items: {
          type: "string",
          enum: GEMINI_SCHEMA_ENUMS.instructionKeys,
        },
      },
      confidence: {
        type: "number",
        description: "Confianza 0-1 de la extraccion.",
      },
      notes: { type: "string", description: "Notas breves relevantes para auditoria." },
      warnings: {
        type: "array",
        items: { type: "string" },
      },
    },
    required: ["name", "dosage_form_key", "frequency_entries", "additional_direction_keys"],
  };
}

function buildResponseSchema() {
  return {
    type: "object",
    properties: {
      medications: {
        type: "array",
        items: buildMedicationSchema(),
      },
      warnings: {
        type: "array",
        items: { type: "string" },
      },
    },
    required: ["medications", "warnings"],
  };
}

function buildPrompt() {
  return `
Eres un extractor estructurado para una app clinica de complejidad farmacoterapeutica.
Debes convertir el contenido de entrada en una lista de medicamentos para scoring MRCI/A-MRCI.

Reglas:
1. No inventes medicamentos ni frecuencias.
2. Si algo no es seguro, usa warnings y deja el campo mas conservador posible.
3. La forma/ruta debe usar una de las claves permitidas.
4. La frecuencia puede incluir multiples frequency_entries si la prescripcion contiene un patron regular y otro PRN separado.
5. Si aparece "cada 12 h PRN" eso es un solo patron PRN de intervalo fijo.
6. Si aparece un patron como 1-0-1, conviertelo a frecuencia estandar equivalente.
7. Detecta instrucciones adicionales solo si estan explicitamente soportadas.
8. Devuelve solo JSON valido segun el esquema.
`;
}

function extractTextFromResponse(payload) {
  const text = payload?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error("Gemini no devolvio texto util.");
  }
  return text;
}

async function callGeminiApi({ apiKey, model, parts }) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          responseMimeType: "application/json",
          responseJsonSchema: buildResponseSchema(),
        },
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error ${response.status}: ${errorText}`);
  }

  const payload = await response.json();
  return JSON.parse(extractTextFromResponse(payload));
}

export async function parseWithGeminiText({ apiKey, model, text }) {
  if (!apiKey) {
    throw new Error("Falta la API key de Gemini.");
  }

  return callGeminiApi({
    apiKey,
    model,
    parts: [{ text: `${buildPrompt()}\n\nContenido:\n${text}` }],
  });
}

export async function parseWithGeminiPdf({ apiKey, model, base64Pdf }) {
  if (!apiKey) {
    throw new Error("Falta la API key de Gemini.");
  }

  return callGeminiApi({
    apiKey,
    model,
    parts: [
      { text: buildPrompt() },
      {
        inline_data: {
          mime_type: "application/pdf",
          data: base64Pdf,
        },
      },
    ],
  });
}
