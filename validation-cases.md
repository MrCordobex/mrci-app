# Casos de validacion MRCI / A-MRCI

Esta bateria mezcla dos niveles:

- `Casos exactos`: con puntuacion esperada numerica.
- `Regresion de literatura`: regimenes del Appendix I de George et al. 2004 para comprobar orden relativo de complejidad.

Archivo estructurado: [validation-cases.json](/C:/Users/pedro/Desktop/TFG-ANA/mrci-app/validation-cases.json)

## Casos exactos

### C01 Monoterapia oral simple

- Regimen: `atorvastatina 1 comprimido una vez al dia`
- Esperado:
- `MRCI = 2`
- `A-MRCI = 2`
- Desglose:
- `A = 1`, `B = 1`, `C = 0`

### C02 Dos orales con misma forma

- Regimen:
- `metformina 1 comprimido BID`
- `omeprazol 1 capsula una vez al dia en ayunas`
- Esperado:
- `MRCI = 5`
- `A-MRCI = 5`
- Punto clave:
- La forma `tablets_capsules` debe contarse una sola vez en Seccion A.

### C03 Rescate inhalado PRN

- Regimen:
- `salbutamol inhalador 2 puff PRN`
- Esperado:
- `MRCI = 5.5`
- `A-MRCI = 5.5`
- Desglose:
- `A = 4`, `B = 0.5`, `C = 1`

### C04 Anticoagulante q12h mas gastroproteccion

- Regimen:
- `apixaban cada 12 horas`
- `omeprazol una vez al dia en ayunas`
- Esperado:
- `MRCI = 5.5`
- `A-MRCI = 5.5`
- Punto clave:
- `q12h` no es igual a `BID`; en MRCI pesa `2.5`.

### C05 Parche semanal

- Regimen:
- `estradiol parche semanal`
- Esperado:
- `MRCI = 4`
- `A-MRCI = 4`

### C06 Alendronato semanal con liquido especifico

- Regimen:
- `alendronato semanal con un vaso de agua`
- Esperado:
- `MRCI = 4`
- `A-MRCI = 4`

### C07 Insulina basal nocturna

- Regimen:
- `insulina glargina 20 UI noche`
- Esperado:
- `MRCI = 5`
- `A-MRCI = 5`
- Punto clave:
- `20 UI` no debe convertir automaticamente el caso en `multiple_units_at_one_time`.

### C08 Triple inhalada tipo EPOC

- Regimen:
- `salbutamol MDI 2 puff PRN`
- `fluticasona MDI 2 puff BID`
- `ipratropio MDI 2 puff TID`
- Esperado:
- `MRCI = 12.5`
- `A-MRCI = 12.5`
- Punto clave:
- La forma MDI cuenta una sola vez en A, pero las frecuencias y direcciones se suman por medicamento.

### C09 Accuhaler excluido en plantilla A-MRCI

- Regimen:
- `fluticasona/salmeterol Accuhaler 1 puff BID`
- Esperado:
- `MRCI = 5`
- `A-MRCI = 2`
- Punto clave:
- En la plantilla de referencia A-MRCI, `Accuhaler` esta excluido.

### C10 Oxigenoterapia excluida en plantilla A-MRCI

- Regimen:
- `oxigeno >15 h/dia`
- Esperado:
- `MRCI = 6`
- `A-MRCI = 0`

### C11 Patron regular mas rescate en el mismo farmaco

- Regimen:
- `salbutamol MDI 2 puff BID y PRN`
- Esperado:
- `MRCI = 7.5`
- `A-MRCI = 7.5`
- Punto clave:
- Deben puntuarse ambos patrones de frecuencia.

### C12 Frecuencia no oficial q5h

- Regimen:
- `ipratropio MDI 1 puff cada 5 horas`
- Esperado:
- `MRCI = 4` con aviso de frecuencia no oficial
- `A-MRCI = 9.5`
- Punto clave:
- La plantilla A-MRCI interpola entre `q6h = 4.5` y `q4h = 6.5`, dando `5.5`.

## Regresion de literatura

Usa tambien los regimenes `A-F` del `Appendix I` de George et al. 2004.

No hace falta que tu app reproduzca exactamente una cifra publicada para cada uno, pero si deberia respetar esta propiedad:

- Orden esperado de complejidad: `A < B < C < D < E < F`

Si ese orden no se mantiene, hay un problema serio en el motor de scoring o en el parser.
