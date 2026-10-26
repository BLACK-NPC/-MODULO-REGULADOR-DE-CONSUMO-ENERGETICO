#include <Arduino_GFX_Library.h>
#include <lvgl.h>

#include "touch.h"
#include "ui.h"
#include "ui_app_logic.h"
#include "ui_input_overlay.h"
#include "ui_nav.h"
#include "app_runtime.h"

#define GFX_BL 1

Arduino_DataBus *bus = new Arduino_ESP32QSPI(
    45 /* cs */, 47 /* sck */, 21 /* d0 */, 48 /* d1 */, 40 /* d2 */, 39 /* d3 */);
Arduino_GFX *g = new Arduino_NV3041A(bus, GFX_NOT_DEFINED /* RST */, 0 /* rotation */, true /* IPS */);
Arduino_GFX *gfx = new Arduino_Canvas(480 /* width */, 272 /* height */, g);
#define CANVAS

static uint32_t screenWidth;
static uint32_t screenHeight;
static uint32_t bufSize;
static lv_disp_draw_buf_t draw_buf;
static lv_color_t *disp_draw_buf;
static lv_disp_drv_t disp_drv;

void my_disp_flush(lv_disp_drv_t *disp, const lv_area_t *area, lv_color_t *color_p)
{
  uint32_t w = (area->x2 - area->x1 + 1);
  uint32_t h = (area->y2 - area->y1 + 1);

#if (LV_COLOR_16_SWAP != 0)
  gfx->draw16bitBeRGBBitmap(area->x1, area->y1, (uint16_t *)&color_p->full, w, h);
#else
  gfx->draw16bitRGBBitmap(area->x1, area->y1, (uint16_t *)&color_p->full, w, h);
#endif

  lv_disp_flush_ready(disp);
}

void my_touchpad_read(lv_indev_drv_t *indev_driver, lv_indev_data_t *data)
{
  (void)indev_driver;

  // Respuesta al primer toque (sin esperar 2 muestras).
  // Solo suaviza un poco el arrastre y descarta un salto enorme aislado.
  // El INT del GT911 NO se usa como candado: se consulta siempre por I2C.
  static bool touch_is_pressed = false;
  static uint32_t last_valid_touch_ms = 0;
  static float filtered_x = 0.0f;
  static float filtered_y = 0.0f;

  constexpr int16_t TOUCH_NOISE_JUMP_PX = 200;
  constexpr int16_t TOUCH_EDGE_MARGIN_PX = 1;
  constexpr uint32_t TOUCH_RELEASE_GRACE_MS = 40;
  constexpr float TOUCH_FILTER_ALPHA = 0.75f;

  uint32_t now = millis();

  if (touch_touched())
  {
    const float sample_x = static_cast<float>(constrain(
        touch_last_x, TOUCH_EDGE_MARGIN_PX,
        static_cast<int16_t>(screenWidth - 1 - TOUCH_EDGE_MARGIN_PX)));
    const float sample_y = static_cast<float>(constrain(
        touch_last_y, TOUCH_EDGE_MARGIN_PX,
        static_cast<int16_t>(screenHeight - 1 - TOUCH_EDGE_MARGIN_PX)));

    if (!touch_is_pressed)
    {
      // Un solo toque = press inmediato.
      touch_is_pressed = true;
      filtered_x = sample_x;
      filtered_y = sample_y;
    }
    else
    {
      const int16_t delta_x = static_cast<int16_t>(sample_x - filtered_x);
      const int16_t delta_y = static_cast<int16_t>(sample_y - filtered_y);

      if (abs(delta_x) <= TOUCH_NOISE_JUMP_PX && abs(delta_y) <= TOUCH_NOISE_JUMP_PX)
      {
        filtered_x = (TOUCH_FILTER_ALPHA * sample_x) + ((1.0f - TOUCH_FILTER_ALPHA) * filtered_x);
        filtered_y = (TOUCH_FILTER_ALPHA * sample_y) + ((1.0f - TOUCH_FILTER_ALPHA) * filtered_y);
      }
      // Si el salto es enorme, se ignora esta muestra (posible fantasma).
    }

    last_valid_touch_ms = now;
    data->state = LV_INDEV_STATE_PR;
    data->point.x = static_cast<lv_coord_t>(filtered_x + 0.5f);
    data->point.y = static_cast<lv_coord_t>(filtered_y + 0.5f);
    return;
  }

  if (touch_is_pressed && (now - last_valid_touch_ms) <= TOUCH_RELEASE_GRACE_MS)
  {
    data->state = LV_INDEV_STATE_PR;
    data->point.x = static_cast<lv_coord_t>(filtered_x + 0.5f);
    data->point.y = static_cast<lv_coord_t>(filtered_y + 0.5f);
    return;
  }

  touch_is_pressed = false;
  last_valid_touch_ms = 0;
  data->state = LV_INDEV_STATE_REL;
}

void setup()
{
  Serial.begin(115200);
  Serial.println("Iniciando HMI...");

  if (!gfx->begin())
  {
    Serial.println("Error: gfx->begin() fallo!");
  }

  gfx->fillScreen(BLACK);
  gfx->flush();

  pinMode(GFX_BL, OUTPUT);
  digitalWrite(GFX_BL, HIGH);

  touch_init(gfx->width(), gfx->height(), gfx->getRotation());

  lv_init();

  screenWidth = gfx->width();
  screenHeight = gfx->height();
  bufSize = screenWidth * 40;

  disp_draw_buf = (lv_color_t *)heap_caps_malloc(sizeof(lv_color_t) * bufSize, MALLOC_CAP_INTERNAL | MALLOC_CAP_8BIT);
  if (!disp_draw_buf)
  {
    disp_draw_buf = (lv_color_t *)heap_caps_malloc(sizeof(lv_color_t) * bufSize, MALLOC_CAP_8BIT);
  }

  if (!disp_draw_buf)
  {
    Serial.println("Error: no se pudo reservar memoria para LVGL.");
    return;
  }

  lv_disp_draw_buf_init(&draw_buf, disp_draw_buf, NULL, bufSize);

  lv_disp_drv_init(&disp_drv);
  disp_drv.hor_res = screenWidth;
  disp_drv.ver_res = screenHeight;
  disp_drv.flush_cb = my_disp_flush;
  disp_drv.draw_buf = &draw_buf;
  lv_disp_drv_register(&disp_drv);

  static lv_indev_drv_t indev_drv;
  lv_indev_drv_init(&indev_drv);
  indev_drv.type = LV_INDEV_TYPE_POINTER;
  indev_drv.read_cb = my_touchpad_read;
  lv_indev_drv_register(&indev_drv);

  ui_init();
  ui_input_overlay_init();
  ui_register_navigation_callbacks();
  ui_app_logic_init();
  app_runtime_init();

  Serial.println("HMI lista.");
}

void loop()
{
  app_runtime_tick();
  ui_app_logic_tick();
  ui_input_overlay_tick();
  lv_timer_handler();
#ifdef CANVAS
  gfx->flush();
#endif
  delay(2);
}
