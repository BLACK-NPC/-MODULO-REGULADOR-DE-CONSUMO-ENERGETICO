/*******************************************************************************
 * Enlace UART HMI <-> Cerebro (ESP32 de expansion)
 *
 * IMPORTANTE — no uses estos pines del GT911 para el cerebro:
 *   SDA=8  SCL=4  INT=3  RST=38
 * Si el cerebro se cablea ahi, el tactil deja de funcionar.
 *
 * Cableado por defecto (ver cerebro/PINOUT.md):
 *   HMI TX GPIO11  ->  Cerebro RX GPIO16
 *   HMI RX GPIO12  <-  Cerebro TX GPIO17
 *   GND comun
 ******************************************************************************/

#ifndef HMI_CEREBRO_LINK_H
#define HMI_CEREBRO_LINK_H

#include <Arduino.h>
#include <HardwareSerial.h>

#ifndef CEREBRO_UART_TX
#define CEREBRO_UART_TX 11
#endif
#ifndef CEREBRO_UART_RX
#define CEREBRO_UART_RX 12
#endif
#ifndef CEREBRO_UART_BAUD
#define CEREBRO_UART_BAUD 115200
#endif
#ifndef CEREBRO_LINK_TIMEOUT_MS
#define CEREBRO_LINK_TIMEOUT_MS 1500
#endif

// Evitar colision accidental con el bus del GT911 en tiempo de compilacion.
#if (CEREBRO_UART_TX == 3) || (CEREBRO_UART_TX == 4) || (CEREBRO_UART_TX == 8) || (CEREBRO_UART_TX == 38)
#error "CEREBRO_UART_TX choca con pines del GT911 (3/4/8/38). Elige otros (p.ej. 11)."
#endif
#if (CEREBRO_UART_RX == 3) || (CEREBRO_UART_RX == 4) || (CEREBRO_UART_RX == 8) || (CEREBRO_UART_RX == 38)
#error "CEREBRO_UART_RX choca con pines del GT911 (3/4/8/38). Elige otros (p.ej. 12)."
#endif

struct CerebroLinkState
{
  bool online = false;
  bool motion = false;
  bool relay = false;
  uint32_t lastRxMs = 0;
  uint32_t lastPingMs = 0;
  uint32_t lastStatusMs = 0;
};

static HardwareSerial CerebroSerial(1);
static CerebroLinkState cerebroState;
static String cerebroRxLine;

inline void cerebro_link_init()
{
  CerebroSerial.begin(CEREBRO_UART_BAUD, SERIAL_8N1, CEREBRO_UART_RX, CEREBRO_UART_TX);
  cerebroRxLine.reserve(96);
  Serial.printf(
      "Cerebro link UART TX=%d RX=%d @%lu (NO usar pines touch 8/4/3/38)\n",
      CEREBRO_UART_TX, CEREBRO_UART_RX, static_cast<unsigned long>(CEREBRO_UART_BAUD));
}

inline bool cerebro_link_online(uint32_t now = millis())
{
  return cerebroState.lastRxMs != 0 &&
         (now - cerebroState.lastRxMs) <= CEREBRO_LINK_TIMEOUT_MS;
}

inline bool cerebro_link_motion()
{
  return cerebroState.motion;
}

inline void cerebro_link_set_relay(bool on)
{
  CerebroSerial.printf("RELAY,%d\n", on ? 1 : 0);
}

inline void cerebro_link_handle_line(const String &line, uint32_t now)
{
  if (line.length() == 0)
  {
    return;
  }

  cerebroState.lastRxMs = now;
  cerebroState.online = true;

  if (line.startsWith("ST,"))
  {
    // ST,m=1,relay=0,ms=12345
    int mPos = line.indexOf("m=");
    int rPos = line.indexOf("relay=");
    if (mPos >= 0)
    {
      cerebroState.motion = line.substring(mPos + 2).toInt() != 0;
    }
    if (rPos >= 0)
    {
      cerebroState.relay = line.substring(rPos + 6).toInt() != 0;
    }
    cerebroState.lastStatusMs = now;
    return;
  }

  if (line.startsWith("PONG"))
  {
    return;
  }

  if (line.startsWith("ACK,") || line.startsWith("ERR,"))
  {
    Serial.printf("Cerebro: %s\n", line.c_str());
  }
}

inline void cerebro_link_tick(uint32_t now)
{
  while (CerebroSerial.available() > 0)
  {
    const char c = static_cast<char>(CerebroSerial.read());
    if (c == '\n' || c == '\r')
    {
      if (cerebroRxLine.length() > 0)
      {
        cerebro_link_handle_line(cerebroRxLine, now);
        cerebroRxLine = "";
      }
    }
    else if (cerebroRxLine.length() < 96)
    {
      cerebroRxLine += c;
    }
    else
    {
      cerebroRxLine = "";
    }
  }

  const bool online = cerebro_link_online(now);
  if (cerebroState.online != online)
  {
    cerebroState.online = online;
    Serial.println(online ? "Cerebro: enlace OK" : "Cerebro: enlace perdido");
  }

  if ((now - cerebroState.lastPingMs) >= 2000)
  {
    cerebroState.lastPingMs = now;
    CerebroSerial.print("PING\n");
  }
}

#endif
