/*******************************************************************************
 * Cerebro — ESP32 de expansión de pines para el HMI JC4827W543
 *
 * Habla por UART con la pantalla (no uses el I2C del GT911).
 * Ver PINOUT.md
 *
 * Placa tipica: ESP32 DevKit (no la pantalla).
 ******************************************************************************/

// UART hacia el HMI (cruzar con HMI TX=11 / RX=12)
constexpr int CEREBRO_LINK_RX = 16; // recibe del HMI TX
constexpr int CEREBRO_LINK_TX = 17; // envia al HMI RX
constexpr uint32_t CEREBRO_BAUD = 115200;

// Radar / presencia (documento de producto: cerebro GPIO 13)
constexpr int RADAR_PIN = 13;
constexpr int RELAY_PIN = 25;
constexpr int LINK_LED_PIN = 2;

constexpr uint32_t STATUS_INTERVAL_MS = 200;
constexpr uint32_t MOTION_HOLD_MS = 1500;

HardwareSerial &Link = Serial2;

bool motionLatched = false;
uint32_t motionUntilMs = 0;
bool relayOn = false;
uint32_t lastStatusMs = 0;
String rxLine;

void sendStatus(uint32_t now)
{
  const bool motionNow = digitalRead(RADAR_PIN) == HIGH;
  if (motionNow)
  {
    motionLatched = true;
    motionUntilMs = now + MOTION_HOLD_MS;
  }
  else if (motionLatched && (int32_t)(now - motionUntilMs) >= 0)
  {
    motionLatched = false;
  }

  // Protocolo de linea: ST,m=<0|1>,relay=<0|1>,ms=<uptime>
  Link.printf("ST,m=%d,relay=%d,ms=%lu\n",
              motionLatched ? 1 : 0,
              relayOn ? 1 : 0,
              static_cast<unsigned long>(now));
}

void handleCommand(const String &line)
{
  String cmd = line;
  cmd.trim();
  if (cmd.length() == 0)
  {
    return;
  }

  if (cmd.equalsIgnoreCase("PING"))
  {
    Link.printf("PONG,ms=%lu\n", static_cast<unsigned long>(millis()));
    return;
  }

  if (cmd.startsWith("RELAY,"))
  {
    const int value = cmd.substring(6).toInt();
    relayOn = value != 0;
    digitalWrite(RELAY_PIN, relayOn ? HIGH : LOW);
    Link.printf("ACK,relay=%d\n", relayOn ? 1 : 0);
    return;
  }

  Link.printf("ERR,cmd=%s\n", cmd.c_str());
}

void setup()
{
  Serial.begin(115200);
  pinMode(RADAR_PIN, INPUT_PULLDOWN);
  pinMode(RELAY_PIN, OUTPUT);
  digitalWrite(RELAY_PIN, LOW);
  pinMode(LINK_LED_PIN, OUTPUT);
  digitalWrite(LINK_LED_PIN, LOW);

  Link.begin(CEREBRO_BAUD, SERIAL_8N1, CEREBRO_LINK_RX, CEREBRO_LINK_TX);
  Serial.println("Cerebro listo. UART HMI en RX=16 TX=17. Radar=GPIO13.");
  Serial.println("NO conectar este ESP32 a SDA/SCL/INT/RST del tactil (8/4/3/38).");
}

void loop()
{
  const uint32_t now = millis();

  while (Link.available() > 0)
  {
    const char c = static_cast<char>(Link.read());
    if (c == '\n' || c == '\r')
    {
      if (rxLine.length() > 0)
      {
        handleCommand(rxLine);
        rxLine = "";
      }
    }
    else if (rxLine.length() < 96)
    {
      rxLine += c;
    }
    else
    {
      rxLine = "";
    }
  }

  if ((now - lastStatusMs) >= STATUS_INTERVAL_MS)
  {
    lastStatusMs = now;
    sendStatus(now);
    digitalWrite(LINK_LED_PIN, motionLatched ? HIGH : LOW);
  }
}
