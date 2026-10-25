# Funcionamiento actual del HMI

Documento de referencia del **estado real en firmware** (SquareLine + runtime).  
Sirve para entender qué hace hoy el equipo y como base para rediseñar la UI.

Fuente de verdad: `DESARROLLO.ino`, `app_runtime.cpp`, `ui_app_logic.cpp`, `ui_nav.c`, `ui_input_overlay.cpp`, pantallas `ui_*.c`.

---

## 1. Qué es el producto

**Módulo regulador de consumo energético** con HMI local en ESP32-S3.

El operador controla un ventilador/motor según temperatura, humedad y presencia; guarda historial; se conecta por WiFi; publica estado en Firebase y acepta órdenes remotas desde la web.

| Dato | Valor |
|------|--------|
| Resolución | **480 × 272** px |
| UI | LVGL 8.3.11 + SquareLine 1.6 |
| Nodo Firebase | `/avc01` |
| Comandos remotos | `/avc01/comandos` |
| Zona horaria | COT (UTC−5), NTP |

---

## 2. Hardware relevante

| Función | GPIO / bus |
|---------|------------|
| Pantalla NV3041A (QSPI) | CS 45, SCK 47, D0–D3 21/48/40/39 |
| Backlight | GPIO 1 |
| Touch GT911 | SDA 8, SCL 4, RES 38, INT 3 |
| DHT11 (T/H) | GPIO 17 |
| Sensor potencia (ZMCT103C) | GPIO 5 |
| Movimiento / PIR | GPIO 16 |
| Salida relay PIR | GPIO 15 |

**Nota de diseño:** el estado del motor (marcha, modo, velocidad) vive en UI + Firebase. La única salida GPIO de actuación en firmware es el **relay PIR (15)**. No hay PWM de motor en el código actual.

---

## 3. Pantallas (comportamiento en vivo)

Hay **5 pantallas**. La navegación usa un **drawer** (botón circular azul) y **gestos** de deslizamiento. Los iconos superiores de SquareLine se ocultan en runtime.

Ciclo de gestos:  
`HOME ↔ MONITOREO ↔ CONFIGURACIONES ↔ ALERTAS ↔ WIFI ↔ HOME`

### 3.1 HOME — operación

**Propósito:** ver clima interior, setpoint, consumo/velocidad/PIR y arrancar o parar.

| Zona | Contenido |
|------|-----------|
| Barra | Título `HOME`, reloj `H:MM AM/PM`, icono refrescar, icono WiFi (solo si hay enlace) |
| Izquierda | `Temperatura °C`, valor vivo, `SP:` editable (18–35 °C) |
| Centro | `Humedad`, valor vivo `%` |
| Derecha (panel Operación) | `OPERACION` + piloto; `Consumo`; `Velocidad`; `PIR ON` / `PIR OFF` |
| Abajo | Botón marcha (texto SquareLine `STAR`), `STOP`, dropdown `AUTOMATICO` / `MANUAL`, arco de velocidad |

**Acciones**

- **STAR / START:** pone motor en marcha.
- **STOP:** detiene y pone velocidad en 0.
- **Modo:** al cambiar de modo el motor se detiene.
- **Arco:** solo editable en `MANUAL` (0–100 %).
- **SP:** abre overlay `EDITAR SP (18-35 C)`.
- En **AUTOMATICO**, la velocidad se calcula con temperatura y humedad (si ambos sensores están activos). El **setpoint no entra** en esa fórmula hoy.
- Si el sensor de movimiento está **habilitado**, el motor efectivo solo corre con presencia (retención ~15 s).

### 3.2 MONITOREO — historial y gráfica

**Propósito:** ver series de temperatura, humedad y potencia; borrar historial.

| Elemento | Comportamiento |
|----------|----------------|
| Días | `Lun` … `Dom` (selección) |
| Gráfica | 24 puntos; Temp / Humedad / Potencia |
| Tarjetas live | `Pot:`, `Temp:`, `Hum:` |
| `Borrar Datos` | Limpia historial semanal + buffer live |
| Tooltip | Al tocar un punto: día, hora, valores |

Día actual: muestras en vivo (~cada 500 ms). Otros días: promedios horarios guardados. Leyenda según sensores habilitados.

### 3.3 ALERTAS — salud de canales

**Propósito:** estado de cada canal del sistema. Sin botones de acción (solo ver + refrescar).

Canales:

1. `TEMPERATURA`
2. `HUMEDAD`
3. `POTENCIA`
4. `WIFI`
5. `MOVIMIENTO`
6. `FIREBASE`

Estados en vivo (sobrescriben placeholders SquareLine):

| Estado | Color aprox. | Significado típico |
|--------|--------------|-------------------|
| `ENCENDIDO` | `#2EAF4A` | Canal OK / activo |
| `APAGADO` | `#D83A3A` | Deshabilitado o sin configurar |
| `FALLA` | `#E68A00` | Debería funcionar y no responde |

### 3.4 CONFIGURACIONES — sensores y registro

**Propósito:** encender sensores y decidir si se guardan datos.

Cuatro filas (textos SquareLine):

- `GUARDAR DATOS DE HUMEDAD`
- `GUARDAR DATOS DE TEMPERATURA`
- `GUARDAR DATOS DE POTENCIA`
- `GUARDAR DATOS DE MOVIMIENTO`

Por canal hay **dos switches**:

| Switch | Rol |
|--------|-----|
| Maestro (derecha, Switch5–8) | Habilita el sensor |
| Guardar (izquierda, Switch1–4) | Registra historial |

Arrancan **apagados**. Si el maestro se apaga, el de guardar se fuerza off y se deshabilita.  
Hoy las etiquetas solo hablan de “guardar”; el enable de la derecha no tiene etiqueta propia en SquareLine.

### 3.5 WIFI — red

Título: `CONFIGURACION DE RED`.

| Zona | Contenido |
|------|-----------|
| Izquierda | Estado, red actual, IP |
| Derecha | Seleccionar red, clave, `Conectarse` / `Desconectar` |

Estados de texto: `Conectado`, `Conectando...`, `Selecciona una red`, `Buscando redes`, `Desconectado`.  
La clave se edita con overlay `CLAVE WIFI` (en pantalla se muestra enmascarada).

---

## 4. Overlay de edición

Panel superior + teclado numérico/alfanumérico (reemplaza los teclados SquareLine).

| Campo | Título overlay | Reglas |
|-------|----------------|--------|
| Setpoint | `EDITAR SP (18-35 C)` | 18–35, default 22 |
| Clave WiFi | `CLAVE WIFI` | Se guarda en RAM/NVS al conectar |

---

## 5. Datos que publica y recibe (Firebase)

### Publica en `/avc01` (aprox. cada 10 s)

`heartbeat`, `temperatura`, `humedad`, `potencia`, `movimiento`, `velocidad`, `estado` (`running`/`stopped`), `modo` (`AUTOMATICO`/`MANUAL`), `setpoint`, `wifi/*`, `config/guardar*`, más `historico/{Lun…Dom}/`.

### Lee comandos en `/avc01/comandos` (aprox. cada 2 s)

`estado`, `modo`, `velocidad`, `setpoint`, `config/guardar*`, con `ts` fresco (máx. ~90 s).

---

## 6. Reglas de control (resumen)

1. Sensores apagados → no se leen / no se muestran como activos.
2. Historial horario solo si “guardar” está on (T, H, potencia).
3. AUTO: velocidad por T y H; no usa SP.
4. MANUAL: velocidad por arco o comando remoto.
5. Presencia habilitada: sin movimiento (fuera de retención) la velocidad efectiva es 0.
6. Piloto de operación: si debería haber consumo y el CT no confirma a tiempo → estado de falla (ámbar).

---

## 7. Limitaciones / deuda conocida (para el rediseño)

Documentarlas evita repetir errores en la UI nueva:

1. Texto `STAR` (debería ser START).
2. Consumo a veces se etiqueta `W` aunque el valor interno es porcentaje ADC 0–100.
3. Setpoint visible pero **no** gobierna el modo automático actual.
4. Alertas de movimiento no usan bien “APAGADO” si el sensor está deshabilitado.
5. Etiquetas de Config solo dicen “GUARDAR…”, no “habilitar sensor”.
6. No hay PWM de motor en firmware; la UI no debe inventar hardware inexistente.
7. Clave Firebase compilada en firmware (mejor provisionar fuera del binario).

---

## 8. Archivos clave

| Archivo | Rol |
|---------|-----|
| `DESARROLLO.ino` | Boot, LVGL, lectura táctil |
| `touch.h` | GT911 |
| `app_runtime.cpp` | Sensores, motor, WiFi, Firebase, HOME live |
| `ui_app_logic.cpp` | Monitoreo, config switches |
| `ui_nav.c` | Drawer y gestos |
| `ui_input_overlay.cpp` | Teclado SP / WiFi |
| `ui_HOME.c` … `ui_WIFI.c` | Shell SquareLine |

---

# Prompt para diseñar la nueva pantalla del HMI

Copia y pega el bloque siguiente en tu herramienta de diseño / IA de UI. Está pensado para un **proyecto de grado industrial**: claridad operativa, trazabilidad, estética sobria de panel de máquina, sin “dashboard web” ni moda genérica.

```text
ROL
Eres diseñador de HMI industrial embebido (panel de máquina / SCADA ligero).
Debes rediseñar la interfaz de un módulo regulador de consumo energético
para un proyecto de grado de ingeniería, no una app consumer ni un dashboard web.

CONTEXTO DEL PRODUCTO
- Equipo: ESP32-S3 + pantalla táctil capacitiva 480×272 px (landscape).
- Función: controlar ventilación/motor según temperatura, humedad y presencia;
  registrar historial; conectarse por WiFi; sincronizar con Firebase.
- Usuario: operador técnico / estudiante en planta o laboratorio.
- Idioma UI: español (Colombia), sin emojis, sin anglicismos innecesarios.
- El firmware actual ya tiene 5 pantallas (Inicio, Monitoreo, Alertas,
  Configuraciones, Red). Conserva esas funciones; no inventes módulos
  que el hardware no soporte.

CONSTRAINTS DUROS
1) Lienzo único: 480×272 px. Todo debe caber sin scroll vertical en la
   pantalla principal de cada vista (overlays/teclado sí pueden cubrir).
2) Densidad de panel industrial: tipografía legible a ~40–60 cm;
   contraste alto; áreas táctiles ≥ 40×40 px cuando sea posible.
3) Una composición por pantalla: un propósito, una jerarquía clara.
4) No uses look “IA genérico”: nada de púrpura/indigo glow, cards con
   sombra multilcapa, pills redondeados decorativos, ni layout broadsheet.
5) Paleta sobria de máquina (neutros + 1 acento + semántica):
   - OK / marcha: verde ~#2EAF4A
   - Paro / crítico off: rojo ~#D83A3A o #E24A3B
   - Advertencia / falla: ámbar ~#E68A00
   - Fondo claro industrial (#F3F4F6 / blanco) o, si propones dark panel,
     justificar contraste y mantener semántica de color.
6) Iconografía mínima y funcional (no ilustraciones decorativas).
7) Debe poder implementarse luego en LVGL (widgets: label, btn, arc,
   chart, switch, dropdown, textarea, panel). Evita efectos imposibles.

PANTALLAS A DISEÑAR (mantener funciones actuales)

A) INICIO (operación)
   - Temperatura actual + setpoint editable (18–35 °C).
   - Humedad actual.
   - Bloque operación: consumo, velocidad %, presencia/PIR, piloto de estado.
   - START, STOP, modo AUTOMÁTICO/MANUAL, control de velocidad (solo manual).
   - Reloj, estado WiFi, acceso a menú.
   - Corregir UX actual: el botón debe decir START (hoy dice STAR).
   - Dejar claro visualmente qué es lectura, qué es consigna y qué es mando.

B) MONITOREO
   - Selector Lun–Dom.
   - Gráfica Temp / Humedad / Potencia con leyenda.
   - Valores actuales.
   - Acción “Borrar datos” con confirmación visual (diseña el diálogo).
   - Tooltip o detalle de punto (hora + valores).

C) ALERTAS
   - Seis canales: Temperatura, Humedad, Potencia, WiFi, Movimiento, Firebase.
   - Estados: ENCENDIDO / APAGADO / FALLA con color + texto + indicador.
   - Debe leerse en 1 segundo qué está mal.
   - Sin acciones complejas; es diagnóstico.

D) CONFIGURACIONES
   - Por cada magnitud (Humedad, Temperatura, Potencia, Movimiento):
     (1) habilitar sensor, (2) guardar historial.
   - Etiquetas inequívocas (hoy solo dicen “GUARDAR DATOS DE…”).
   - Jerarquía: sensor off ⇒ registro off.

E) RED / WIFI
   - Estado, SSID, IP.
   - Elegir red, clave, conectar/desconectar.
   - Feedback de “buscando / conectando / conectado / fallido”.

NAVEGACIÓN
- Menú lateral o patrón industrial equivalente (drawer actual OK si se refina).
- Gestos laterales opcionales; no dependas solo de gestos.
- Máximo 1 nivel de overlay (teclado / confirmación).

ENTREGABLES QUE DEBO RECIBIR
1) Wireframes de las 5 pantallas a 480×272 (una vista “en reposo” y, si aplica,
   una vista “con falla” o “manual”).
2) Especificación de componentes LVGL por pantalla (qué widget, qué texto,
   qué color, qué evento).
3) Tokens de diseño: colores, tipografía (tamaños 12/14/16/20/28 aprox.),
   radios, espaciado.
4) HTML/CSS estático a 480×272 por pantalla (sin frameworks), fiel al diseño,
   listo para validar en navegador a escala 1× o 2×.
5) Notas de implementación: qué reutilizar del firmware actual y qué
   corregir (START, etiquetas de config, unidades de consumo, etc.).

CRITERIOS DE CALIDAD (proyecto de grado)
- Claridad operativa > ornamentación.
- Un técnico debe operar START/STOP y leer fallas sin capacitación larga.
- Consistencia entre pantallas (misma barra, mismos estados, misma tipografía).
- Accesibilidad táctil y estados disabled visibles.
- Documenta supuestos; no inventes sensores o pantallas fuera de alcance.

FUERA DE ALCANCE
- App móvil, PWA, voice UI, dark-mode “neon”, marketing landing.
- Nuevos protocolos (Modbus, OPC, etc.) salvo que se marquen como futuro.

SALIDA
Empieza por: (1) mapa de información de cada pantalla, (2) propuesta visual
de INICIO a 480×272, (3) HTML de INICIO. Luego el resto de pantallas.
```

---

## Cómo usar este archivo

1. Léelo como **especificación del sistema actual**.
2. Copia el bloque **Prompt…** a Figma / Cursor / otro diseñador.
3. Valida el HTML resultante a **480×272** antes de pasar a SquareLine/LVGL.
4. Al implementar, conserva la lógica de `app_runtime` salvo correcciones listadas en §7.
