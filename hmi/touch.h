/*******************************************************************************
 * Touch — GT911 en JC4827W543 / Guition (SDA=8, SCL=4, INT=3, RST=38)
 * TouchLib: https://github.com/mmMicky/TouchLib.git
 *
 * Notas de la placa:
 * - Direccion I2C: 0x5D si INT=LOW al soltar RST; 0x14 si INT=HIGH.
 * - INT NO se usa como IRQ ni como candado de lectura (solo polling I2C).
 * - GPIO3 es strapping en ESP32-S3: solo se maneja en el reset, luego INPUT.
 * - Guition/ESPHome: mirror_x + mirror_y respecto al framebuffer LVGL.
 * - TouchLib::init() con rst=-1 siempre devuelve false (bug de la lib); no usarlo
 *   como criterio de fallo. Se valida con probe I2C + primera lectura.
 ******************************************************************************/

#define TOUCH_MODULES_GT911
#define TOUCH_MODULE_ADDR GT911_SLAVE_ADDRESS1
#define TOUCH_SCL 4
#define TOUCH_SDA 8
#define TOUCH_RES 38
#define TOUCH_INT 3

// Guition JC4827: coordenadas del GT911 vienen espejadas vs LVGL.
#ifndef TOUCH_MIRROR_X
#define TOUCH_MIRROR_X 1
#endif
#ifndef TOUCH_MIRROR_Y
#define TOUCH_MIRROR_Y 1
#endif

// 1 = imprime raw/mapped y probe por Serial (util para calibrar).
#ifndef TOUCH_DEBUG
#define TOUCH_DEBUG 0
#endif

bool touch_swap_xy = false;
int16_t touch_map_x1 = -1;
int16_t touch_map_x2 = -1;
int16_t touch_map_y1 = -1;
int16_t touch_map_y2 = -1;

int16_t touch_max_x = 0, touch_max_y = 0;
int16_t touch_raw_x = 0, touch_raw_y = 0;
int16_t touch_last_x = 0, touch_last_y = 0;
uint32_t touch_last_activity_ms = 0;

#include <Wire.h>
#include <TouchLib.h>

// Dos instancias: elegimos la que responde tras el reset con INT=LOW (0x5D).
static TouchLib touch_5d(Wire, TOUCH_SDA, TOUCH_SCL, GT911_SLAVE_ADDRESS1);
static TouchLib touch_14(Wire, TOUCH_SDA, TOUCH_SCL, GT911_SLAVE_ADDRESS2);
static TouchLib *touch = &touch_5d;
static uint8_t touch_active_addr = GT911_SLAVE_ADDRESS1;

static void touch_apply_default_map(uint8_t rotation)
{
  const bool mirrorX = (TOUCH_MIRROR_X != 0);
  const bool mirrorY = (TOUCH_MIRROR_Y != 0);

  switch (rotation)
  {
  case 3:
    touch_swap_xy = true;
    touch_map_x1 = mirrorX ? 0 : touch_max_x;
    touch_map_x2 = mirrorX ? touch_max_x : 0;
    touch_map_y1 = mirrorY ? touch_max_y : 0;
    touch_map_y2 = mirrorY ? 0 : touch_max_y;
    break;
  case 2:
    touch_swap_xy = false;
    touch_map_x1 = mirrorX ? 0 : touch_max_x;
    touch_map_x2 = mirrorX ? touch_max_x : 0;
    touch_map_y1 = mirrorY ? 0 : touch_max_y;
    touch_map_y2 = mirrorY ? touch_max_y : 0;
    break;
  case 1:
    touch_swap_xy = true;
    touch_map_x1 = mirrorX ? touch_max_x : 0;
    touch_map_x2 = mirrorX ? 0 : touch_max_x;
    touch_map_y1 = mirrorY ? 0 : touch_max_y;
    touch_map_y2 = mirrorY ? touch_max_y : 0;
    break;
  default:
    // rotation 0 + mirror X/Y (caso JC4827 en landscape nativo).
    touch_swap_xy = false;
    touch_map_x1 = mirrorX ? touch_max_x : 0;
    touch_map_x2 = mirrorX ? 0 : touch_max_x;
    touch_map_y1 = mirrorY ? touch_max_y : 0;
    touch_map_y2 = mirrorY ? 0 : touch_max_y;
    break;
  }
}

static bool touch_probe_addr(uint8_t addr7)
{
  Wire.beginTransmission(addr7);
  return Wire.endTransmission() == 0;
}

static void touch_gt911_reset_select_addr(bool want_0x5d)
{
  // Secuencia tipo Linux/goodix: INT fija la direccion al soltar RST.
  pinMode(TOUCH_RES, OUTPUT);
  pinMode(TOUCH_INT, OUTPUT);

  digitalWrite(TOUCH_RES, LOW);
  digitalWrite(TOUCH_INT, want_0x5d ? LOW : HIGH);
  delay(20);
  delayMicroseconds(200);
  digitalWrite(TOUCH_RES, HIGH);
  delay(10);

  // Mantener INT en el nivel elegido un momento, luego liberar (flotante).
  digitalWrite(TOUCH_INT, LOW);
  delay(50);
  pinMode(TOUCH_INT, INPUT);
  delay(50);
}

static bool touch_read_chip_resolution(uint16_t &xMax, uint16_t &yMax)
{
  // GT911 config: X max @ 0x8048, Y max @ 0x804A (little-endian).
  uint8_t buf[4] = {0};
  Wire.beginTransmission(touch_active_addr);
  Wire.write(0x80);
  Wire.write(0x48);
  if (Wire.endTransmission(false) != 0)
  {
    return false;
  }
  if (Wire.requestFrom(static_cast<int>(touch_active_addr), 4) != 4)
  {
    return false;
  }
  for (int i = 0; i < 4; ++i)
  {
    buf[i] = static_cast<uint8_t>(Wire.read());
  }

  xMax = static_cast<uint16_t>(buf[0] | (buf[1] << 8));
  yMax = static_cast<uint16_t>(buf[2] | (buf[3] << 8));
  return xMax >= 100 && xMax <= 2000 && yMax >= 100 && yMax <= 2000;
}

static void touch_apply_chip_resolution_if_needed()
{
  uint16_t chipX = 0;
  uint16_t chipY = 0;
  if (!touch_read_chip_resolution(chipX, chipY))
  {
    Serial.println("Touch: no se pudo leer resolucion del GT911; se usa 480x272.");
    return;
  }

  Serial.printf("Touch: resolucion GT911 reportada %ux%u (panel %dx%d)\n",
                chipX, chipY, touch_max_x + 1, touch_max_y + 1);

  // Si el chip esta calibrado a otro tamano, mapear desde ese rango.
  // Conservamos espejo/rotacion ya aplicados en touch_map_* extremos.
  const bool invertX = (touch_map_x1 > touch_map_x2);
  const bool invertY = (touch_map_y1 > touch_map_y2);

  if (!touch_swap_xy)
  {
    touch_map_x1 = invertX ? static_cast<int16_t>(chipX - 1) : 0;
    touch_map_x2 = invertX ? 0 : static_cast<int16_t>(chipX - 1);
    touch_map_y1 = invertY ? static_cast<int16_t>(chipY - 1) : 0;
    touch_map_y2 = invertY ? 0 : static_cast<int16_t>(chipY - 1);
  }
  else
  {
    // Con swap, X del panel sale de raw Y y viceversa.
    touch_map_x1 = invertX ? static_cast<int16_t>(chipY - 1) : 0;
    touch_map_x2 = invertX ? 0 : static_cast<int16_t>(chipY - 1);
    touch_map_y1 = invertY ? static_cast<int16_t>(chipX - 1) : 0;
    touch_map_y2 = invertY ? 0 : static_cast<int16_t>(chipX - 1);
  }
}

void touch_init(int16_t w, int16_t h, uint8_t r)
{
  touch_max_x = w - 1;
  touch_max_y = h - 1;

  if (touch_map_x1 == -1)
  {
    touch_apply_default_map(r);
  }

  // 1) Reset forzando 0x5D (INT=LOW).
  touch_gt911_reset_select_addr(true);

  Wire.begin(TOUCH_SDA, TOUCH_SCL);
  Wire.setClock(100000);

  bool found5d = touch_probe_addr(0x5D);
  bool found14 = touch_probe_addr(0x14);
  Serial.printf("Touch GT911 probe tras reset 0x5D: 0x5D=%s 0x14=%s\n",
                found5d ? "OK" : "no",
                found14 ? "OK" : "no");

  // 2) Si solo responde 0x14, reintentar seleccionando esa direccion.
  if (!found5d && found14)
  {
    Serial.println("Touch: solo 0x14 responde; reinicio seleccionando ADDRESS2.");
    touch_gt911_reset_select_addr(false);
    Wire.begin(TOUCH_SDA, TOUCH_SCL);
    Wire.setClock(100000);
    found5d = touch_probe_addr(0x5D);
    found14 = touch_probe_addr(0x14);
    Serial.printf("Touch GT911 probe tras reset 0x14: 0x5D=%s 0x14=%s\n",
                  found5d ? "OK" : "no",
                  found14 ? "OK" : "no");
  }

  if (found5d)
  {
    touch = &touch_5d;
    touch_active_addr = GT911_SLAVE_ADDRESS1;
  }
  else if (found14)
  {
    touch = &touch_14;
    touch_active_addr = GT911_SLAVE_ADDRESS2;
  }
  else
  {
    touch = &touch_5d;
    touch_active_addr = GT911_SLAVE_ADDRESS1;
    Serial.println("Touch: ninguna direccion responde. Revisa SDA=8 SCL=4 RST=38 INT=3.");
  }

  Wire.setClock(400000);

  // TouchLib::init() con rst=-1 hace soft-reset y SIEMPRE retorna false: se ignora.
  (void)touch->init();
  Serial.printf("Touch: usando I2C 0x%02X (polling, sin IRQ). mirrorX=%d mirrorY=%d\n",
                touch_active_addr, TOUCH_MIRROR_X, TOUCH_MIRROR_Y);

  touch_apply_chip_resolution_if_needed();
}

bool touch_has_signal()
{
  // Siempre permitir consulta I2C. El anti-fantasma esta en my_touchpad_read().
  return true;
}

void translate_touch_raw()
{
  if (touch_swap_xy)
  {
    touch_last_x = map(touch_raw_y, touch_map_x1, touch_map_x2, 0, touch_max_x);
    touch_last_y = map(touch_raw_x, touch_map_y1, touch_map_y2, 0, touch_max_y);
  }
  else
  {
    touch_last_x = map(touch_raw_x, touch_map_x1, touch_map_x2, 0, touch_max_x);
    touch_last_y = map(touch_raw_y, touch_map_y1, touch_map_y2, 0, touch_max_y);
  }
}

bool touch_touched()
{
  if (touch == nullptr || !touch->read())
  {
    return false;
  }

  TP_Point t = touch->getPoint(0);
  touch_raw_x = t.x;
  touch_raw_y = t.y;
  translate_touch_raw();
  touch_last_x = constrain(touch_last_x, 0, touch_max_x);
  touch_last_y = constrain(touch_last_y, 0, touch_max_y);
  touch_last_activity_ms = millis();

#if TOUCH_DEBUG
  static uint32_t last_dbg_ms = 0;
  if ((touch_last_activity_ms - last_dbg_ms) >= 200)
  {
    last_dbg_ms = touch_last_activity_ms;
    Serial.printf("Touch raw=(%d,%d) map=(%d,%d)\n",
                  touch_raw_x, touch_raw_y, touch_last_x, touch_last_y);
  }
#endif

  return true;
}

bool touch_released()
{
  return false;
}
