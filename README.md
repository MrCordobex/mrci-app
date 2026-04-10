# MRCI / A-MRCI Studio

App web estatica para calcular complejidad farmacoterapeutica con:

- `MRCI` de referencia basado en George et al. 2004.
- `A-MRCI` como plantilla editable basada en Scrivens et al. 2024.
- parser local auditable para texto libre en espanol.
- integracion opcional con Gemini para parseo estructurado de texto o PDF.

## Principios metodologicos

- La `Seccion A` puntua cada `forma/ruta unica` una sola vez por regimen.
- La `Seccion B` puntua cada patron de frecuencia por medicamento.
- La `Seccion C` permite multiples instrucciones adicionales por medicamento.
- `A-MRCI` no se fuerza a ser mayor que `MRCI`; eso fue un hallazgo de cohorte en Scrivens, no una regla universal.
- La plantilla `A-MRCI` debe validarse localmente antes de uso investigador o clinico.

## Estructura

- `index.html`: layout de la app.
- `styles.css`: estilos.
- `src/data/tables.js`: tablas MRCI y plantilla A-MRCI.
- `src/core/scoring.js`: motor de scoring.
- `src/core/parser.js`: parser local y saneado de salida Gemini.
- `src/integrations/gemini.js`: llamada REST a Gemini desde navegador.
- `src/main.js`: estado, eventos, render y exportaciones.
- `serve.py`: servidor HTTP simple para desarrollo local.

## Uso local

### Opcion 1: Python

```bash
python serve.py
```

Despues abre:

```text
http://127.0.0.1:8000
```

### Opcion 2: servidor simple

```bash
python -m http.server 8000 --directory mrci-app
```

## Gemini opcional

Si quieres parseo estructurado con Google Gemini:

1. Introduce tu API key en `Configuracion`.
2. Selecciona el modelo.
3. Usa `Parsear con Gemini` para texto o `Extraer PDF con Gemini`.

La app llama a la API REST de Gemini directamente desde el navegador y guarda la clave en `localStorage`.

## Limitaciones conocidas

- El parser local usa heuristicas: no sustituye revision humana.
- El soporte de frecuencias no oficiales en `MRCI` se senala como advertencia.
- En `A-MRCI`, las frecuencias no oficiales pueden interpolarse como plantilla de trabajo, pero requieren validacion local.
- El parseo de PDF depende de Gemini; la app no incorpora OCR local.

## Referencias

- George J, et al. Development and Validation of the Medication Regimen Complexity Index. 2004.
- Scrivens RP, et al. Development and assessment of an abbreviated medication regimen complexity index (the A-MRCI). 2024/2025.
