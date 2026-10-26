# Cableado HMI (pantalla) ↔ Cerebro (ESP32 de expansión)

## Por qué el táctil se muere al conectar el cerebro

El GT911 de la JC4827W543 usa **I2C exclusivo**:

| Señal táctil | GPIO HMI | ¿Se puede usar para el cerebro? |
|--------------|----------|----------------------------------|
| SDA          | **8**    | **NO**                           |
| SCL          | **4**    | **NO**                           |
| INT          | **3**    | **NO**                           |
| RST          | **38**   | **NO**                           |

Si el segundo ESP32 se engancha a esos pines (o a un bus I2C compartido con el GT911), el táctil deja de responder. El enlace correcto es **UART + GND**, no I2C del touch.

## Enlace UART (este repo)

| Señal              | HMI (JC4827W543 / ESP32-S3) | Cerebro (ESP32 DevKit) |
|--------------------|-----------------------------|-------------------------|
| TX → RX            | GPIO **11** (TX)            | GPIO **16** (RX)        |
| RX ← TX            | GPIO **12** (RX)            | GPIO **17** (TX)        |
| GND                | GND                         | GND                     |
| 5V / 3V3 (opcional)| Alimentación estable        | Alimentación estable    |

Cruzar TX↔RX. **GND común obligatorio.**

No uses en el HMI para este enlace: 3, 4, 8, 38 (touch), 45/47/21/48/40/39 (QSPI LCD), 1 (backlight), 5/15/16/17 (sensores locales actuales).

## Sensores en el cerebro

| Función                         | GPIO cerebro |
|---------------------------------|--------------|
| Radar / presencia (HLK / PIR)   | **13**       |
| Salida relay auxiliar (opcional)| **25**       |
| LED estado enlace (opcional)    | **2**        |

## Prueba rápida de interferencia

1. Desconecta el cerebro → si el táctil vuelve, el cableado estaba mal.
2. Conecta solo **GND + TX/RX en 11/12** (HMI) ↔ **16/17** (cerebro).
3. No conectes NADA a 3, 4, 8 ni 38 desde el cerebro.
4. En Serial del HMI debe aparecer `Cerebro: enlace OK`.
