# MODULO REGULADOR DE CONSUMO ENERGETICO

Repositorio del proyecto completo del modulo regulador de consumo energetico.

## Estructura

- `web/`: aplicacion Next.js conectada a Firebase Realtime Database.
- `hmi/`: codigo del HMI para ESP32-S3 con LVGL y Arduino (pantalla JC4827W543).
- `cerebro/`: ESP32 de expansion de pines (radar GPIO 13) enlazado por UART al HMI.
- `firebase-avc01.json`: estructura base de la RTDB para inicializar o inspeccionar Firebase.

## Cerebro (segundo ESP32)

El táctil del HMI usa GT911 en **SDA=8 SCL=4 INT=3 RST=38**. Si el cerebro se cablea a esos pines, el tactil muere.

Enlace correcto (detalle en `cerebro/PINOUT.md`):

| HMI | Cerebro |
|-----|---------|
| TX GPIO **11** | RX GPIO **16** |
| RX GPIO **12** | TX GPIO **17** |
| GND | GND |

Flashea `cerebro/CEREBRO.ino` en el ESP32 de expansion y la rama actual del HMI en la pantalla.

## Web

Ruta: `web/`

Comandos principales:

```powershell
cd web
npx pnpm install
.\node_modules\.bin\next.cmd dev
```

Luego abre:

```text
http://localhost:3000
```

La web lee datos desde `avc01` y escribe comandos en `avc01/comandos`.

## HMI

Ruta: `hmi/`

Archivo principal:

```text
hmi/DESARROLLO.ino
```

Resolucion de pantalla:

```text
480 x 272
```

Tecnologias principales:

- ESP32-S3
- LVGL 8.3.11
- Arduino_GFX
- Firebase Realtime Database

## Firebase

RTDB usada por el proyecto:

```text
https://modulo-regulador-de-consumo-default-rtdb.firebaseio.com
```

Nodos principales:

- `avc01/`: telemetria y estado en tiempo real del HMI
- `avc01/comandos/`: comandos enviados desde la web para que el HMI los lea
- `sensores/`: compatibilidad simple de temperatura y humedad

## Nota

El archivo `firebase-avc01.json` sirve para importar una estructura inicial en Firebase, pero los valores en tiempo real solo cambian cuando el HMI o la web escriben en la base de datos.
