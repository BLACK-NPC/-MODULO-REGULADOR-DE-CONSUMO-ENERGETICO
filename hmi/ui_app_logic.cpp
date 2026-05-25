#include "ui_app_logic.h"

#include <Arduino.h>
#include <stdint.h>
#include <string.h>

#include "app_runtime.h"
#include "ui.h"
#include "ui_input_overlay.h"

namespace
{
constexpr const char *MONITOR_DAY_NAMES[7] = {
    "Lun",
    "Mar",
    "Mie",
    "Jue",
    "Vie",
    "Sab",
    "Dom",
};
constexpr uint32_t MONITOR_LIVE_SAMPLE_INTERVAL_MS = 500;

char lastWifiOptions[768] = "";
char selectedWifiName[96] = "Conectarse a una Red";
lv_obj_t *wifiSelectedNetworkLabel = nullptr;
lv_chart_series_t *monitorTemperatureSeries = nullptr;
lv_chart_series_t *monitorHumiditySeries = nullptr;
lv_chart_series_t *monitorPowerSeries = nullptr;
lv_coord_t monitorTemperaturePoints[APP_HISTORY_POINT_COUNT];
lv_coord_t monitorHumidityPoints[APP_HISTORY_POINT_COUNT];
lv_coord_t monitorPowerPoints[APP_HISTORY_POINT_COUNT];
lv_coord_t liveTemperaturePoints[APP_HISTORY_POINT_COUNT];
lv_coord_t liveHumidityPoints[APP_HISTORY_POINT_COUNT];
lv_coord_t livePowerPoints[APP_HISTORY_POINT_COUNT];
lv_obj_t *monitorDayButtons[7] = {};
lv_obj_t *monitorDayLabels[7] = {};
lv_obj_t *monitorDeleteHitbox = nullptr;
lv_obj_t *monitorPowerCard = nullptr;
lv_obj_t *monitorTemperatureCard = nullptr;
lv_obj_t *monitorHumidityCard = nullptr;
lv_obj_t *monitorPowerCardTitle = nullptr;
lv_obj_t *monitorTemperatureCardTitle = nullptr;
lv_obj_t *monitorHumidityCardTitle = nullptr;
lv_obj_t *monitorPowerCardLabel = nullptr;
lv_obj_t *monitorPowerCardLabelBold = nullptr;
lv_obj_t *monitorTemperatureCardLabel = nullptr;
lv_obj_t *monitorHumidityCardLabel = nullptr;
lv_obj_t *monitorTooltipScrim = nullptr;
lv_obj_t *monitorTooltipPanel = nullptr;
lv_obj_t *monitorTooltipTitle = nullptr;
lv_obj_t *monitorTooltipPower = nullptr;
lv_obj_t *monitorTooltipTemperature = nullptr;
lv_obj_t *monitorTooltipHumidity = nullptr;
uint8_t selectedMonitorDay = 0;
uint8_t currentMonitorDay = 0;
uint32_t lastLiveSampleMs = 0;
bool liveMonitorPointsReady = false;

struct ConfigBinding
{
    AppSensorChannel channel;
    lv_obj_t *saveSwitch;
    lv_obj_t *masterSwitch;
    lv_obj_t *label;
};

ConfigBinding bindings[APP_SENSOR_COUNT];

void setSwitchChecked(lv_obj_t *sw, bool checked)
{
    if (sw == nullptr)
    {
        return;
    }

    if (checked)
    {
        lv_obj_add_state(sw, LV_STATE_CHECKED);
    }
    else
    {
        lv_obj_clear_state(sw, LV_STATE_CHECKED);
    }
}

void setObjectHidden(lv_obj_t *object, bool hidden)
{
    if (object == nullptr)
    {
        return;
    }

    if (hidden)
    {
        lv_obj_add_flag(object, LV_OBJ_FLAG_HIDDEN);
    }
    else
    {
        lv_obj_clear_flag(object, LV_OBJ_FLAG_HIDDEN);
    }
}

void setLabelTextIfChanged(lv_obj_t *label, const char *text)
{
    if (label == nullptr || text == nullptr)
    {
        return;
    }

    const char *currentText = lv_label_get_text(label);
    if (currentText != nullptr && strcmp(currentText, text) == 0)
    {
        return;
    }

    lv_label_set_text(label, text);
}

void syncSelectedWifiLabel()
{
    setLabelTextIfChanged(ui_Label30, "Conectarse a una Red");
    if (ui_Dropdown2 != nullptr)
    {
        lv_dropdown_set_text(ui_Dropdown2, "Seleccionar Red");
    }
    setLabelTextIfChanged(wifiSelectedNetworkLabel, selectedWifiName);
}

void clearChartPoints(lv_coord_t *points)
{
    if (points == nullptr)
    {
        return;
    }

    for (uint8_t index = 0; index < APP_HISTORY_POINT_COUNT; ++index)
    {
        points[index] = LV_CHART_POINT_NONE;
    }
}

void clearLiveMonitorPoints()
{
    clearChartPoints(liveTemperaturePoints);
    clearChartPoints(liveHumidityPoints);
    clearChartPoints(livePowerPoints);
    lastLiveSampleMs = 0;
    liveMonitorPointsReady = true;
}

void appendChartPoint(lv_coord_t *points, lv_coord_t value)
{
    if (points == nullptr)
    {
        return;
    }

    for (uint8_t index = 1; index < APP_HISTORY_POINT_COUNT; ++index)
    {
        points[index - 1] = points[index];
    }
    points[APP_HISTORY_POINT_COUNT - 1] = value;
}

lv_coord_t liveSensorValue(AppSensorChannel channel)
{
    switch (channel)
    {
    case APP_SENSOR_TEMPERATURE:
        return app_runtime_has_temperature()
                   ? static_cast<lv_coord_t>(app_runtime_get_temperature() + 0.5f)
                   : LV_CHART_POINT_NONE;
    case APP_SENSOR_HUMIDITY:
        return app_runtime_has_humidity()
                   ? static_cast<lv_coord_t>(app_runtime_get_humidity() + 0.5f)
                   : LV_CHART_POINT_NONE;
    case APP_SENSOR_POWER:
        return app_runtime_has_power()
                   ? static_cast<lv_coord_t>(app_runtime_get_power_percent())
                   : LV_CHART_POINT_NONE;
    default:
        return LV_CHART_POINT_NONE;
    }
}

void appendLiveMonitorSample(uint32_t now)
{
    if (!liveMonitorPointsReady)
    {
        clearLiveMonitorPoints();
    }

    if (lastLiveSampleMs != 0 && (now - lastLiveSampleMs) < MONITOR_LIVE_SAMPLE_INTERVAL_MS)
    {
        return;
    }

    lastLiveSampleMs = now;
    appendChartPoint(liveTemperaturePoints, liveSensorValue(APP_SENSOR_TEMPERATURE));
    appendChartPoint(liveHumidityPoints, liveSensorValue(APP_SENSOR_HUMIDITY));
    appendChartPoint(livePowerPoints, liveSensorValue(APP_SENSOR_POWER));
}

bool isMonitorScreenActive()
{
    return lv_scr_act() == ui_MONITOREO_;
}

const lv_coord_t *monitorSeriesPoints(AppSensorChannel channel)
{
    switch (channel)
    {
    case APP_SENSOR_TEMPERATURE:
        return monitorTemperaturePoints;
    case APP_SENSOR_HUMIDITY:
        return monitorHumidityPoints;
    case APP_SENSOR_POWER:
        return monitorPowerPoints;
    default:
        return nullptr;
    }
}

lv_chart_series_t *monitorSeriesHandle(AppSensorChannel channel)
{
    switch (channel)
    {
    case APP_SENSOR_TEMPERATURE:
        return monitorTemperatureSeries;
    case APP_SENSOR_HUMIDITY:
        return monitorHumiditySeries;
    case APP_SENSOR_POWER:
        return monitorPowerSeries;
    default:
        return nullptr;
    }
}

bool monitorPointHasValue(AppSensorChannel channel, uint16_t pointIndex)
{
    const lv_coord_t *points = monitorSeriesPoints(channel);
    return points != nullptr && pointIndex < APP_HISTORY_POINT_COUNT && points[pointIndex] != LV_CHART_POINT_NONE;
}

void hideMonitorTooltip()
{
    setObjectHidden(monitorTooltipPanel, true);
}

void formatMonitorValueText(char *buffer, size_t bufferSize, bool hasValue, float value, const char *unit)
{
    if (!hasValue)
    {
        snprintf(buffer, bufferSize, "--");
        return;
    }

    snprintf(buffer, bufferSize, "%.1f %s", value, unit);
}

void formatMonitorValueText(char *buffer, size_t bufferSize, bool hasValue, int value, const char *unit)
{
    if (!hasValue)
    {
        snprintf(buffer, bufferSize, "--");
        return;
    }

    snprintf(buffer, bufferSize, "%d %s", value, unit);
}

void formatMonitorCardText(char *buffer, size_t bufferSize, const char *prefix,
                           bool hasValue, float value, const char *unit)
{
    if (!hasValue)
    {
        snprintf(buffer, bufferSize, "%s: --", prefix);
        return;
    }

    snprintf(buffer, bufferSize, "%s: %.1f %s", prefix, value, unit);
}

void formatMonitorCardText(char *buffer, size_t bufferSize, const char *prefix,
                           bool hasValue, int value, const char *unit)
{
    if (!hasValue)
    {
        snprintf(buffer, bufferSize, "%s: --", prefix);
        return;
    }

    snprintf(buffer, bufferSize, "%s: %d %s", prefix, value, unit);
}

void formatTooltipLine(char *buffer, size_t bufferSize, const char *label, lv_coord_t value, const char *unit)
{
    if (value == LV_CHART_POINT_NONE)
    {
        snprintf(buffer, bufferSize, "%s: --", label);
        return;
    }

    snprintf(buffer, bufferSize, "%s: %d %s", label, static_cast<int>(value), unit);
}

void refreshMonitorLegend()
{
    setObjectHidden(ui_Panel19, !app_runtime_is_sensor_enabled(APP_SENSOR_TEMPERATURE));
    setObjectHidden(ui_Label33, !app_runtime_is_sensor_enabled(APP_SENSOR_TEMPERATURE));
    setObjectHidden(ui_Panel20, !app_runtime_is_sensor_enabled(APP_SENSOR_HUMIDITY));
    setObjectHidden(ui_Label34, !app_runtime_is_sensor_enabled(APP_SENSOR_HUMIDITY));
    setObjectHidden(ui_Panel18, !app_runtime_is_sensor_enabled(APP_SENSOR_POWER));
    setObjectHidden(ui_Label32, !app_runtime_is_sensor_enabled(APP_SENSOR_POWER));
}

void refreshMonitorCards()
{
    char buffer[48];

    formatMonitorCardText(buffer, sizeof(buffer), "Pot", app_runtime_has_power(),
                          app_runtime_get_power_percent(), "%");
    setLabelTextIfChanged(monitorPowerCardLabel, buffer);
    setLabelTextIfChanged(monitorPowerCardLabelBold, buffer);

    formatMonitorCardText(buffer, sizeof(buffer), "Temp", app_runtime_has_temperature(),
                          app_runtime_get_temperature(), "C");
    setLabelTextIfChanged(monitorTemperatureCardLabel, buffer);

    formatMonitorCardText(buffer, sizeof(buffer), "Hum", app_runtime_has_humidity(),
                          app_runtime_get_humidity(), "%");
    setLabelTextIfChanged(monitorHumidityCardLabel, buffer);
}

void applySaveAvailability(ConfigBinding &binding)
{
    bool enabled = lv_obj_has_state(binding.masterSwitch, LV_STATE_CHECKED);
    app_runtime_set_sensor_enabled(binding.channel, enabled);

    if (!enabled)
    {
        lv_obj_clear_state(binding.saveSwitch, LV_STATE_CHECKED);
        app_runtime_set_logging_enabled(binding.channel, false);
        lv_obj_add_state(binding.saveSwitch, LV_STATE_DISABLED);
        lv_obj_set_style_opa(binding.saveSwitch, LV_OPA_40, LV_PART_MAIN | LV_STATE_DEFAULT);
        lv_obj_set_style_text_opa(binding.label, LV_OPA_50, LV_PART_MAIN | LV_STATE_DEFAULT);
        return;
    }

    lv_obj_clear_state(binding.saveSwitch, LV_STATE_DISABLED);
    lv_obj_set_style_opa(binding.saveSwitch, LV_OPA_COVER, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_text_opa(binding.label, LV_OPA_COVER, LV_PART_MAIN | LV_STATE_DEFAULT);
    app_runtime_set_logging_enabled(binding.channel, lv_obj_has_state(binding.saveSwitch, LV_STATE_CHECKED));
}

int32_t highestVisibleValue(const lv_coord_t *points, uint8_t pointCount)
{
    int32_t highest = 0;
    for (uint8_t index = 0; index < pointCount; ++index)
    {
        if (points[index] != LV_CHART_POINT_NONE)
        {
            highest = max(highest, static_cast<int32_t>(points[index]));
        }
    }

    return highest;
}

struct ChartValueRange
{
    bool hasValue = false;
    int32_t minValue = 0;
    int32_t maxValue = 0;
};

void includeVisibleValues(ChartValueRange &range, const lv_coord_t *points, uint8_t pointCount)
{
    if (points == nullptr)
    {
        return;
    }

    for (uint8_t index = 0; index < pointCount; ++index)
    {
        if (points[index] == LV_CHART_POINT_NONE)
        {
            continue;
        }

        int32_t value = static_cast<int32_t>(points[index]);
        if (!range.hasValue)
        {
            range.hasValue = true;
            range.minValue = value;
            range.maxValue = value;
            continue;
        }

        range.minValue = min(range.minValue, value);
        range.maxValue = max(range.maxValue, value);
    }
}

bool hasVisibleValues(const lv_coord_t *points, uint8_t pointCount)
{
    if (points == nullptr)
    {
        return false;
    }

    for (uint8_t index = 0; index < pointCount; ++index)
    {
        if (points[index] != LV_CHART_POINT_NONE)
        {
            return true;
        }
    }

    return false;
}

void applyLiveMonitorRange()
{
    uint8_t visibleSeriesCount = 0;
    visibleSeriesCount += hasVisibleValues(monitorTemperaturePoints, APP_HISTORY_POINT_COUNT) ? 1 : 0;
    visibleSeriesCount += hasVisibleValues(monitorHumidityPoints, APP_HISTORY_POINT_COUNT) ? 1 : 0;
    visibleSeriesCount += hasVisibleValues(monitorPowerPoints, APP_HISTORY_POINT_COUNT) ? 1 : 0;

    if (visibleSeriesCount > 1)
    {
        lv_chart_set_range(ui_Chart2, LV_CHART_AXIS_PRIMARY_Y, 0, 50);
        lv_chart_set_range(ui_Chart2, LV_CHART_AXIS_SECONDARY_Y, 0, 100);
        return;
    }

    ChartValueRange primaryRange;
    ChartValueRange secondaryRange;

    includeVisibleValues(primaryRange, monitorTemperaturePoints, APP_HISTORY_POINT_COUNT);
    includeVisibleValues(secondaryRange, monitorHumidityPoints, APP_HISTORY_POINT_COUNT);
    includeVisibleValues(secondaryRange, monitorPowerPoints, APP_HISTORY_POINT_COUNT);

    if (primaryRange.hasValue)
    {
        int32_t span = max(static_cast<int32_t>(8), primaryRange.maxValue - primaryRange.minValue);
        int32_t padding = max(static_cast<int32_t>(3), span / 3);
        int32_t low = max(static_cast<int32_t>(0), primaryRange.minValue - padding);
        int32_t high = primaryRange.maxValue + padding;
        if ((high - low) < 10)
        {
            high = low + 10;
        }
        lv_chart_set_range(ui_Chart2, LV_CHART_AXIS_PRIMARY_Y, low, high);
    }
    else
    {
        lv_chart_set_range(ui_Chart2, LV_CHART_AXIS_PRIMARY_Y, 0, 50);
    }

    if (secondaryRange.hasValue)
    {
        int32_t span = max(static_cast<int32_t>(20), secondaryRange.maxValue - secondaryRange.minValue);
        int32_t padding = max(static_cast<int32_t>(8), span / 4);
        int32_t low = max(static_cast<int32_t>(0), secondaryRange.minValue - padding);
        int32_t high = min(static_cast<int32_t>(100), secondaryRange.maxValue + padding);
        if ((high - low) < 25)
        {
            high = min(static_cast<int32_t>(100), low + 25);
        }
        lv_chart_set_range(ui_Chart2, LV_CHART_AXIS_SECONDARY_Y, low, high);
    }
    else
    {
        lv_chart_set_range(ui_Chart2, LV_CHART_AXIS_SECONDARY_Y, 0, 100);
    }
}

void applyMonitorDayStyle(uint8_t index, bool selected)
{
    lv_obj_t *button = monitorDayButtons[index];
    lv_obj_t *label = monitorDayLabels[index];
    if (button == nullptr || label == nullptr)
    {
        return;
    }

    lv_obj_set_size(button, 46, 21);
    lv_obj_set_style_radius(button, 9, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_border_width(button, selected ? 0 : 2, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_border_color(button, selected ? lv_color_hex(0x2D8CFF) : lv_color_hex(0xC9CED6),
                                 LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_bg_opa(button, LV_OPA_COVER, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_bg_color(button, selected ? lv_color_hex(0x2D8CFF) : lv_color_hex(0xFFFFFF),
                              LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_shadow_width(button, selected ? 8 : 2, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_shadow_spread(button, 0, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_shadow_opa(button, selected ? LV_OPA_40 : LV_OPA_20, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_shadow_color(button, selected ? lv_color_hex(0x2D8CFF) : lv_color_hex(0xD5DCE5),
                                 LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_text_color(label, selected ? lv_color_hex(0xFFFFFF) : lv_color_hex(0x202020),
                               LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_text_font(label, &lv_font_montserrat_14, LV_PART_MAIN | LV_STATE_DEFAULT);
}

void refreshMonitorDayStyles()
{
    for (uint8_t index = 0; index < 7; ++index)
    {
        applyMonitorDayStyle(index, index == selectedMonitorDay);
    }
}

void refreshMonitorChart()
{
    if (ui_Chart2 == nullptr || !isMonitorScreenActive())
    {
        return;
    }

    bool showingCurrentDay = selectedMonitorDay == currentMonitorDay;
    if (showingCurrentDay)
    {
        appendLiveMonitorSample(millis());
        memcpy(monitorTemperaturePoints, liveTemperaturePoints, sizeof(monitorTemperaturePoints));
        memcpy(monitorHumidityPoints, liveHumidityPoints, sizeof(monitorHumidityPoints));
        memcpy(monitorPowerPoints, livePowerPoints, sizeof(monitorPowerPoints));
    }
    else
    {
        app_runtime_copy_weekday_history(selectedMonitorDay,
                                         monitorTemperaturePoints,
                                         monitorHumidityPoints,
                                         monitorPowerPoints,
                                         APP_HISTORY_POINT_COUNT);
    }

    if (!app_runtime_is_sensor_enabled(APP_SENSOR_TEMPERATURE))
    {
        clearChartPoints(monitorTemperaturePoints);
    }
    if (!app_runtime_is_sensor_enabled(APP_SENSOR_HUMIDITY))
    {
        clearChartPoints(monitorHumidityPoints);
    }
    if (!app_runtime_is_sensor_enabled(APP_SENSOR_POWER))
    {
        clearChartPoints(monitorPowerPoints);
    }

    refreshMonitorLegend();

    if (showingCurrentDay)
    {
        applyLiveMonitorRange();
    }
    else
    {
        int32_t primaryMax = highestVisibleValue(monitorTemperaturePoints, APP_HISTORY_POINT_COUNT);
        int32_t secondaryMax = max(highestVisibleValue(monitorHumidityPoints, APP_HISTORY_POINT_COUNT),
                                   highestVisibleValue(monitorPowerPoints, APP_HISTORY_POINT_COUNT));

        lv_chart_set_range(ui_Chart2, LV_CHART_AXIS_PRIMARY_Y, 0, max(50L, static_cast<long>(primaryMax + 5)));
        lv_chart_set_range(ui_Chart2, LV_CHART_AXIS_SECONDARY_Y, 0, max(100L, static_cast<long>(secondaryMax + 10)));
    }
    lv_chart_refresh(ui_Chart2);
}

void selectMonitorDay(uint8_t weekdayIndex)
{
    if (weekdayIndex >= 7)
    {
        return;
    }

    selectedMonitorDay = weekdayIndex;
    hideMonitorTooltip();
    refreshMonitorDayStyles();
    refreshMonitorChart();
}

void monitorDaySelected(lv_event_t *e)
{
    if (lv_event_get_code(e) != LV_EVENT_CLICKED)
    {
        return;
    }

    uintptr_t rawIndex = reinterpret_cast<uintptr_t>(lv_event_get_user_data(e));
    selectMonitorDay(static_cast<uint8_t>(rawIndex));
}

void monitorDeleteData(lv_event_t *e)
{
    if (lv_event_get_code(e) != LV_EVENT_CLICKED)
    {
        return;
    }

    app_runtime_clear_weekly_history();
    clearLiveMonitorPoints();
    hideMonitorTooltip();
    selectMonitorDay(app_runtime_get_current_weekday_index());
}

void refreshAllClicked(lv_event_t *e)
{
    if (lv_event_get_code(e) != LV_EVENT_CLICKED)
    {
        return;
    }

    app_runtime_request_refresh();
}

void positionMonitorTooltip(uint16_t pointIndex)
{
    lv_chart_series_t *anchorSeries = nullptr;
    if (monitorPointHasValue(APP_SENSOR_TEMPERATURE, pointIndex))
    {
        anchorSeries = monitorSeriesHandle(APP_SENSOR_TEMPERATURE);
    }
    else if (monitorPointHasValue(APP_SENSOR_HUMIDITY, pointIndex))
    {
        anchorSeries = monitorSeriesHandle(APP_SENSOR_HUMIDITY);
    }
    else if (monitorPointHasValue(APP_SENSOR_POWER, pointIndex))
    {
        anchorSeries = monitorSeriesHandle(APP_SENSOR_POWER);
    }

    if (anchorSeries == nullptr)
    {
        return;
    }

    lv_point_t pointPosition;
    lv_chart_get_point_pos_by_id(ui_Chart2, anchorSeries, pointIndex, &pointPosition);

    lv_area_t chartArea;
    lv_obj_get_coords(ui_Chart2, &chartArea);

    lv_coord_t tooltipWidth = lv_obj_get_width(monitorTooltipPanel);
    lv_coord_t tooltipHeight = lv_obj_get_height(monitorTooltipPanel);
    lv_coord_t targetX = chartArea.x1 + pointPosition.x + 10;
    lv_coord_t targetY = chartArea.y1 + pointPosition.y - tooltipHeight - 8;

    if (targetX + tooltipWidth > 472)
    {
        targetX = chartArea.x1 + pointPosition.x - tooltipWidth - 10;
    }
    if (targetX < 8)
    {
        targetX = 8;
    }
    if (targetY < 56)
    {
        targetY = chartArea.y1 + pointPosition.y + 8;
    }
    if (targetY + tooltipHeight > 264)
    {
        targetY = 264 - tooltipHeight;
    }

    lv_obj_set_pos(monitorTooltipPanel, targetX, targetY);
}

void showMonitorTooltip(uint16_t pointIndex)
{
    if (pointIndex >= APP_HISTORY_POINT_COUNT)
    {
        hideMonitorTooltip();
        return;
    }

    if (!monitorPointHasValue(APP_SENSOR_TEMPERATURE, pointIndex) &&
        !monitorPointHasValue(APP_SENSOR_HUMIDITY, pointIndex) &&
        !monitorPointHasValue(APP_SENSOR_POWER, pointIndex))
    {
        hideMonitorTooltip();
        return;
    }

    char lineBuffer[48];
    char titleBuffer[24];

    snprintf(titleBuffer, sizeof(titleBuffer), "%s - %02u:00", MONITOR_DAY_NAMES[selectedMonitorDay], pointIndex);
    setLabelTextIfChanged(monitorTooltipTitle, titleBuffer);

    formatTooltipLine(lineBuffer, sizeof(lineBuffer), "Potencia", monitorPowerPoints[pointIndex], "%");
    setLabelTextIfChanged(monitorTooltipPower, lineBuffer);

    formatTooltipLine(lineBuffer, sizeof(lineBuffer), "Temperatura", monitorTemperaturePoints[pointIndex], "C");
    setLabelTextIfChanged(monitorTooltipTemperature, lineBuffer);

    formatTooltipLine(lineBuffer, sizeof(lineBuffer), "Humedad", monitorHumidityPoints[pointIndex], "%");
    setLabelTextIfChanged(monitorTooltipHumidity, lineBuffer);

    positionMonitorTooltip(pointIndex);
    setObjectHidden(monitorTooltipPanel, false);
    lv_obj_move_foreground(monitorTooltipPanel);
}

void monitorTooltipDismissed(lv_event_t *e)
{
    if (lv_event_get_code(e) != LV_EVENT_PRESSED)
    {
        return;
    }

    hideMonitorTooltip();
}

void monitorChartTouched(lv_event_t *e)
{
    lv_event_code_t code = lv_event_get_code(e);
    if (code == LV_EVENT_RELEASED || code == LV_EVENT_PRESS_LOST)
    {
        hideMonitorTooltip();
        return;
    }

    if (code != LV_EVENT_PRESSING)
    {
        return;
    }

    uint32_t pressedPoint = lv_chart_get_pressed_point(ui_Chart2);
    if (pressedPoint == LV_CHART_POINT_NONE || pressedPoint >= APP_HISTORY_POINT_COUNT)
    {
        hideMonitorTooltip();
        return;
    }

    showMonitorTooltip(static_cast<uint16_t>(pressedPoint));
}

void masterSwitchEvent(lv_event_t *e)
{
    if (lv_event_get_code(e) != LV_EVENT_VALUE_CHANGED)
    {
        return;
    }

    lv_obj_t *target = lv_event_get_target(e);
    for (ConfigBinding &binding : bindings)
    {
        if (binding.masterSwitch == target)
        {
            applySaveAvailability(binding);
            refreshMonitorChart();
            break;
        }
    }
}

void saveSwitchEvent(lv_event_t *e)
{
    if (lv_event_get_code(e) != LV_EVENT_VALUE_CHANGED)
    {
        return;
    }

    lv_obj_t *target = lv_event_get_target(e);
    for (ConfigBinding &binding : bindings)
    {
        if (binding.saveSwitch == target)
        {
            app_runtime_set_logging_enabled(binding.channel, lv_obj_has_state(binding.saveSwitch, LV_STATE_CHECKED));
            break;
        }
    }
}

void wifiConnectEvent(lv_event_t *e)
{
    if (lv_event_get_code(e) != LV_EVENT_CLICKED)
    {
        return;
    }

    if (app_runtime_is_wifi_connected())
    {
        app_runtime_disconnect_wifi();
        return;
    }

    uint16_t selected = lv_dropdown_get_selected(ui_Dropdown2);
    app_runtime_connect_wifi(selected, ui_input_overlay_get_wifi_password());
}

void wifiDropdownEvent(lv_event_t *e)
{
    lv_event_code_t code = lv_event_get_code(e);
    if (code == LV_EVENT_CLICKED)
    {
        app_runtime_request_wifi_scan();
        return;
    }

    if (code == LV_EVENT_VALUE_CHANGED)
    {
        lv_dropdown_get_selected_str(ui_Dropdown2, selectedWifiName, sizeof(selectedWifiName));
        syncSelectedWifiLabel();
    }
}

void syncWifiOptions()
{
    const char *options = app_runtime_get_wifi_options();
    if (options == nullptr || strcmp(options, lastWifiOptions) == 0)
    {
        return;
    }

    lv_dropdown_set_options(ui_Dropdown2, options);
    lv_dropdown_set_selected(ui_Dropdown2, 0);
    lv_dropdown_get_selected_str(ui_Dropdown2, selectedWifiName, sizeof(selectedWifiName));
    syncSelectedWifiLabel();
    strncpy(lastWifiOptions, options, sizeof(lastWifiOptions) - 1);
    lastWifiOptions[sizeof(lastWifiOptions) - 1] = '\0';
}

void syncWifiLabels()
{
    const char *status = app_runtime_get_wifi_status_text();
    const char *ssid = app_runtime_get_wifi_ssid_text();
    const char *ip = app_runtime_get_wifi_ip_text();
    bool connected = app_runtime_is_wifi_connected();

    if (status != nullptr)
    {
        lv_label_set_text(ui_Label29, status);
    }
    if (ssid != nullptr)
    {
        lv_label_set_text(ui_Label27, ssid);
    }
    if (ip != nullptr)
    {
        lv_label_set_text(ui_Label28, ip);
    }

    lv_obj_set_style_img_recolor_opa(ui_Image25, connected ? LV_OPA_COVER : LV_OPA_TRANSP,
                                     LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_img_recolor(ui_Image25, lv_color_hex(0x2EAF4A), LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_img_recolor_opa(ui_Image6, connected ? LV_OPA_COVER : LV_OPA_TRANSP,
                                     LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_img_recolor(ui_Image6, lv_color_hex(0x2EAF4A), LV_PART_MAIN | LV_STATE_DEFAULT);
    setObjectHidden(ui_Image6, !connected);

    setLabelTextIfChanged(ui_Label31, connected ? "Desconectar" : "Conectarse");
}

void configureRefreshButtons()
{
    lv_obj_add_flag(ui_Image15, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_add_flag(ui_Image27, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_add_flag(ui_Image22, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_add_flag(ui_Image13, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_add_flag(ui_ALERT, LV_OBJ_FLAG_CLICKABLE);

    lv_obj_add_event_cb(ui_Image15, refreshAllClicked, LV_EVENT_ALL, nullptr);
    lv_obj_add_event_cb(ui_Image27, refreshAllClicked, LV_EVENT_ALL, nullptr);
    lv_obj_add_event_cb(ui_Image22, refreshAllClicked, LV_EVENT_ALL, nullptr);
    lv_obj_add_event_cb(ui_Image13, refreshAllClicked, LV_EVENT_ALL, nullptr);
    lv_obj_add_event_cb(ui_ALERT, refreshAllClicked, LV_EVENT_ALL, nullptr);
}

void createMonitorCard(lv_color_t color,
                       lv_coord_t x,
                       lv_coord_t y,
                       const char *title,
                       lv_obj_t **cardOut,
                       lv_obj_t **titleOut,
                       lv_obj_t **valueOut)
{
    lv_obj_t *card = lv_btn_create(ui_MONITOREO_);
    lv_obj_remove_style_all(card);
    lv_obj_set_size(card, 100, 26);
    lv_obj_set_pos(card, x, y);
    lv_obj_set_style_radius(card, 9, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_bg_opa(card, LV_OPA_COVER, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_bg_color(card, color, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_border_width(card, 0, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_shadow_width(card, 6, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_shadow_opa(card, LV_OPA_30, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_shadow_color(card, color, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_clear_flag(card, LV_OBJ_FLAG_SCROLLABLE);

    lv_obj_t *titleLabel = lv_label_create(card);
    lv_obj_set_width(titleLabel, 92);
    lv_obj_align(titleLabel, LV_ALIGN_TOP_MID, 0, 4);
    lv_label_set_long_mode(titleLabel, LV_LABEL_LONG_CLIP);
    lv_label_set_text(titleLabel, title);
    lv_obj_set_style_text_color(titleLabel, lv_color_hex(0xFFFFFF), LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_text_font(titleLabel, &lv_font_montserrat_12, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_text_align(titleLabel, LV_TEXT_ALIGN_CENTER, LV_PART_MAIN | LV_STATE_DEFAULT);

    lv_obj_t *dot = lv_obj_create(card);
    lv_obj_remove_style_all(dot);
    lv_obj_set_size(dot, 0, 0);
    lv_obj_align(dot, LV_ALIGN_BOTTOM_LEFT, 10, -7);
    lv_obj_set_style_radius(dot, LV_RADIUS_CIRCLE, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_bg_opa(dot, LV_OPA_COVER, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_bg_color(dot, lv_color_hex(0xFFFFFF), LV_PART_MAIN | LV_STATE_DEFAULT);

    lv_obj_t *valueLabel = lv_label_create(card);
    lv_obj_set_width(valueLabel, 88);
    lv_obj_align(valueLabel, LV_ALIGN_CENTER, 0, 0);
    lv_label_set_long_mode(valueLabel, LV_LABEL_LONG_CLIP);
    lv_obj_set_style_text_color(valueLabel, lv_color_hex(0xFFFFFF), LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_text_font(valueLabel, &lv_font_montserrat_14, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_text_align(valueLabel, LV_TEXT_ALIGN_CENTER, LV_PART_MAIN | LV_STATE_DEFAULT);

    if (cardOut != nullptr)
    {
        *cardOut = card;
    }
    if (titleOut != nullptr)
    {
        *titleOut = titleLabel;
    }
    if (valueOut != nullptr)
    {
        *valueOut = valueLabel;
    }
}

void configureMonitorCards()
{
    createMonitorCard(lv_color_hex(0xFB7900), 8, 164, "",
                      &monitorPowerCard, &monitorPowerCardTitle, &monitorPowerCardLabel);
    lv_obj_set_style_text_font(monitorPowerCardLabel, &lv_font_montserrat_16, LV_PART_MAIN | LV_STATE_DEFAULT);
    monitorPowerCardLabelBold = lv_label_create(monitorPowerCard);
    lv_obj_set_width(monitorPowerCardLabelBold, 88);
    lv_obj_align(monitorPowerCardLabelBold, LV_ALIGN_CENTER, 1, 0);
    lv_label_set_long_mode(monitorPowerCardLabelBold, LV_LABEL_LONG_CLIP);
    lv_obj_set_style_text_color(monitorPowerCardLabelBold, lv_color_hex(0xFFFFFF), LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_text_font(monitorPowerCardLabelBold, &lv_font_montserrat_16, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_text_align(monitorPowerCardLabelBold, LV_TEXT_ALIGN_CENTER, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_move_foreground(monitorPowerCardLabel);
    createMonitorCard(lv_color_hex(0xFF3B30), 8, 199, "",
                      &monitorTemperatureCard, &monitorTemperatureCardTitle, &monitorTemperatureCardLabel);
    createMonitorCard(lv_color_hex(0x1D73FF), 8, 234, "",
                      &monitorHumidityCard, &monitorHumidityCardTitle, &monitorHumidityCardLabel);
}

void configureMonitorTooltip()
{
    monitorTooltipScrim = lv_obj_create(ui_MONITOREO_);
    lv_obj_remove_style_all(monitorTooltipScrim);
    lv_obj_set_size(monitorTooltipScrim, 480, 272);
    lv_obj_set_pos(monitorTooltipScrim, 0, 0);
    lv_obj_add_flag(monitorTooltipScrim, LV_OBJ_FLAG_HIDDEN);
    lv_obj_add_event_cb(monitorTooltipScrim, monitorTooltipDismissed, LV_EVENT_PRESSED, nullptr);

    monitorTooltipPanel = lv_obj_create(ui_MONITOREO_);
    lv_obj_set_size(monitorTooltipPanel, 140, 82);
    lv_obj_set_style_radius(monitorTooltipPanel, 10, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_bg_color(monitorTooltipPanel, lv_color_hex(0x1F1F1F), LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_bg_opa(monitorTooltipPanel, LV_OPA_90, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_border_width(monitorTooltipPanel, 1, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_border_color(monitorTooltipPanel, lv_color_hex(0x3C3C3C), LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_pad_all(monitorTooltipPanel, 8, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_clear_flag(monitorTooltipPanel, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_add_flag(monitorTooltipPanel, LV_OBJ_FLAG_HIDDEN);

    monitorTooltipTitle = lv_label_create(monitorTooltipPanel);
    lv_obj_align(monitorTooltipTitle, LV_ALIGN_TOP_LEFT, 0, 0);
    lv_obj_set_style_text_color(monitorTooltipTitle, lv_color_hex(0xFFFFFF), LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_text_font(monitorTooltipTitle, &lv_font_montserrat_12, LV_PART_MAIN | LV_STATE_DEFAULT);

    monitorTooltipPower = lv_label_create(monitorTooltipPanel);
    lv_obj_align(monitorTooltipPower, LV_ALIGN_TOP_LEFT, 0, 22);
    lv_obj_set_style_text_color(monitorTooltipPower, lv_color_hex(0xFB7900), LV_PART_MAIN | LV_STATE_DEFAULT);

    monitorTooltipTemperature = lv_label_create(monitorTooltipPanel);
    lv_obj_align(monitorTooltipTemperature, LV_ALIGN_TOP_LEFT, 0, 40);
    lv_obj_set_style_text_color(monitorTooltipTemperature, lv_color_hex(0xFF3B30), LV_PART_MAIN | LV_STATE_DEFAULT);

    monitorTooltipHumidity = lv_label_create(monitorTooltipPanel);
    lv_obj_align(monitorTooltipHumidity, LV_ALIGN_TOP_LEFT, 0, 58);
    lv_obj_set_style_text_color(monitorTooltipHumidity, lv_color_hex(0x1D73FF), LV_PART_MAIN | LV_STATE_DEFAULT);
}

void configureMonitorChart()
{
    monitorDayButtons[0] = ui_Button3;
    monitorDayButtons[1] = ui_Button9;
    monitorDayButtons[2] = ui_Button5;
    monitorDayButtons[3] = ui_Button4;
    monitorDayButtons[4] = ui_Button6;
    monitorDayButtons[5] = ui_Button7;
    monitorDayButtons[6] = ui_Button8;

    monitorDayLabels[0] = ui_Label13;
    monitorDayLabels[1] = ui_Label14;
    monitorDayLabels[2] = ui_Label15;
    monitorDayLabels[3] = ui_Label16;
    monitorDayLabels[4] = ui_Label17;
    monitorDayLabels[5] = ui_Label18;
    monitorDayLabels[6] = ui_Label20;

    lv_obj_set_y(ui_Button3, -68);
    lv_obj_set_y(ui_Button9, -68);
    lv_obj_set_y(ui_Button5, -42);
    lv_obj_set_y(ui_Button4, -42);
    lv_obj_set_y(ui_Button6, -16);
    lv_obj_set_y(ui_Button7, -16);
    lv_obj_set_y(ui_Button8, 10);

    lv_obj_set_y(ui_Label13, -68);
    lv_obj_set_y(ui_Label14, -68);
    lv_obj_set_y(ui_Label15, -42);
    lv_obj_set_y(ui_Label16, -42);
    lv_obj_set_y(ui_Label17, -16);
    lv_obj_set_y(ui_Label18, -16);
    lv_obj_set_y(ui_Label20, 10);

    monitorTemperatureSeries = lv_chart_get_series_next(ui_Chart2, nullptr);
    monitorHumiditySeries = lv_chart_get_series_next(ui_Chart2, monitorTemperatureSeries);
    monitorPowerSeries = lv_chart_get_series_next(ui_Chart2, monitorHumiditySeries);

    if (monitorTemperatureSeries != nullptr)
    {
        lv_chart_set_series_color(ui_Chart2, monitorTemperatureSeries, lv_color_hex(0xFF3B30));
        lv_chart_set_ext_y_array(ui_Chart2, monitorTemperatureSeries, monitorTemperaturePoints);
    }
    if (monitorHumiditySeries != nullptr)
    {
        lv_chart_set_ext_y_array(ui_Chart2, monitorHumiditySeries, monitorHumidityPoints);
    }
    if (monitorPowerSeries != nullptr)
    {
        lv_chart_set_series_color(ui_Chart2, monitorPowerSeries, lv_color_hex(0xFB7900));
        lv_chart_set_ext_y_array(ui_Chart2, monitorPowerSeries, monitorPowerPoints);
    }

    lv_chart_set_point_count(ui_Chart2, APP_HISTORY_POINT_COUNT);
    lv_chart_set_div_line_count(ui_Chart2, 6, 7);
    lv_chart_set_axis_tick(ui_Chart2, LV_CHART_AXIS_PRIMARY_X, 10, 5, 7, 1, true, 50);
    lv_chart_set_axis_tick(ui_Chart2, LV_CHART_AXIS_PRIMARY_Y, 10, 5, 6, 1, true, 18);
    lv_chart_set_axis_tick(ui_Chart2, LV_CHART_AXIS_SECONDARY_Y, 10, 5, 6, 1, true, 18);
    lv_obj_set_style_line_width(ui_Chart2, 4, LV_PART_ITEMS);
    lv_obj_set_style_size(ui_Chart2, 6, LV_PART_INDICATOR);
    lv_obj_add_flag(ui_Chart2, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_add_event_cb(ui_Chart2, monitorChartTouched, LV_EVENT_PRESSING, nullptr);
    lv_obj_add_event_cb(ui_Chart2, monitorChartTouched, LV_EVENT_RELEASED, nullptr);
    lv_obj_add_event_cb(ui_Chart2, monitorChartTouched, LV_EVENT_PRESS_LOST, nullptr);

    for (uint8_t index = 0; index < 7; ++index)
    {
        lv_obj_add_event_cb(monitorDayButtons[index], monitorDaySelected, LV_EVENT_CLICKED,
                            reinterpret_cast<void *>(static_cast<uintptr_t>(index)));
    }

    monitorDeleteHitbox = lv_btn_create(ui_MONITOREO_);
    lv_obj_remove_style_all(monitorDeleteHitbox);
    lv_obj_set_size(monitorDeleteHitbox, 120, 32);
    lv_obj_set_x(monitorDeleteHitbox, 98);
    lv_obj_set_y(monitorDeleteHitbox, -116);
    lv_obj_set_align(monitorDeleteHitbox, LV_ALIGN_CENTER);
    lv_obj_add_flag(monitorDeleteHitbox, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_clear_flag(monitorDeleteHitbox, LV_OBJ_FLAG_EVENT_BUBBLE);
    lv_obj_add_event_cb(monitorDeleteHitbox, monitorDeleteData, LV_EVENT_CLICKED, nullptr);

    lv_obj_add_flag(ui_Image21, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_add_flag(ui_Label26, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_clear_flag(ui_Image21, LV_OBJ_FLAG_EVENT_BUBBLE);
    lv_obj_clear_flag(ui_Label26, LV_OBJ_FLAG_EVENT_BUBBLE);
    lv_obj_add_event_cb(ui_Image21, monitorDeleteData, LV_EVENT_CLICKED, nullptr);
    lv_obj_add_event_cb(ui_Label26, monitorDeleteData, LV_EVENT_CLICKED, nullptr);
    lv_obj_move_foreground(monitorDeleteHitbox);
    lv_obj_move_foreground(ui_Image21);
    lv_obj_move_foreground(ui_Label26);

    configureMonitorCards();
    configureMonitorTooltip();
    currentMonitorDay = app_runtime_get_current_weekday_index();
    selectedMonitorDay = currentMonitorDay;
    clearLiveMonitorPoints();
    refreshMonitorDayStyles();
    refreshMonitorChart();
    refreshMonitorCards();
}

void configureConfigBindings()
{
    bindings[0] = {APP_SENSOR_HUMIDITY, ui_Switch1, ui_Switch5, ui_Label19};
    bindings[1] = {APP_SENSOR_TEMPERATURE, ui_Switch2, ui_Switch6, ui_Label22};
    bindings[2] = {APP_SENSOR_POWER, ui_Switch3, ui_Switch7, ui_Label23};
    bindings[3] = {APP_SENSOR_MOTION, ui_Switch4, ui_Switch8, ui_Label24};

    for (ConfigBinding &binding : bindings)
    {
        lv_obj_add_event_cb(binding.masterSwitch, masterSwitchEvent, LV_EVENT_ALL, nullptr);
        lv_obj_add_event_cb(binding.saveSwitch, saveSwitchEvent, LV_EVENT_ALL, nullptr);

        setSwitchChecked(binding.masterSwitch, false);
        setSwitchChecked(binding.saveSwitch, false);
        applySaveAvailability(binding);
    }
}

void configureWifiTextScrolling()
{
    lv_obj_set_width(ui_Label27, 190);
    lv_label_set_long_mode(ui_Label27, LV_LABEL_LONG_SCROLL_CIRCULAR);
    lv_obj_set_style_text_align(ui_Label27, LV_TEXT_ALIGN_LEFT, LV_PART_MAIN | LV_STATE_DEFAULT);

    lv_obj_set_width(ui_Label30, 170);
    lv_label_set_long_mode(ui_Label30, LV_LABEL_LONG_SCROLL_CIRCULAR);
    lv_obj_set_style_text_align(ui_Label30, LV_TEXT_ALIGN_LEFT, LV_PART_MAIN | LV_STATE_DEFAULT);

    wifiSelectedNetworkLabel = lv_label_create(ui_WIFI);
    lv_obj_set_width(wifiSelectedNetworkLabel, 132);
    lv_obj_set_x(wifiSelectedNetworkLabel, 123);
    lv_obj_set_y(wifiSelectedNetworkLabel, -7);
    lv_obj_set_align(wifiSelectedNetworkLabel, LV_ALIGN_CENTER);
    lv_label_set_long_mode(wifiSelectedNetworkLabel, LV_LABEL_LONG_SCROLL_CIRCULAR);
    lv_obj_set_style_text_align(wifiSelectedNetworkLabel, LV_TEXT_ALIGN_LEFT, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_bg_opa(wifiSelectedNetworkLabel, LV_OPA_COVER, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_bg_color(wifiSelectedNetworkLabel, lv_color_hex(0xFFFFFF), LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_add_flag(wifiSelectedNetworkLabel, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_add_event_cb(wifiSelectedNetworkLabel, wifiDropdownEvent, LV_EVENT_CLICKED, nullptr);
    lv_obj_move_foreground(wifiSelectedNetworkLabel);

    syncSelectedWifiLabel();
}

} // namespace

void ui_app_logic_init()
{
    configureRefreshButtons();
    configureConfigBindings();
    configureWifiTextScrolling();
    configureMonitorChart();

    lv_obj_add_event_cb(ui_Button10, wifiConnectEvent, LV_EVENT_ALL, nullptr);
    lv_obj_add_event_cb(ui_Dropdown2, wifiDropdownEvent, LV_EVENT_ALL, nullptr);

    app_runtime_request_wifi_scan();
    syncWifiOptions();
    syncWifiLabels();
}

void ui_app_logic_tick()
{
    syncWifiOptions();
    syncWifiLabels();
    refreshMonitorCards();

    uint8_t newCurrentDay = app_runtime_get_current_weekday_index();
    if (newCurrentDay != currentMonitorDay)
    {
        currentMonitorDay = newCurrentDay;
        clearLiveMonitorPoints();
        selectMonitorDay(currentMonitorDay);
        return;
    }

    refreshMonitorChart();
}
