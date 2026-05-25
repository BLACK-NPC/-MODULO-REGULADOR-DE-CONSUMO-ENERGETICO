#ifndef APP_RUNTIME_H
#define APP_RUNTIME_H

#include <lvgl.h>
#include <stddef.h>
#include <stdint.h>

enum AppSensorChannel : uint8_t
{
    APP_SENSOR_HUMIDITY = 0,
    APP_SENSOR_TEMPERATURE,
    APP_SENSOR_POWER,
    APP_SENSOR_MOTION,
    APP_SENSOR_COUNT
};

#define APP_HISTORY_POINT_COUNT 24

void app_runtime_init();
void app_runtime_tick();
void app_runtime_request_refresh();

bool app_runtime_is_sensor_enabled(AppSensorChannel channel);
void app_runtime_set_sensor_enabled(AppSensorChannel channel, bool enabled);

bool app_runtime_is_logging_enabled(AppSensorChannel channel);
void app_runtime_set_logging_enabled(AppSensorChannel channel, bool enabled);

bool app_runtime_is_firebase_enabled();
void app_runtime_set_firebase_enabled(bool enabled);
bool app_runtime_is_firebase_connected();

bool app_runtime_has_temperature();
bool app_runtime_has_humidity();
bool app_runtime_has_power();
float app_runtime_get_temperature();
float app_runtime_get_humidity();
int app_runtime_get_power_average();
int app_runtime_get_power_percent();

bool app_runtime_is_wifi_connected();
const char *app_runtime_get_wifi_status_text();
const char *app_runtime_get_wifi_ssid_text();
const char *app_runtime_get_wifi_ip_text();
const char *app_runtime_get_wifi_ssid_raw();
const char *app_runtime_get_wifi_ip_raw();

bool app_runtime_is_motor_running();
const char *app_runtime_get_motor_mode_text();
const char *app_runtime_get_motor_status_text();
int app_runtime_get_motor_speed_percent();
int app_runtime_get_setpoint();
bool app_runtime_is_motion_active();

void app_runtime_clear_weekly_history();
uint8_t app_runtime_get_current_weekday_index();
void app_runtime_copy_weekday_history(uint8_t weekdayIndex,
                                      lv_coord_t *temperature,
                                      lv_coord_t *humidity,
                                      lv_coord_t *power,
                                      uint8_t pointCount);

void app_runtime_request_wifi_scan();
const char *app_runtime_get_wifi_options();
uint16_t app_runtime_get_wifi_network_count();
bool app_runtime_connect_wifi(uint16_t optionIndex, const char *password);
void app_runtime_disconnect_wifi();

#endif
