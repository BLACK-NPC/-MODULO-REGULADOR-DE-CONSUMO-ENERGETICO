#include "app_runtime.h"

#include <Arduino.h>
#include <DHT.h>
#include <Preferences.h>
#include <WiFi.h>
#include <limits.h>
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

#if defined(__has_include)
#if __has_include(<FirebaseESP32.h>)
#include <FirebaseESP32.h>
#if __has_include(<addons/TokenHelper.h>)
#include <addons/TokenHelper.h>
#endif
#include <addons/RTDBHelper.h>
#define APP_RUNTIME_HAS_FIREBASE 1
#else
#define APP_RUNTIME_HAS_FIREBASE 0
#endif
#else
#define APP_RUNTIME_HAS_FIREBASE 0
#endif

#include "ui.h"
#include "ui_input_overlay.h"

namespace
{
constexpr uint8_t DHT_PIN = 17;
constexpr uint8_t DHT_TYPE = 11;
constexpr uint8_t POWER_SENSOR_PIN = 5;
constexpr uint8_t MOTION_SENSOR_PIN = 16;
constexpr uint8_t PIR_RELAY_PIN = 15;

constexpr uint32_t DHT_READ_INTERVAL_MS = 2500;
constexpr uint8_t DHT_READ_RETRIES = 1;
constexpr uint32_t DHT_READ_RETRY_DELAY_MS = 0;
constexpr uint32_t POWER_READ_INTERVAL_MS = 1000;
constexpr uint32_t MOTION_READ_INTERVAL_MS = 200;
constexpr uint32_t UI_REFRESH_INTERVAL_MS = 250;
constexpr uint32_t WIFI_RETRY_INTERVAL_MS = 12000;
    constexpr uint32_t WIFI_SCAN_RETRY_MS = 15000;
    constexpr uint32_t FIREBASE_HEARTBEAT_INTERVAL_MS = 10000;
constexpr uint32_t FIREBASE_HISTORY_SYNC_INTERVAL_MS = 1500;
constexpr uint32_t SENSOR_ACTIVE_HOLD_MS = 15000;
constexpr uint32_t MOTOR_POWER_GRACE_MS = 15000;
constexpr uint32_t FALLBACK_SECONDS_PER_DAY = 24UL * 60UL * 60UL;
    constexpr uint32_t FALLBACK_SECONDS_PER_HOUR = 60UL * 60UL;
    constexpr uint8_t HISTORY_DAY_COUNT = 7;
    constexpr char LOCAL_TIME_ZONE[] = "COT5";
    constexpr char NTP_SERVER_1[] = "pool.ntp.org";
    constexpr char NTP_SERVER_2[] = "time.nist.gov";

    constexpr size_t POWER_SAMPLE_COUNT = 128;
    constexpr int POWER_MIN_VALID_SPAN = 80;
    constexpr float MOTOR_TEMPERATURE_WEIGHT = 0.6f;
    constexpr float MOTOR_HUMIDITY_WEIGHT = 0.4f;
    constexpr float DHT_TEMPERATURE_MIN_C = 0.0f;
    constexpr float DHT_TEMPERATURE_MAX_C = 60.0f;
    constexpr float DHT_HUMIDITY_MIN_PERCENT = 0.0f;
    constexpr float DHT_HUMIDITY_MAX_PERCENT = 100.0f;
    constexpr float DHT_MAX_TEMPERATURE_STEP_C = 2.5f;
    constexpr float DHT_MAX_HUMIDITY_STEP_PERCENT = 6.0f;
    constexpr float DHT_PENDING_TEMPERATURE_WINDOW_C = 1.0f;
    constexpr float DHT_PENDING_HUMIDITY_WINDOW_PERCENT = 3.0f;
    constexpr uint8_t DHT_PENDING_CONFIRMATIONS = 2;
    constexpr uint8_t DHT_FAILURES_BEFORE_CLEAR = 3;
    constexpr float DHT_SMOOTHING_ALPHA = 0.35f;

constexpr char STATUS_OFF[] = "APAGADO";
constexpr char STATUS_FAIL[] = "FALLA";
constexpr char STATUS_ON[] = "ENCENDIDO";
constexpr char MOTOR_STATUS_RUNNING[] = "running";
constexpr char MOTOR_STATUS_STOPPED[] = "stopped";
constexpr char MOTOR_MODE_AUTOMATIC_TEXT[] = "AUTOMATICO";
constexpr char MOTOR_MODE_MANUAL_TEXT[] = "MANUAL";

constexpr char DEFAULT_WIFI_SSID[] = "";
constexpr char DEFAULT_WIFI_PASSWORD[] = "";
constexpr char DEFAULT_FIREBASE_API_KEY[] = "AIzaSyCNNSX4rDEtx0fREDr6d-FSYHxWxrAihBU";
constexpr char DEFAULT_FIREBASE_DATABASE_URL[] = "https://modulo-regulador-de-consumo-default-rtdb.firebaseio.com";
constexpr char WIFI_PREFS_NAMESPACE[] = "appwifi";
constexpr char WIFI_PREFS_SSID_KEY[] = "ssid";
constexpr char WIFI_PREFS_PASSWORD_KEY[] = "password";

constexpr char FIREBASE_ROOT_PATH[] = "/avc01";
constexpr char FIREBASE_COMMAND_PATH[] = "/avc01/comandos";
constexpr int WIFI_SCAN_FAILED_CODE = -2;
constexpr uint32_t FIREBASE_COMMAND_POLL_INTERVAL_MS = 2000;
constexpr int64_t FIREBASE_COMMAND_MAX_AGE_MS = 90000;
constexpr const char *HISTORY_DAY_NAMES[HISTORY_DAY_COUNT] = {
    "Lun",
    "Mar",
    "Mie",
    "Jue",
    "Vie",
    "Sab",
    "Dom",
};

struct StatusSignal
{
    uint32_t lastGoodMs = 0;
};

struct PowerWindow
{
    int average = 0;
    int span = 0;
};

struct DhtFilterState
{
    float pendingValue = NAN;
    uint8_t pendingConfirmations = 0;
    uint8_t invalidCount = 0;
};

struct HourlyMetric
{
    float sum = 0.0f;
    uint16_t count = 0;
};

struct DayHistory
{
    int32_t dayKey = INT32_MIN;
    HourlyMetric temperature[APP_HISTORY_POINT_COUNT];
    HourlyMetric humidity[APP_HISTORY_POINT_COUNT];
    HourlyMetric power[APP_HISTORY_POINT_COUNT];
};

struct TimeSnapshot
{
    int32_t dayKey = 0;
    uint8_t weekdayIndex = 0; // Monday = 0
    uint8_t hour = 0;
    uint8_t minute = 0;
    uint8_t second = 0;
};

enum AlertState : uint8_t
{
    ALERT_STATE_OFF = 0,
    ALERT_STATE_FAIL,
    ALERT_STATE_ON
};

enum MotorMode : uint8_t
{
    MOTOR_MODE_AUTOMATIC = 0,
    MOTOR_MODE_MANUAL
};

DHT dht(DHT_PIN, DHT_TYPE);

#if APP_RUNTIME_HAS_FIREBASE
FirebaseData firebaseData;
FirebaseData firebaseCommandData;
FirebaseAuth firebaseAuth;
FirebaseConfig firebaseConfig;
#endif

StatusSignal temperatureSignal;
StatusSignal humiditySignal;
StatusSignal powerSignal;
StatusSignal movementSignal;
StatusSignal wifiSignal;
StatusSignal firebaseSignal;

bool sensorEnabled[APP_SENSOR_COUNT] = {false, false, false, false};
bool loggingEnabled[APP_SENSOR_COUNT] = {false, false, false, false};
bool firebaseEnabled = false;
bool powerSampleAvailable = false;
bool motorRunning = false;
MotorMode motorMode = MOTOR_MODE_AUTOMATIC;
bool updatingMotorArc = false;
bool updatingMotorDropdown = false;

float lastTemperatureC = NAN;
float lastHumidityPercent = NAN;
int lastPowerAverage = 0;
int motorSpeedPercent = 0;
int manualMotorSpeedPercent = 0;
bool motionInputHigh = false;

lv_obj_t *motorConsumptionTitle = nullptr;
lv_obj_t *motorConsumptionValue = nullptr;
lv_obj_t *motorSeparator = nullptr;
lv_obj_t *motorSpeedTitle = nullptr;
lv_obj_t *motorSpeedValue = nullptr;
lv_obj_t *motionStatusLabel = nullptr;
lv_obj_t *motionStatusDot = nullptr;
lv_obj_t *operationStatusDot = nullptr;

void setLabelTextIfChanged(lv_obj_t *label, const char *text);
bool isActive(const StatusSignal &signal, uint32_t now);
lv_color_t alertStateColor(AlertState state);
void clearWeeklyHistoryInternal();
void markAllHistoryDirty();
void refreshMotorControl();
void stopMotor(bool clearSpeedField);

uint32_t lastDhtReadMs = 0;
uint32_t lastPowerReadMs = 0;
uint32_t lastMotionReadMs = 0;
uint32_t lastUiRefreshMs = 0;
uint32_t lastWifiRetryMs = 0;
uint32_t lastWifiScanMs = 0;
uint32_t lastFirebaseHeartbeatMs = 0;
uint32_t lastFirebaseHistorySyncMs = 0;
uint32_t lastFirebaseCommandPollMs = 0;
uint32_t motorPowerExpectedSinceMs = 0;

bool wifiStarted = false;
bool firebaseConfigured = false;
bool wifiScanRequested = false;
bool firebaseCommandsPrimed = false;
bool historyDirty[HISTORY_DAY_COUNT] = {false, false, false, false, false, false, false};
DhtFilterState temperatureFilter;
DhtFilterState humidityFilter;
int64_t lastFirebaseCommandTs = 0;

char configuredWifiSsid[33] = "";
char configuredWifiPassword[65] = "";
char firebaseDatabaseUrl[128] = "";

char wifiOptions[768] = "Sin redes encontradas";
char wifiNetworkNames[16][33] = {{0}};
uint16_t wifiNetworkCount = 0;
char wifiStatusText[64] = "Estado: Desconectado";
char wifiSsidText[96] = " Red Actual: --";
char wifiIpText[48] = " IP: --";

Preferences wifiPreferences;

DayHistory weeklyHistory[HISTORY_DAY_COUNT];

bool timeSyncRequested = false;
bool networkTimeCalibrated = false;
uint32_t fallbackClockStartMs = 0;
int32_t fallbackDayKey = 0;
uint32_t fallbackSecondOfDay = 0;
uint8_t fallbackWeekdayIndex = 0;

void markActive(StatusSignal &signal, uint32_t now)
{
    signal.lastGoodMs = now;
}

void clearSignal(StatusSignal &signal)
{
    signal.lastGoodMs = 0;
}

void resetDhtPending(DhtFilterState &state)
{
    state.pendingValue = NAN;
    state.pendingConfirmations = 0;
}

void resetDhtFilter(DhtFilterState &state)
{
    resetDhtPending(state);
    state.invalidCount = 0;
}

uint8_t normalizeWeekdayIndex(int32_t index)
{
    int32_t normalized = index % HISTORY_DAY_COUNT;
    if (normalized < 0)
    {
        normalized += HISTORY_DAY_COUNT;
    }
    return static_cast<uint8_t>(normalized);
}

int32_t daysFromCivil(int year, unsigned month, unsigned day)
{
    year -= month <= 2;
    const int era = (year >= 0 ? year : year - 399) / 400;
    const unsigned yearOfEra = static_cast<unsigned>(year - era * 400);
    const unsigned dayOfYear = (153 * (month + (month > 2 ? -3 : 9)) + 2) / 5 + day - 1;
    const unsigned dayOfEra = yearOfEra * 365 + yearOfEra / 4 - yearOfEra / 100 + dayOfYear;
    return era * 146097 + static_cast<int>(dayOfEra) - 719468;
}

uint8_t monthFromBuildDate(const char *month)
{
    static const char *MONTHS[] = {"Jan", "Feb", "Mar", "Apr", "May", "Jun",
                                   "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"};
    for (uint8_t index = 0; index < 12; ++index)
    {
        if (strncmp(month, MONTHS[index], 3) == 0)
        {
            return static_cast<uint8_t>(index + 1);
        }
    }

    return 1;
}

TimeSnapshot buildFallbackSnapshot()
{
    TimeSnapshot snapshot;

    uint8_t month = monthFromBuildDate(__DATE__);
    int day = atoi(__DATE__ + 4);
    int year = atoi(__DATE__ + 7);
    int hour = atoi(__TIME__);
    int minute = atoi(__TIME__ + 3);
    int second = atoi(__TIME__ + 6);

    snapshot.dayKey = daysFromCivil(year, month, static_cast<unsigned>(day));
    snapshot.weekdayIndex = normalizeWeekdayIndex(snapshot.dayKey + 3);
    snapshot.hour = static_cast<uint8_t>(constrain(hour, 0, 23));
    snapshot.minute = static_cast<uint8_t>(constrain(minute, 0, 59));
    snapshot.second = static_cast<uint8_t>(constrain(second, 0, 59));

    fallbackDayKey = snapshot.dayKey;
    fallbackWeekdayIndex = snapshot.weekdayIndex;
    fallbackSecondOfDay = static_cast<uint32_t>(snapshot.hour * 3600U + snapshot.minute * 60U + snapshot.second);
    fallbackClockStartMs = millis();

    return snapshot;
}

bool readLocalTimeSnapshot(TimeSnapshot &snapshot)
{
    struct tm localTimeInfo;
    if (!getLocalTime(&localTimeInfo, 0))
    {
        return false;
    }

    snapshot.dayKey = daysFromCivil(localTimeInfo.tm_year + 1900,
                                    static_cast<unsigned>(localTimeInfo.tm_mon + 1),
                                    static_cast<unsigned>(localTimeInfo.tm_mday));
    snapshot.weekdayIndex = normalizeWeekdayIndex(localTimeInfo.tm_wday + 6);
    snapshot.hour = static_cast<uint8_t>(localTimeInfo.tm_hour);
    snapshot.minute = static_cast<uint8_t>(localTimeInfo.tm_min);
    snapshot.second = static_cast<uint8_t>(localTimeInfo.tm_sec);
    return true;
}

TimeSnapshot getCurrentTimeSnapshot()
{
    TimeSnapshot snapshot;
    if (readLocalTimeSnapshot(snapshot))
    {
        return snapshot;
    }

    uint32_t elapsedSeconds = (millis() - fallbackClockStartMs) / 1000UL;
    uint32_t totalSeconds = fallbackSecondOfDay + elapsedSeconds;
    uint32_t dayOffset = totalSeconds / FALLBACK_SECONDS_PER_DAY;
    uint32_t secondOfDay = totalSeconds % FALLBACK_SECONDS_PER_DAY;

    snapshot.dayKey = fallbackDayKey + static_cast<int32_t>(dayOffset);
    snapshot.weekdayIndex = normalizeWeekdayIndex(static_cast<int32_t>(fallbackWeekdayIndex) + static_cast<int32_t>(dayOffset));
    snapshot.hour = static_cast<uint8_t>(secondOfDay / FALLBACK_SECONDS_PER_HOUR);
    snapshot.minute = static_cast<uint8_t>((secondOfDay % FALLBACK_SECONDS_PER_HOUR) / 60UL);
    snapshot.second = static_cast<uint8_t>(secondOfDay % 60UL);
    return snapshot;
}

void storeFallbackFromSnapshot(const TimeSnapshot &snapshot, uint32_t now)
{
    fallbackDayKey = snapshot.dayKey;
    fallbackWeekdayIndex = snapshot.weekdayIndex;
    fallbackSecondOfDay = static_cast<uint32_t>(snapshot.hour * 3600U + snapshot.minute * 60U + snapshot.second);
    fallbackClockStartMs = now;
}

void refreshClockLabel()
{
    if (ui_Label12 == nullptr)
    {
        return;
    }

    TimeSnapshot snapshot = getCurrentTimeSnapshot();
    char buffer[16];
    uint8_t hour12 = snapshot.hour % 12;
    if (hour12 == 0)
    {
        hour12 = 12;
    }

    snprintf(buffer,
             sizeof(buffer),
             "%u:%02u %s",
             hour12,
             snapshot.minute,
             snapshot.hour >= 12 ? "PM" : "AM");
    setLabelTextIfChanged(ui_Label12, buffer);
}

void recalibrateTimeFromWifi(uint32_t now)
{
    TimeSnapshot networkSnapshot;
    if (!readLocalTimeSnapshot(networkSnapshot))
    {
        return;
    }

    bool shouldRebuildHistory =
        !networkTimeCalibrated &&
        (networkSnapshot.dayKey != fallbackDayKey ||
         networkSnapshot.weekdayIndex != fallbackWeekdayIndex ||
         abs(static_cast<int>(networkSnapshot.hour) -
             static_cast<int>((fallbackSecondOfDay / FALLBACK_SECONDS_PER_HOUR) % 24UL)) >= 1);

    storeFallbackFromSnapshot(networkSnapshot, now);

    if (!networkTimeCalibrated)
    {
        networkTimeCalibrated = true;
        if (shouldRebuildHistory)
        {
            clearWeeklyHistoryInternal();
            markAllHistoryDirty();
            Serial.println("Hora WiFi/NTP sincronizada. El monitoreo semanal se recalibro con la fecha real.");
        }
        else
        {
            Serial.println("Hora WiFi/NTP sincronizada.");
        }
    }
}

void clearHourlyMetric(HourlyMetric &metric)
{
    metric.sum = 0.0f;
    metric.count = 0;
}

void clearDayHistory(DayHistory &history)
{
    history.dayKey = INT32_MIN;
    for (uint8_t index = 0; index < APP_HISTORY_POINT_COUNT; ++index)
    {
        clearHourlyMetric(history.temperature[index]);
        clearHourlyMetric(history.humidity[index]);
        clearHourlyMetric(history.power[index]);
    }
}

void clearWeeklyHistoryInternal()
{
    for (DayHistory &history : weeklyHistory)
    {
        clearDayHistory(history);
    }
}

void markHistoryDirty(uint8_t weekdayIndex)
{
    if (weekdayIndex < HISTORY_DAY_COUNT)
    {
        historyDirty[weekdayIndex] = true;
    }
}

void markAllHistoryDirty()
{
    for (uint8_t index = 0; index < HISTORY_DAY_COUNT; ++index)
    {
        historyDirty[index] = true;
    }
}

void purgeExpiredHistory(int32_t currentDayKey)
{
    for (DayHistory &history : weeklyHistory)
    {
        if (history.dayKey == INT32_MIN)
        {
            continue;
        }

        int32_t age = currentDayKey - history.dayKey;
        if (age < 0 || age >= HISTORY_DAY_COUNT)
        {
            clearDayHistory(history);
        }
    }
}

DayHistory &ensureHistoryDay(const TimeSnapshot &snapshot)
{
    purgeExpiredHistory(snapshot.dayKey);

    DayHistory &history = weeklyHistory[snapshot.weekdayIndex];
    if (history.dayKey != snapshot.dayKey)
    {
        clearDayHistory(history);
        history.dayKey = snapshot.dayKey;
    }

    return history;
}

void addMetricSample(HourlyMetric &metric, float value)
{
    metric.sum += value;
    ++metric.count;
}

int16_t metricToChartValue(const HourlyMetric &metric)
{
    if (metric.count == 0)
    {
        return LV_CHART_POINT_NONE;
    }

    float average = metric.sum / metric.count;
    long rounded = lroundf(average);
    if (rounded >= LV_CHART_POINT_NONE)
    {
        rounded = LV_CHART_POINT_NONE - 1;
    }
    if (rounded < INT16_MIN)
    {
        rounded = INT16_MIN;
    }
    return static_cast<int16_t>(rounded);
}

int rawAverageToPowerPercent(int rawAverage)
{
    return static_cast<int>(lroundf(constrain((static_cast<float>(rawAverage) * 100.0f) / 4095.0f, 0.0f, 100.0f)));
}

bool isPowerWindowValid(const PowerWindow &window)
{
    return window.span >= POWER_MIN_VALID_SPAN;
}

int constrainPercent(float value)
{
    return static_cast<int>(lroundf(constrain(value, 0.0f, 100.0f)));
}

bool isDhtReadingInRange(float value, float minValue, float maxValue)
{
    return !isnan(value) && value >= minValue && value <= maxValue;
}

float smoothDhtReading(float currentValue, float rawValue)
{
    if (isnan(currentValue))
    {
        return rawValue;
    }

    return currentValue + ((rawValue - currentValue) * DHT_SMOOTHING_ALPHA);
}

bool acceptDhtReading(DhtFilterState &filterState,
                      float rawValue,
                      float minValue,
                      float maxValue,
                      float maxStep,
                      float pendingWindow,
                      float &stableValue)
{
    if (!isDhtReadingInRange(rawValue, minValue, maxValue))
    {
        if (filterState.invalidCount < UINT8_MAX)
        {
            ++filterState.invalidCount;
        }

        if (filterState.invalidCount >= DHT_FAILURES_BEFORE_CLEAR)
        {
            stableValue = NAN;
            resetDhtPending(filterState);
        }
        return false;
    }

    filterState.invalidCount = 0;

    if (isnan(stableValue))
    {
        stableValue = rawValue;
        resetDhtPending(filterState);
        return true;
    }

    float delta = fabsf(rawValue - stableValue);
    if (delta <= maxStep)
    {
        stableValue = smoothDhtReading(stableValue, rawValue);
        resetDhtPending(filterState);
        return true;
    }

    bool matchesPending = !isnan(filterState.pendingValue) &&
                          fabsf(rawValue - filterState.pendingValue) <= pendingWindow;
    if (!matchesPending)
    {
        filterState.pendingValue = rawValue;
        filterState.pendingConfirmations = 1;
        return false;
    }

    if (filterState.pendingConfirmations < UINT8_MAX)
    {
        ++filterState.pendingConfirmations;
    }

    if (filterState.pendingConfirmations < DHT_PENDING_CONFIRMATIONS)
    {
        return false;
    }

    stableValue = rawValue;
    resetDhtPending(filterState);
    return true;
}

int calculateAutomaticMotorSpeed()
{
    if (!sensorEnabled[APP_SENSOR_TEMPERATURE] || isnan(lastTemperatureC) ||
        !sensorEnabled[APP_SENSOR_HUMIDITY] || isnan(lastHumidityPercent))
    {
        return 0;
    }

    float speed = (lastTemperatureC * MOTOR_TEMPERATURE_WEIGHT) +
                  ((100.0f - lastHumidityPercent) * MOTOR_HUMIDITY_WEIGHT);
    return constrainPercent(speed);
}

bool pirAllowsMotorRun()
{
    return !sensorEnabled[APP_SENSOR_MOTION] || isActive(movementSignal, millis());
}

void updatePirRelayOutput(uint32_t now)
{
    bool relayEnabled = sensorEnabled[APP_SENSOR_MOTION] && isActive(movementSignal, now);
    digitalWrite(PIR_RELAY_PIN, relayEnabled ? HIGH : LOW);
}

void setLabelWidthAndAlign(lv_obj_t *label, lv_coord_t width)
{
    if (label == nullptr)
    {
        return;
    }

    lv_obj_set_width(label, width);
    lv_obj_set_style_text_align(label, LV_TEXT_ALIGN_CENTER, LV_PART_MAIN | LV_STATE_DEFAULT);
}

lv_obj_t *createCenteredHomeLabel(const char *text, lv_coord_t x, lv_coord_t y, const lv_font_t *font)
{
    lv_obj_t *label = lv_label_create(ui_HOME);
    lv_obj_set_width(label, 100);
    lv_obj_set_x(label, x);
    lv_obj_set_y(label, y);
    lv_obj_set_align(label, LV_ALIGN_CENTER);
    lv_label_set_text(label, text);
    lv_obj_set_style_text_align(label, LV_TEXT_ALIGN_CENTER, LV_PART_MAIN | LV_STATE_DEFAULT);
    if (font != nullptr)
    {
        lv_obj_set_style_text_font(label, font, LV_PART_MAIN | LV_STATE_DEFAULT);
    }
    return label;
}

void buildMotorInfoPanel()
{
    lv_obj_add_flag(ui_Label6, LV_OBJ_FLAG_HIDDEN);
    lv_obj_add_flag(ui_TextArea2, LV_OBJ_FLAG_HIDDEN);
    lv_obj_add_flag(ui_Keyboard2, LV_OBJ_FLAG_HIDDEN);
    lv_obj_set_y(ui_Label11, 74);
    lv_obj_update_layout(ui_HOME);

    motorConsumptionTitle = createCenteredHomeLabel("Consumo", 154, -42, &lv_font_montserrat_12);
    motorConsumptionValue = createCenteredHomeLabel("-- W", 154, -22, &lv_font_montserrat_16);
    motorSeparator = createCenteredHomeLabel("_______", 154, -5, &lv_font_montserrat_12);
    motorSpeedTitle = createCenteredHomeLabel("Velocidad", 154, 13, &lv_font_montserrat_12);
    motorSpeedValue = createCenteredHomeLabel("0 %", 154, 34, &lv_font_montserrat_16);

    setLabelWidthAndAlign(motorConsumptionTitle, 86);
    setLabelWidthAndAlign(motorConsumptionValue, 86);
    setLabelWidthAndAlign(motorSeparator, 76);
    setLabelWidthAndAlign(motorSpeedTitle, 86);
    setLabelWidthAndAlign(motorSpeedValue, 86);

    motionStatusDot = lv_obj_create(ui_HOME);
    lv_obj_remove_style_all(motionStatusDot);
    lv_obj_set_size(motionStatusDot, 10, 10);
    lv_obj_set_x(motionStatusDot, 111);
    lv_obj_set_y(motionStatusDot, 58);
    lv_obj_set_align(motionStatusDot, LV_ALIGN_CENTER);
    lv_obj_clear_flag(motionStatusDot, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_set_style_radius(motionStatusDot, LV_RADIUS_CIRCLE, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_bg_opa(motionStatusDot, LV_OPA_COVER, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_bg_color(motionStatusDot, lv_color_hex(0x9AA4B2), LV_PART_MAIN | LV_STATE_DEFAULT);

    motionStatusLabel = lv_label_create(ui_HOME);
    lv_obj_set_width(motionStatusLabel, 78);
    lv_obj_set_x(motionStatusLabel, 156);
    lv_obj_set_y(motionStatusLabel, 58);
    lv_obj_set_align(motionStatusLabel, LV_ALIGN_CENTER);
    lv_label_set_text(motionStatusLabel, "PIR OFF");
    lv_obj_set_style_text_align(motionStatusLabel, LV_TEXT_ALIGN_LEFT, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_text_font(motionStatusLabel, &lv_font_montserrat_12, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_text_color(motionStatusLabel, lv_color_hex(0x5A6572), LV_PART_MAIN | LV_STATE_DEFAULT);

    operationStatusDot = lv_obj_create(ui_HOME);
    lv_obj_remove_style_all(operationStatusDot);
    lv_obj_set_size(operationStatusDot, 10, 10);
    lv_obj_align_to(operationStatusDot, ui_Label11, LV_ALIGN_OUT_RIGHT_MID, 10, 0);
    lv_obj_clear_flag(operationStatusDot, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_set_style_radius(operationStatusDot, LV_RADIUS_CIRCLE, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_bg_opa(operationStatusDot, LV_OPA_COVER, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_bg_color(operationStatusDot, lv_color_hex(0xD83A3A), LV_PART_MAIN | LV_STATE_DEFAULT);
}

void styleActionButton(lv_obj_t *button, lv_obj_t *label, lv_color_t color, bool highlighted)
{
    if (button == nullptr || label == nullptr)
    {
        return;
    }

    lv_obj_set_style_radius(button, 22, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_border_width(button, 0, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_bg_opa(button, highlighted ? LV_OPA_COVER : LV_OPA_80, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_bg_color(button, color, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_shadow_width(button, highlighted ? 16 : 8, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_shadow_spread(button, 0, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_shadow_opa(button, highlighted ? LV_OPA_40 : LV_OPA_20, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_shadow_color(button, color, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_outline_width(button, 0, LV_PART_MAIN | LV_STATE_DEFAULT);

    lv_obj_set_style_text_color(label, lv_color_hex(0xFFFFFF), LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_text_font(label, &lv_font_montserrat_16, LV_PART_MAIN | LV_STATE_DEFAULT);
}

bool motorShouldConsumePower()
{
    return motorRunning && pirAllowsMotorRun() && motorSpeedPercent > 0;
}

AlertState operationPilotState(uint32_t now)
{
    if (!motorShouldConsumePower())
    {
        motorPowerExpectedSinceMs = 0;
        return ALERT_STATE_OFF;
    }

    if (isActive(powerSignal, now))
    {
        return ALERT_STATE_ON;
    }

    if (motorPowerExpectedSinceMs == 0)
    {
        motorPowerExpectedSinceMs = now;
        return ALERT_STATE_ON;
    }

    return (now - motorPowerExpectedSinceMs) >= MOTOR_POWER_GRACE_MS ? ALERT_STATE_FAIL : ALERT_STATE_ON;
}

void setIndicatorColor(lv_obj_t *indicator, AlertState state)
{
    if (indicator == nullptr)
    {
        return;
    }

    lv_obj_set_style_radius(indicator, LV_RADIUS_CIRCLE, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_bg_opa(indicator, LV_OPA_COVER, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_bg_color(indicator, alertStateColor(state), LV_PART_MAIN | LV_STATE_DEFAULT);
}

void refreshOperationPilot(uint32_t now)
{
    setIndicatorColor(operationStatusDot, operationPilotState(now));
}

void setTextareaTextIfChanged(lv_obj_t *textarea, const char *text)
{
    if (textarea == nullptr || text == nullptr)
    {
        return;
    }

    const char *currentText = lv_textarea_get_text(textarea);
    if (currentText != nullptr && strcmp(currentText, text) == 0)
    {
        return;
    }

    lv_textarea_set_text(textarea, text);
}

void syncMotorModeDropdown()
{
    if (ui_Dropdown1 == nullptr)
    {
        return;
    }

    uint16_t desiredSelection = motorMode == MOTOR_MODE_AUTOMATIC ? 0 : 1;
    if (lv_dropdown_get_selected(ui_Dropdown1) == desiredSelection)
    {
        return;
    }

    updatingMotorDropdown = true;
    lv_dropdown_set_selected(ui_Dropdown1, desiredSelection);
    updatingMotorDropdown = false;
}

void setMotorModeLocal(MotorMode mode)
{
    bool modeChanged = motorMode != mode;
    motorMode = mode;
    syncMotorModeDropdown();

    if (modeChanged)
    {
        stopMotor(true);
        return;
    }

    refreshMotorControl();
}

void setMotorRunningLocal(bool running)
{
    if (!running)
    {
        stopMotor(true);
        return;
    }

    if (!motorRunning)
    {
        motorRunning = true;
    }
    refreshMotorControl();
}

void setManualMotorSpeedLocal(int speedPercent)
{
    int clampedSpeed = constrainPercent(static_cast<float>(speedPercent));
    bool speedChanged = manualMotorSpeedPercent != clampedSpeed;

    manualMotorSpeedPercent = clampedSpeed;

    if (ui_Arc1 != nullptr && lv_arc_get_value(ui_Arc1) != clampedSpeed)
    {
        updatingMotorArc = true;
        lv_arc_set_value(ui_Arc1, clampedSpeed);
        updatingMotorArc = false;
    }

    if (speedChanged || motorRunning)
    {
        refreshMotorControl();
    }
}

void refreshMotorControl()
{
    uint32_t now = millis();

    syncMotorModeDropdown();

    if (!motorRunning || !pirAllowsMotorRun())
    {
        motorSpeedPercent = 0;
    }
    else if (motorMode == MOTOR_MODE_AUTOMATIC)
    {
        motorSpeedPercent = calculateAutomaticMotorSpeed();
    }
    else
    {
        motorSpeedPercent = manualMotorSpeedPercent;
    }

    if (ui_Arc1 != nullptr)
    {
        if (motorMode == MOTOR_MODE_MANUAL)
        {
            lv_obj_add_flag(ui_Arc1, LV_OBJ_FLAG_CLICKABLE);
        }
        else
        {
            lv_obj_clear_flag(ui_Arc1, LV_OBJ_FLAG_CLICKABLE);
        }

        updatingMotorArc = true;
        lv_arc_set_value(ui_Arc1, motorSpeedPercent);
        updatingMotorArc = false;
    }

    char buffer[16];
    if (motorConsumptionValue != nullptr)
    {
        if (app_runtime_has_power())
        {
            snprintf(buffer, sizeof(buffer), "%d W", app_runtime_get_power_percent());
        }
        else
        {
            snprintf(buffer, sizeof(buffer), "-- W");
        }
        setLabelTextIfChanged(motorConsumptionValue, buffer);
    }
    if (motorSpeedValue != nullptr)
    {
        snprintf(buffer, sizeof(buffer), "%d %%", motorSpeedPercent);
        setLabelTextIfChanged(motorSpeedValue, buffer);
    }

    styleActionButton(ui_Button2, ui_Label7, lv_color_hex(0x2EAF4A), motorRunning);
    styleActionButton(ui_Button1, ui_Label8, lv_color_hex(0xE24A3B), !motorRunning);
    refreshOperationPilot(now);
}

void stopMotor(bool clearSpeedField)
{
    motorRunning = false;
    motorSpeedPercent = 0;

    if (ui_Arc1 != nullptr)
    {
        lv_arc_set_value(ui_Arc1, 0);
    }

    if (clearSpeedField)
    {
        manualMotorSpeedPercent = 0;
    }
    refreshMotorControl();
}

void motorStartEvent(lv_event_t *e)
{
    if (lv_event_get_code(e) != LV_EVENT_CLICKED)
    {
        return;
    }

    motorRunning = true;
    refreshMotorControl();
}

void motorStopEvent(lv_event_t *e)
{
    if (lv_event_get_code(e) != LV_EVENT_CLICKED)
    {
        return;
    }

    stopMotor(true);
}

void motorModeChangedEvent(lv_event_t *e)
{
    if (lv_event_get_code(e) != LV_EVENT_VALUE_CHANGED || updatingMotorDropdown)
    {
        return;
    }

    if (ui_Dropdown1 != nullptr)
    {
        setMotorModeLocal(lv_dropdown_get_selected(ui_Dropdown1) == 0 ? MOTOR_MODE_AUTOMATIC : MOTOR_MODE_MANUAL);
        return;
    }
}

void motorArcChangedEvent(lv_event_t *e)
{
    if (lv_event_get_code(e) != LV_EVENT_VALUE_CHANGED || updatingMotorArc)
    {
        return;
    }

    if (motorMode != MOTOR_MODE_MANUAL || ui_Arc1 == nullptr)
    {
        refreshMotorControl();
        return;
    }

    manualMotorSpeedPercent = constrainPercent(static_cast<float>(lv_arc_get_value(ui_Arc1)));
    if (motorRunning)
    {
        motorSpeedPercent = manualMotorSpeedPercent;
    }
    else
    {
        motorSpeedPercent = manualMotorSpeedPercent;
    }
    refreshMotorControl();
}

void maybeConfigureNetworkTime()
{
    if (timeSyncRequested || WiFi.status() != WL_CONNECTED)
    {
        return;
    }

    setenv("TZ", LOCAL_TIME_ZONE, 1);
    tzset();
    configTime(0, 0, NTP_SERVER_1, NTP_SERVER_2);
    timeSyncRequested = true;
}

bool isActive(const StatusSignal &signal, uint32_t now)
{
    return signal.lastGoodMs != 0 && (now - signal.lastGoodMs) <= SENSOR_ACTIVE_HOLD_MS;
}

bool credentialsConfigured()
{
    return configuredWifiSsid[0] != '\0';
}

void loadStoredWifiCredentials()
{
    if (!wifiPreferences.begin(WIFI_PREFS_NAMESPACE, true))
    {
        Serial.println("WiFi: no se pudo abrir NVS para lectura.");
        return;
    }

    String storedSsid = wifiPreferences.getString(WIFI_PREFS_SSID_KEY, "");
    String storedPassword = wifiPreferences.getString(WIFI_PREFS_PASSWORD_KEY, "");
    wifiPreferences.end();

    if (storedSsid.length() == 0)
    {
        return;
    }

    strncpy(configuredWifiSsid, storedSsid.c_str(), sizeof(configuredWifiSsid) - 1);
    configuredWifiSsid[sizeof(configuredWifiSsid) - 1] = '\0';
    strncpy(configuredWifiPassword, storedPassword.c_str(), sizeof(configuredWifiPassword) - 1);
    configuredWifiPassword[sizeof(configuredWifiPassword) - 1] = '\0';
    Serial.println("WiFi: credenciales cargadas desde memoria.");
}

void storeWifiCredentials()
{
    if (!wifiPreferences.begin(WIFI_PREFS_NAMESPACE, false))
    {
        Serial.println("WiFi: no se pudo abrir NVS para guardar.");
        return;
    }

    wifiPreferences.putString(WIFI_PREFS_SSID_KEY, configuredWifiSsid);
    wifiPreferences.putString(WIFI_PREFS_PASSWORD_KEY, configuredWifiPassword);
    wifiPreferences.end();
}

void clearStoredWifiCredentials()
{
    if (!wifiPreferences.begin(WIFI_PREFS_NAMESPACE, false))
    {
        Serial.println("WiFi: no se pudo abrir NVS para borrar.");
        return;
    }

    wifiPreferences.remove(WIFI_PREFS_SSID_KEY);
    wifiPreferences.remove(WIFI_PREFS_PASSWORD_KEY);
    wifiPreferences.end();
}

bool firebaseConfiguredOnDevice()
{
    return firebaseDatabaseUrl[0] != '\0';
}

const char *alertStateText(AlertState state)
{
    switch (state)
    {
    case ALERT_STATE_ON:
        return STATUS_ON;
    case ALERT_STATE_OFF:
        return STATUS_OFF;
    default:
        return STATUS_FAIL;
    }
}

lv_color_t alertStateColor(AlertState state)
{
    switch (state)
    {
    case ALERT_STATE_ON:
        return lv_color_hex(0x2EAF4A);
    case ALERT_STATE_OFF:
        return lv_color_hex(0xD83A3A);
    default:
        return lv_color_hex(0xE68A00);
    }
}

void setAlertVisual(lv_obj_t *label, lv_obj_t *indicator, AlertState state)
{
    if (label == nullptr || indicator == nullptr)
    {
        return;
    }

    const char *targetText = alertStateText(state);
    const char *currentText = lv_label_get_text(label);
    if (currentText != nullptr && strcmp(currentText, targetText) == 0)
    {
        setIndicatorColor(indicator, state);
        return;
    }

    lv_label_set_text(label, targetText);
    setIndicatorColor(indicator, state);
}

AlertState sensorAlertState(bool enabled, const StatusSignal &signal, uint32_t now)
{
    if (!enabled)
    {
        return ALERT_STATE_OFF;
    }

    return isActive(signal, now) ? ALERT_STATE_ON : ALERT_STATE_FAIL;
}

AlertState motionAlertState(uint32_t now)
{
    return isActive(movementSignal, now) ? ALERT_STATE_ON : ALERT_STATE_FAIL;
}

AlertState wifiAlertState(uint32_t now)
{
    if (!credentialsConfigured())
    {
        return ALERT_STATE_OFF;
    }

    return isActive(wifiSignal, now) ? ALERT_STATE_ON : ALERT_STATE_FAIL;
}

AlertState firebaseAlertState(uint32_t now)
{
    if (!firebaseEnabled)
    {
        return ALERT_STATE_OFF;
    }

    return isActive(firebaseSignal, now) ? ALERT_STATE_ON : ALERT_STATE_FAIL;
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

void refreshAlertScreen(uint32_t now)
{
    setAlertVisual(ui_Label42, ui_Panel28, sensorAlertState(sensorEnabled[APP_SENSOR_TEMPERATURE], temperatureSignal, now));
    setAlertVisual(ui_Label45, ui_Panel31, sensorAlertState(sensorEnabled[APP_SENSOR_HUMIDITY], humiditySignal, now));
    setAlertVisual(ui_Label43, ui_Panel29, sensorAlertState(sensorEnabled[APP_SENSOR_POWER], powerSignal, now));
    setAlertVisual(ui_Label44, ui_Panel30, motionAlertState(now));
    setAlertVisual(ui_Label46, ui_Panel32, wifiAlertState(now));
    setAlertVisual(ui_Label47, ui_Panel33, firebaseAlertState(now));
}

void refreshHomeScreen()
{
    char buffer[24];
    uint32_t now = millis();

    refreshClockLabel();

    if (!sensorEnabled[APP_SENSOR_TEMPERATURE])
    {
        setLabelTextIfChanged(ui_Label3, "-- C");
    }
    else if (!isnan(lastTemperatureC))
    {
        snprintf(buffer, sizeof(buffer), "%.1f C", lastTemperatureC);
        setLabelTextIfChanged(ui_Label3, buffer);
    }
    else
    {
        setLabelTextIfChanged(ui_Label3, "-- C");
    }

    if (!sensorEnabled[APP_SENSOR_HUMIDITY])
    {
        setLabelTextIfChanged(ui_Label4, "-- %");
    }
    else if (!isnan(lastHumidityPercent))
    {
        snprintf(buffer, sizeof(buffer), "%.1f %%", lastHumidityPercent);
        setLabelTextIfChanged(ui_Label4, buffer);
    }
    else
    {
        setLabelTextIfChanged(ui_Label4, "-- %");
    }

    if (motionStatusLabel != nullptr && motionStatusDot != nullptr)
    {
        if (motionInputHigh)
        {
            setLabelTextIfChanged(motionStatusLabel, "PIR ON");
            lv_obj_set_style_text_color(motionStatusLabel, lv_color_hex(0x1E8E3E), LV_PART_MAIN | LV_STATE_DEFAULT);
            lv_obj_set_style_bg_color(motionStatusDot, lv_color_hex(0x2EAF4A), LV_PART_MAIN | LV_STATE_DEFAULT);
        }
        else
        {
            setLabelTextIfChanged(motionStatusLabel, "PIR OFF");
            lv_obj_set_style_text_color(motionStatusLabel, lv_color_hex(0x5A6572), LV_PART_MAIN | LV_STATE_DEFAULT);
            lv_obj_set_style_bg_color(motionStatusDot, lv_color_hex(0x9AA4B2), LV_PART_MAIN | LV_STATE_DEFAULT);
        }
    }

    refreshMotorControl();
}

void refreshWifiLabels()
{
    if (WiFi.status() == WL_CONNECTED)
    {
        snprintf(wifiStatusText, sizeof(wifiStatusText), "Estado: Conectado");
        snprintf(wifiSsidText, sizeof(wifiSsidText), " Red Actual: %s", WiFi.SSID().c_str());
        snprintf(wifiIpText, sizeof(wifiIpText), " IP: %s", WiFi.localIP().toString().c_str());
    }
    else if (credentialsConfigured())
    {
        snprintf(wifiStatusText, sizeof(wifiStatusText), "Estado: Conectando...");
        snprintf(wifiSsidText, sizeof(wifiSsidText), " Red Actual: %s", configuredWifiSsid);
        snprintf(wifiIpText, sizeof(wifiIpText), " IP: --");
    }
    else if (wifiNetworkCount > 0)
    {
        snprintf(wifiStatusText, sizeof(wifiStatusText), "Estado: Selecciona una red");
        snprintf(wifiSsidText, sizeof(wifiSsidText), " Red Actual: --");
        snprintf(wifiIpText, sizeof(wifiIpText), " IP: --");
    }
    else
    {
        snprintf(wifiStatusText, sizeof(wifiStatusText), "Estado: Buscando redes");
        snprintf(wifiSsidText, sizeof(wifiSsidText), " Red Actual: --");
        snprintf(wifiIpText, sizeof(wifiIpText), " IP: --");
    }

    setLabelTextIfChanged(ui_Label29, wifiStatusText);
    setLabelTextIfChanged(ui_Label27, wifiSsidText);
    setLabelTextIfChanged(ui_Label28, wifiIpText);
}

void clearSensorState(AppSensorChannel channel)
{
    switch (channel)
    {
    case APP_SENSOR_HUMIDITY:
        clearSignal(humiditySignal);
        lastHumidityPercent = NAN;
        resetDhtFilter(humidityFilter);
        break;
    case APP_SENSOR_TEMPERATURE:
        clearSignal(temperatureSignal);
        lastTemperatureC = NAN;
        resetDhtFilter(temperatureFilter);
        break;
    case APP_SENSOR_POWER:
        clearSignal(powerSignal);
        lastPowerAverage = 0;
        powerSampleAvailable = false;
        break;
    case APP_SENSOR_MOTION:
        clearSignal(movementSignal);
        motionInputHigh = false;
        digitalWrite(PIR_RELAY_PIN, LOW);
        break;
    default:
        break;
    }
}

void logTemperatureSample(float value)
{
    if (!loggingEnabled[APP_SENSOR_TEMPERATURE])
    {
        return;
    }

    TimeSnapshot snapshot = getCurrentTimeSnapshot();
    DayHistory &history = ensureHistoryDay(snapshot);
    addMetricSample(history.temperature[snapshot.hour], value);
    markHistoryDirty(snapshot.weekdayIndex);
}

void logHumiditySample(float value)
{
    if (!loggingEnabled[APP_SENSOR_HUMIDITY])
    {
        return;
    }

    TimeSnapshot snapshot = getCurrentTimeSnapshot();
    DayHistory &history = ensureHistoryDay(snapshot);
    addMetricSample(history.humidity[snapshot.hour], value);
    markHistoryDirty(snapshot.weekdayIndex);
}

void logPowerSample(int rawAverage)
{
    if (!loggingEnabled[APP_SENSOR_POWER])
    {
        return;
    }

    TimeSnapshot snapshot = getCurrentTimeSnapshot();
    DayHistory &history = ensureHistoryDay(snapshot);
    addMetricSample(history.power[snapshot.hour], static_cast<float>(rawAverageToPowerPercent(rawAverage)));
    markHistoryDirty(snapshot.weekdayIndex);
}

void ensureWifiStarted()
{
    if (!credentialsConfigured())
    {
        return;
    }

    WiFi.mode(WIFI_STA);
    if (!wifiStarted)
    {
        WiFi.begin(configuredWifiSsid, configuredWifiPassword);
        wifiStarted = true;
        Serial.println("WiFi: intentando conexion...");
    }
}

void startWifiScan()
{
    WiFi.mode(WIFI_STA);
    WiFi.scanDelete();
    int result = WiFi.scanNetworks(true, true);
    if (result != WIFI_SCAN_FAILED_CODE)
    {
        wifiScanRequested = false;
        lastWifiScanMs = millis();
        Serial.println("WiFi: escaneo iniciado.");
    }
}

void updateWifiOptionsFromScan(int networkCount)
{
    wifiOptions[0] = '\0';
    wifiNetworkCount = 0;
    memset(wifiNetworkNames, 0, sizeof(wifiNetworkNames));

    if (networkCount <= 0)
    {
        strncpy(wifiOptions, "Sin redes encontradas", sizeof(wifiOptions) - 1);
        wifiOptions[sizeof(wifiOptions) - 1] = '\0';
        WiFi.scanDelete();
        return;
    }

    for (int index = 0; index < networkCount && wifiNetworkCount < 16; ++index)
    {
        String ssid = WiFi.SSID(index);
        if (ssid.length() == 0)
        {
            continue;
        }

        if (wifiOptions[0] != '\0')
        {
            strncat(wifiOptions, "\n", sizeof(wifiOptions) - strlen(wifiOptions) - 1);
        }
        strncat(wifiOptions, ssid.c_str(), sizeof(wifiOptions) - strlen(wifiOptions) - 1);
        strncpy(wifiNetworkNames[wifiNetworkCount], ssid.c_str(), sizeof(wifiNetworkNames[wifiNetworkCount]) - 1);
        ++wifiNetworkCount;
    }

    if (wifiNetworkCount == 0)
    {
        strncpy(wifiOptions, "Sin redes encontradas", sizeof(wifiOptions) - 1);
        wifiOptions[sizeof(wifiOptions) - 1] = '\0';
    }

    WiFi.scanDelete();
}

void pollWifiScan()
{
    int scanStatus = WiFi.scanComplete();
    if (scanStatus == WIFI_SCAN_RUNNING)
    {
        return;
    }

    if (scanStatus >= 0)
    {
        updateWifiOptionsFromScan(scanStatus);
        return;
    }

    if (wifiScanRequested || (millis() - lastWifiScanMs) >= WIFI_SCAN_RETRY_MS)
    {
        startWifiScan();
    }
}

void pollWifi(uint32_t now)
{
    pollWifiScan();

    if (!credentialsConfigured())
    {
        refreshWifiLabels();
        return;
    }

    ensureWifiStarted();

    if (WiFi.status() == WL_CONNECTED)
    {
        maybeConfigureNetworkTime();
        recalibrateTimeFromWifi(now);
        markActive(wifiSignal, now);
        refreshWifiLabels();
        return;
    }

    if ((now - lastWifiRetryMs) >= WIFI_RETRY_INTERVAL_MS)
    {
        lastWifiRetryMs = now;
        WiFi.disconnect();
        WiFi.begin(configuredWifiSsid, configuredWifiPassword);
        Serial.println("WiFi: reintentando conexion...");
    }

    refreshWifiLabels();
}

void configureFirebase()
{
#if APP_RUNTIME_HAS_FIREBASE
    if (firebaseConfigured || !firebaseEnabled || !firebaseConfiguredOnDevice() || WiFi.status() != WL_CONNECTED)
    {
        return;
    }

    firebaseConfig.api_key = DEFAULT_FIREBASE_API_KEY;
    firebaseConfig.database_url = firebaseDatabaseUrl;
    firebaseConfig.signer.test_mode = false;
    firebaseData.setBSSLBufferSize(4096, 4096);
    firebaseCommandData.setBSSLBufferSize(4096, 4096);
    Firebase.reconnectNetwork(true);

    if (Firebase.signUp(&firebaseConfig, &firebaseAuth, "", ""))
    {
        Serial.println("Firebase: autenticacion anonima inicializada.");
    }
    else
    {
        firebaseConfig.signer.test_mode = true;
        Serial.print("Firebase auth fallback: ");
        Serial.println(firebaseConfig.signer.signupError.message);
    }

    Firebase.begin(&firebaseConfig, &firebaseAuth);
    firebaseConfigured = true;
    Serial.println("Firebase: cliente inicializado.");
#endif
}

const char *rawWifiSsid()
{
    static char ssidBuffer[33];
    if (WiFi.status() == WL_CONNECTED)
    {
        snprintf(ssidBuffer, sizeof(ssidBuffer), "%s", WiFi.SSID().c_str());
        return ssidBuffer;
    }

    return configuredWifiSsid;
}

const char *rawWifiIp()
{
    static char ipBuffer[24];
    if (WiFi.status() == WL_CONNECTED)
    {
        snprintf(ipBuffer, sizeof(ipBuffer), "%s", WiFi.localIP().toString().c_str());
    }
    else
    {
        snprintf(ipBuffer, sizeof(ipBuffer), "");
    }

    return ipBuffer;
}

bool isMotionActive(uint32_t now)
{
    return sensorEnabled[APP_SENSOR_MOTION] && isActive(movementSignal, now);
}

const char *motorModeText()
{
    return motorMode == MOTOR_MODE_MANUAL ? MOTOR_MODE_MANUAL_TEXT : MOTOR_MODE_AUTOMATIC_TEXT;
}

const char *motorStatusText()
{
    return motorRunning ? MOTOR_STATUS_RUNNING : MOTOR_STATUS_STOPPED;
}

bool currentUnixTimeMs(int64_t &unixTimeMs)
{
    time_t now = time(nullptr);
    if (now < 1700000000)
    {
        return false;
    }

    unixTimeMs = static_cast<int64_t>(now) * 1000LL;
    return true;
}

bool firebaseCommandTimestampIsFresh(int64_t timestampMs)
{
    int64_t nowMs = 0;
    if (!currentUnixTimeMs(nowMs))
    {
        return false;
    }

    int64_t ageMs = nowMs - timestampMs;
    return ageMs >= -30000 && ageMs <= FIREBASE_COMMAND_MAX_AGE_MS;
}

#if APP_RUNTIME_HAS_FIREBASE
bool readJsonString(FirebaseJson &json, const char *path, String &value)
{
    FirebaseJsonData result;
    json.get(result, path);
    if (!result.success || result.type == "null")
    {
        return false;
    }

    value = result.to<String>();
    value.trim();
    return value.length() > 0;
}

bool readJsonInt(FirebaseJson &json, const char *path, int &value)
{
    FirebaseJsonData result;
    json.get(result, path);
    if (!result.success || result.type == "null")
    {
        return false;
    }

    if (result.type == "int")
    {
        value = result.to<int>();
        return true;
    }
    if (result.type == "double" || result.type == "float")
    {
        value = static_cast<int>(lroundf(result.to<float>()));
        return true;
    }
    if (result.type == "string")
    {
        value = result.to<String>().toInt();
        return true;
    }

    return false;
}

bool readJsonBool(FirebaseJson &json, const char *path, bool &value)
{
    FirebaseJsonData result;
    json.get(result, path);
    if (!result.success || result.type == "null")
    {
        return false;
    }

    if (result.type == "bool")
    {
        value = result.to<bool>();
        return true;
    }
    if (result.type == "int")
    {
        value = result.to<int>() != 0;
        return true;
    }
    if (result.type == "double" || result.type == "float")
    {
        value = fabsf(result.to<float>()) > 0.001f;
        return true;
    }
    if (result.type == "string")
    {
        String normalized = result.to<String>();
        normalized.trim();
        normalized.toLowerCase();
        value = normalized == "true" || normalized == "1" || normalized == "on" || normalized == "encendido";
        return true;
    }

    return false;
}

bool readJsonTimestamp(FirebaseJson &json, int64_t &timestampMs)
{
    FirebaseJsonData result;
    json.get(result, "ts");
    if (!result.success || result.type == "null")
    {
        return false;
    }

    if (result.type == "int")
    {
        timestampMs = static_cast<int64_t>(result.to<int>());
        return true;
    }
    if (result.type == "double" || result.type == "float")
    {
        timestampMs = static_cast<int64_t>(result.to<double>());
        return true;
    }
    if (result.type == "string")
    {
        timestampMs = static_cast<int64_t>(atoll(result.to<String>().c_str()));
        return timestampMs > 0;
    }

    return false;
}

void applyRemoteFirebaseCommands(FirebaseJson &commands)
{
    String stateValue;
    if (readJsonString(commands, "estado", stateValue))
    {
        stateValue.toLowerCase();
        if (stateValue == "running")
        {
            setMotorRunningLocal(true);
        }
        else if (stateValue == "stopped")
        {
            setMotorRunningLocal(false);
        }
    }

    String modeValue;
    if (readJsonString(commands, "modo", modeValue))
    {
        modeValue.toLowerCase();
        if (modeValue == "manual")
        {
            setMotorModeLocal(MOTOR_MODE_MANUAL);
        }
        else if (modeValue == "automatico" || modeValue == "automatic")
        {
            setMotorModeLocal(MOTOR_MODE_AUTOMATIC);
        }
    }

    int speedValue = 0;
    if (readJsonInt(commands, "velocidad", speedValue))
    {
        setManualMotorSpeedLocal(speedValue);
    }

    int setpointValue = 0;
    if (readJsonInt(commands, "setpoint", setpointValue))
    {
        int currentSetpoint = ui_input_overlay_get_setpoint();
        int clampedSetpoint = constrainSetpoint(static_cast<float>(setpointValue));
        if (currentSetpoint != clampedSetpoint)
        {
            ui_input_overlay_set_setpoint(clampedSetpoint);
            refreshHomeScreen();
        }
    }

    bool loggingValue = false;
    if (readJsonBool(commands, "config/guardarTemperatura", loggingValue) && loggingEnabled[APP_SENSOR_TEMPERATURE] != loggingValue)
    {
        app_runtime_set_logging_enabled(APP_SENSOR_TEMPERATURE, loggingValue);
    }
    if (readJsonBool(commands, "config/guardarHumedad", loggingValue) && loggingEnabled[APP_SENSOR_HUMIDITY] != loggingValue)
    {
        app_runtime_set_logging_enabled(APP_SENSOR_HUMIDITY, loggingValue);
    }
    if (readJsonBool(commands, "config/guardarPotencia", loggingValue) && loggingEnabled[APP_SENSOR_POWER] != loggingValue)
    {
        app_runtime_set_logging_enabled(APP_SENSOR_POWER, loggingValue);
    }
    if (readJsonBool(commands, "config/guardarMovimiento", loggingValue) && loggingEnabled[APP_SENSOR_MOTION] != loggingValue)
    {
        app_runtime_set_logging_enabled(APP_SENSOR_MOTION, loggingValue);
    }
}

void pollFirebaseCommands(uint32_t now)
{
    if ((now - lastFirebaseCommandPollMs) < FIREBASE_COMMAND_POLL_INTERVAL_MS)
    {
        return;
    }
    lastFirebaseCommandPollMs = now;

    FirebaseJson commands;
    if (!Firebase.RTDB.getJSON(&firebaseCommandData, FIREBASE_COMMAND_PATH, &commands))
    {
        return;
    }

    int64_t commandTs = 0;
    if (!readJsonTimestamp(commands, commandTs))
    {
        return;
    }

    if (commandTs <= lastFirebaseCommandTs)
    {
        firebaseCommandsPrimed = true;
        return;
    }

    bool isFresh = firebaseCommandTimestampIsFresh(commandTs);
    lastFirebaseCommandTs = commandTs;

    if (!firebaseCommandsPrimed)
    {
        firebaseCommandsPrimed = true;
        if (!isFresh)
        {
            return;
        }
    }

    if (!isFresh)
    {
        return;
    }

    applyRemoteFirebaseCommands(commands);
}

bool appendHistoryArray(FirebaseJsonArray &jsonArray, const HourlyMetric *metrics)
{
    if (metrics == nullptr)
    {
        return false;
    }

    for (uint8_t index = 0; index < APP_HISTORY_POINT_COUNT; ++index)
    {
        if (metrics[index].count == 0)
        {
            jsonArray.add(0);
            continue;
        }

        jsonArray.add(static_cast<int>(lroundf(metrics[index].sum / metrics[index].count)));
    }
    return true;
}
#endif

bool syncFirebaseHistoryDay(uint8_t weekdayIndex)
{
#if APP_RUNTIME_HAS_FIREBASE
    if (weekdayIndex >= HISTORY_DAY_COUNT)
    {
        return false;
    }

    const DayHistory &history = weeklyHistory[weekdayIndex];
    const char *dayName = HISTORY_DAY_NAMES[weekdayIndex];

    FirebaseJson meta;
    meta.set("dayKey", history.dayKey == INT32_MIN ? 0 : history.dayKey);

    String basePath = String(FIREBASE_ROOT_PATH) + "/historico/" + dayName;
    if (!Firebase.updateNode(firebaseData, basePath.c_str(), meta))
    {
        return false;
    }

    FirebaseJsonArray temperatureArray;
    FirebaseJsonArray humidityArray;
    FirebaseJsonArray powerArray;
    appendHistoryArray(temperatureArray, history.temperature);
    appendHistoryArray(humidityArray, history.humidity);
    appendHistoryArray(powerArray, history.power);

    if (!Firebase.setArray(firebaseData, (basePath + "/temperatura").c_str(), temperatureArray))
    {
        return false;
    }
    if (!Firebase.setArray(firebaseData, (basePath + "/humedad").c_str(), humidityArray))
    {
        return false;
    }
    if (!Firebase.setArray(firebaseData, (basePath + "/potencia").c_str(), powerArray))
    {
        return false;
    }

    historyDirty[weekdayIndex] = false;
    return true;
#else
    (void)weekdayIndex;
    return false;
#endif
}

bool syncFirebaseLiveSnapshot(uint32_t now)
{
#if APP_RUNTIME_HAS_FIREBASE
    FirebaseJson liveData;
    liveData.set("heartbeat", static_cast<int>(now / 1000));
    liveData.set("temperatura", app_runtime_has_temperature() ? lastTemperatureC : 0.0f);
    liveData.set("humedad", app_runtime_has_humidity() ? lastHumidityPercent : 0.0f);
    liveData.set("potencia", app_runtime_has_power() ? app_runtime_get_power_percent() : 0);
    liveData.set("movimiento", isMotionActive(now));
    liveData.set("velocidad", motorSpeedPercent);
    liveData.set("estado", motorStatusText());
    liveData.set("modo", motorModeText());
    liveData.set("setpoint", ui_input_overlay_get_setpoint());
    liveData.set("wifi/ssid", rawWifiSsid());
    liveData.set("wifi/ip", rawWifiIp());
    liveData.set("wifi/conectado", WiFi.status() == WL_CONNECTED);
    liveData.set("config/guardarHumedad", loggingEnabled[APP_SENSOR_HUMIDITY]);
    liveData.set("config/guardarTemperatura", loggingEnabled[APP_SENSOR_TEMPERATURE]);
    liveData.set("config/guardarPotencia", loggingEnabled[APP_SENSOR_POWER]);
    liveData.set("config/guardarMovimiento", loggingEnabled[APP_SENSOR_MOTION]);

    if (!Firebase.updateNode(firebaseData, FIREBASE_ROOT_PATH, liveData))
    {
        return false;
    }

    FirebaseJson legacySensors;
    legacySensors.set("temperatura", app_runtime_has_temperature() ? static_cast<int>(lroundf(lastTemperatureC)) : 0);
    legacySensors.set("humedad", app_runtime_has_humidity() ? static_cast<int>(lroundf(lastHumidityPercent)) : 0);
    return Firebase.updateNode(firebaseData, "/sensores", legacySensors);
#else
    (void)now;
    return false;
#endif
}

void pollDht(uint32_t now)
{
    bool shouldReadDht = sensorEnabled[APP_SENSOR_TEMPERATURE] || sensorEnabled[APP_SENSOR_HUMIDITY];
    if (!shouldReadDht)
    {
        return;
    }

    if ((now - lastDhtReadMs) < DHT_READ_INTERVAL_MS)
    {
        return;
    }

    lastDhtReadMs = now;

    float temperatureC = NAN;
    float humidityPercent = NAN;

    for (uint8_t attempt = 0; attempt < DHT_READ_RETRIES; ++attempt)
    {
        temperatureC = dht.readTemperature();
        humidityPercent = dht.readHumidity();
        if (!isnan(temperatureC) && !isnan(humidityPercent))
        {
            break;
        }

        if (DHT_READ_RETRY_DELAY_MS > 0)
        {
            delay(DHT_READ_RETRY_DELAY_MS);
        }
    }

    bool temperatureAccepted = acceptDhtReading(temperatureFilter,
                                                temperatureC,
                                                DHT_TEMPERATURE_MIN_C,
                                                DHT_TEMPERATURE_MAX_C,
                                                DHT_MAX_TEMPERATURE_STEP_C,
                                                DHT_PENDING_TEMPERATURE_WINDOW_C,
                                                lastTemperatureC);
    bool humidityAccepted = acceptDhtReading(humidityFilter,
                                             humidityPercent,
                                             DHT_HUMIDITY_MIN_PERCENT,
                                             DHT_HUMIDITY_MAX_PERCENT,
                                             DHT_MAX_HUMIDITY_STEP_PERCENT,
                                             DHT_PENDING_HUMIDITY_WINDOW_PERCENT,
                                             lastHumidityPercent);

    if (sensorEnabled[APP_SENSOR_TEMPERATURE])
    {
        if (isDhtReadingInRange(temperatureC, DHT_TEMPERATURE_MIN_C, DHT_TEMPERATURE_MAX_C))
        {
            markActive(temperatureSignal, now);
        }
        else if (temperatureFilter.invalidCount >= DHT_FAILURES_BEFORE_CLEAR)
        {
            clearSignal(temperatureSignal);
        }

        if (temperatureAccepted)
        {
            logTemperatureSample(lastTemperatureC);
        }
    }

    if (sensorEnabled[APP_SENSOR_HUMIDITY])
    {
        if (isDhtReadingInRange(humidityPercent, DHT_HUMIDITY_MIN_PERCENT, DHT_HUMIDITY_MAX_PERCENT))
        {
            markActive(humiditySignal, now);
        }
        else if (humidityFilter.invalidCount >= DHT_FAILURES_BEFORE_CLEAR)
        {
            clearSignal(humiditySignal);
        }

        if (humidityAccepted)
        {
            logHumiditySample(lastHumidityPercent);
        }
    }

    bool shouldReportTemperatureRead = sensorEnabled[APP_SENSOR_TEMPERATURE] && !temperatureAccepted;
    bool shouldReportHumidityRead = sensorEnabled[APP_SENSOR_HUMIDITY] && !humidityAccepted;
    if (shouldReportTemperatureRead || shouldReportHumidityRead)
    {
        Serial.println("DHT11: lectura descartada por invalida o inestable.");
    }
}

PowerWindow samplePowerSensor()
{
    int minValue = 4095;
    int maxValue = 0;
    uint32_t sum = 0;

    for (size_t sample = 0; sample < POWER_SAMPLE_COUNT; ++sample)
    {
        int raw = analogRead(POWER_SENSOR_PIN);
        minValue = min(minValue, raw);
        maxValue = max(maxValue, raw);
        sum += static_cast<uint32_t>(raw);
        delayMicroseconds(150);
    }

    PowerWindow window;
    window.average = static_cast<int>(sum / POWER_SAMPLE_COUNT);
    window.span = maxValue - minValue;
    return window;
}

void pollPowerSensor(uint32_t now)
{
    if (!sensorEnabled[APP_SENSOR_POWER] || (now - lastPowerReadMs) < POWER_READ_INTERVAL_MS)
    {
        return;
    }

    lastPowerReadMs = now;
    PowerWindow window = samplePowerSensor();
    if (!isPowerWindowValid(window))
    {
        lastPowerAverage = 0;
        powerSampleAvailable = false;
        clearSignal(powerSignal);
        Serial.println("ZMCT103C: lectura invalida.");
        return;
    }

    lastPowerAverage = window.average;
    powerSampleAvailable = true;
    markActive(powerSignal, now);
    logPowerSample(window.average);
}

void pollMotionSensor(uint32_t now)
{
    if ((now - lastMotionReadMs) < MOTION_READ_INTERVAL_MS)
    {
        updatePirRelayOutput(now);
        return;
    }

    lastMotionReadMs = now;
    motionInputHigh = digitalRead(MOTION_SENSOR_PIN) == HIGH;
    if (motionInputHigh)
    {
        markActive(movementSignal, now);
    }
    updatePirRelayOutput(now);
}

void pollFirebase(uint32_t now)
{
#if APP_RUNTIME_HAS_FIREBASE
    if (!firebaseEnabled || !credentialsConfigured() || !firebaseConfiguredOnDevice())
    {
        firebaseCommandsPrimed = false;
        lastFirebaseCommandTs = 0;
        return;
    }

    configureFirebase();
    if (!firebaseConfigured || WiFi.status() != WL_CONNECTED)
    {
        firebaseCommandsPrimed = false;
        return;
    }

    if (!Firebase.ready())
    {
        return;
    }

    pollFirebaseCommands(now);

    if ((now - lastFirebaseHeartbeatMs) < FIREBASE_HEARTBEAT_INTERVAL_MS)
    {
        return;
    }

    lastFirebaseHeartbeatMs = now;

    bool ok = syncFirebaseLiveSnapshot(now);

    if (ok)
    {
        markActive(firebaseSignal, now);
    }
    else
    {
        Serial.print("Firebase error: ");
        Serial.println(firebaseData.errorReason());
        return;
    }

    if ((now - lastFirebaseHistorySyncMs) < FIREBASE_HISTORY_SYNC_INTERVAL_MS)
    {
        return;
    }

    for (uint8_t weekdayIndex = 0; weekdayIndex < HISTORY_DAY_COUNT; ++weekdayIndex)
    {
        if (!historyDirty[weekdayIndex])
        {
            continue;
        }

        lastFirebaseHistorySyncMs = now;
        if (syncFirebaseHistoryDay(weekdayIndex))
        {
            markActive(firebaseSignal, now);
        }
        else
        {
            Serial.print("Firebase error: ");
            Serial.println(firebaseData.errorReason());
        }
        break;
    }
#endif
}

void printStartupSummary()
{
    Serial.println("Alertas: GPIO 17 DHT11, GPIO 5 ZMCT103C, GPIO 16 movimiento, GPIO 15 salida relay PIR.");
    Serial.println("Config: sensores y guardado inician apagados hasta que los habilites.");
    if (!credentialsConfigured())
    {
        Serial.println("WiFi: sin credenciales por defecto. Usa la pantalla WIFI para conectarte.");
    }
    if (!firebaseConfiguredOnDevice())
    {
        Serial.println("Firebase: sin URL configurada. El envio seguira apagado.");
    }
#if !APP_RUNTIME_HAS_FIREBASE
    Serial.println("Alertas: falta la libreria FirebaseESP32, FIREBASE quedara en FALLA.");
#endif
}
} // namespace

void app_runtime_init()
{
    pinMode(POWER_SENSOR_PIN, INPUT_PULLDOWN);
    pinMode(MOTION_SENSOR_PIN, INPUT_PULLDOWN);
    pinMode(PIR_RELAY_PIN, OUTPUT);
    digitalWrite(PIR_RELAY_PIN, LOW);
    analogReadResolution(12);
    buildFallbackSnapshot();
    clearWeeklyHistoryInternal();
    markAllHistoryDirty();

    strncpy(configuredWifiSsid, DEFAULT_WIFI_SSID, sizeof(configuredWifiSsid) - 1);
    configuredWifiSsid[sizeof(configuredWifiSsid) - 1] = '\0';
    strncpy(configuredWifiPassword, DEFAULT_WIFI_PASSWORD, sizeof(configuredWifiPassword) - 1);
    configuredWifiPassword[sizeof(configuredWifiPassword) - 1] = '\0';
    strncpy(firebaseDatabaseUrl, DEFAULT_FIREBASE_DATABASE_URL, sizeof(firebaseDatabaseUrl) - 1);
    firebaseDatabaseUrl[sizeof(firebaseDatabaseUrl) - 1] = '\0';
    loadStoredWifiCredentials();
    firebaseEnabled = firebaseConfiguredOnDevice();
    networkTimeCalibrated = false;

    pinMode(DHT_PIN, INPUT_PULLUP);
    dht.begin();
    resetDhtFilter(temperatureFilter);
    resetDhtFilter(humidityFilter);

    wifiScanRequested = true;
    buildMotorInfoPanel();
    lv_dropdown_set_options(ui_Dropdown1, "AUTOMATICO\nMANUAL");
    lv_dropdown_set_selected(ui_Dropdown1, 0);
    lv_obj_add_event_cb(ui_Button2, motorStartEvent, LV_EVENT_ALL, nullptr);
    lv_obj_add_event_cb(ui_Button1, motorStopEvent, LV_EVENT_ALL, nullptr);
    lv_obj_add_event_cb(ui_Dropdown1, motorModeChangedEvent, LV_EVENT_ALL, nullptr);
    lv_obj_add_event_cb(ui_Arc1, motorArcChangedEvent, LV_EVENT_ALL, nullptr);
    printStartupSummary();
    refreshHomeScreen();
    refreshAlertScreen(millis());
    refreshWifiLabels();
}

void app_runtime_tick()
{
    uint32_t now = millis();
    purgeExpiredHistory(getCurrentTimeSnapshot().dayKey);

    pollWifi(now);
    pollDht(now);
    pollPowerSensor(now);
    pollMotionSensor(now);
    pollFirebase(now);
    updatePirRelayOutput(now);

    if ((now - lastUiRefreshMs) < UI_REFRESH_INTERVAL_MS)
    {
        return;
    }

    lastUiRefreshMs = now;
    refreshHomeScreen();
    refreshAlertScreen(now);
    refreshWifiLabels();
}

void app_runtime_request_refresh()
{
    lastDhtReadMs = 0;
    lastPowerReadMs = 0;
    lastMotionReadMs = 0;
    lastWifiRetryMs = 0;
    lastFirebaseHeartbeatMs = 0;
    lastFirebaseHistorySyncMs = 0;
    wifiScanRequested = true;
    refreshHomeScreen();
    refreshAlertScreen(millis());
    refreshWifiLabels();
}

bool app_runtime_is_sensor_enabled(AppSensorChannel channel)
{
    return channel < APP_SENSOR_COUNT ? sensorEnabled[channel] : false;
}

void app_runtime_set_sensor_enabled(AppSensorChannel channel, bool enabled)
{
    if (channel >= APP_SENSOR_COUNT)
    {
        return;
    }

    sensorEnabled[channel] = enabled;
    if (!enabled)
    {
        clearSensorState(channel);
    }
    else if (channel == APP_SENSOR_TEMPERATURE || channel == APP_SENSOR_HUMIDITY)
    {
        lastDhtReadMs = 0;
    }

    refreshHomeScreen();
    refreshAlertScreen(millis());
}

bool app_runtime_is_logging_enabled(AppSensorChannel channel)
{
    return channel < APP_SENSOR_COUNT ? loggingEnabled[channel] : false;
}

lv_obj_t *loggingSwitchForChannel(AppSensorChannel channel)
{
    switch (channel)
    {
    case APP_SENSOR_HUMIDITY:
        return ui_Switch5;
    case APP_SENSOR_TEMPERATURE:
        return ui_Switch6;
    case APP_SENSOR_POWER:
        return ui_Switch7;
    case APP_SENSOR_MOTION:
        return ui_Switch8;
    default:
        return nullptr;
    }
}

void syncLoggingSwitchState(AppSensorChannel channel, bool enabled)
{
    lv_obj_t *saveSwitch = loggingSwitchForChannel(channel);
    if (saveSwitch == nullptr)
    {
        return;
    }

    bool isChecked = lv_obj_has_state(saveSwitch, LV_STATE_CHECKED);
    if (enabled && !isChecked)
    {
        lv_obj_add_state(saveSwitch, LV_STATE_CHECKED);
    }
    else if (!enabled && isChecked)
    {
        lv_obj_clear_state(saveSwitch, LV_STATE_CHECKED);
    }
}

void app_runtime_set_logging_enabled(AppSensorChannel channel, bool enabled)
{
    if (channel >= APP_SENSOR_COUNT)
    {
        return;
    }

    syncLoggingSwitchState(channel, enabled);
    if (loggingEnabled[channel] == enabled)
    {
        return;
    }

    loggingEnabled[channel] = enabled;
    markAllHistoryDirty();
}

bool app_runtime_is_firebase_enabled()
{
    return firebaseEnabled;
}

void app_runtime_set_firebase_enabled(bool enabled)
{
    firebaseEnabled = enabled;
    if (!enabled)
    {
        firebaseConfigured = false;
        firebaseCommandsPrimed = false;
        lastFirebaseCommandTs = 0;
        clearSignal(firebaseSignal);
    }
    else
    {
        lastFirebaseHeartbeatMs = 0;
        lastFirebaseHistorySyncMs = 0;
        lastFirebaseCommandPollMs = 0;
        markAllHistoryDirty();
    }
    refreshAlertScreen(millis());
}

bool app_runtime_is_firebase_connected()
{
    return firebaseEnabled && isActive(firebaseSignal, millis());
}

bool app_runtime_has_temperature()
{
    return sensorEnabled[APP_SENSOR_TEMPERATURE] && !isnan(lastTemperatureC);
}

bool app_runtime_has_humidity()
{
    return sensorEnabled[APP_SENSOR_HUMIDITY] && !isnan(lastHumidityPercent);
}

bool app_runtime_has_power()
{
    return sensorEnabled[APP_SENSOR_POWER] && powerSampleAvailable;
}

float app_runtime_get_temperature()
{
    return lastTemperatureC;
}

float app_runtime_get_humidity()
{
    return lastHumidityPercent;
}

int app_runtime_get_power_average()
{
    return lastPowerAverage;
}

int app_runtime_get_power_percent()
{
    return rawAverageToPowerPercent(lastPowerAverage);
}

bool app_runtime_is_wifi_connected()
{
    return WiFi.status() == WL_CONNECTED;
}

const char *app_runtime_get_wifi_status_text()
{
    return wifiStatusText;
}

const char *app_runtime_get_wifi_ssid_text()
{
    return wifiSsidText;
}

const char *app_runtime_get_wifi_ip_text()
{
    return wifiIpText;
}

const char *app_runtime_get_wifi_ssid_raw()
{
    return rawWifiSsid();
}

const char *app_runtime_get_wifi_ip_raw()
{
    return rawWifiIp();
}

bool app_runtime_is_motor_running()
{
    return motorRunning;
}

const char *app_runtime_get_motor_mode_text()
{
    return motorModeText();
}

const char *app_runtime_get_motor_status_text()
{
    return motorStatusText();
}

int app_runtime_get_motor_speed_percent()
{
    return motorSpeedPercent;
}

int app_runtime_get_setpoint()
{
    return ui_input_overlay_get_setpoint();
}

bool app_runtime_is_motion_active()
{
    return isMotionActive(millis());
}

void app_runtime_clear_weekly_history()
{
    clearWeeklyHistoryInternal();
    markAllHistoryDirty();
}

uint8_t app_runtime_get_current_weekday_index()
{
    return getCurrentTimeSnapshot().weekdayIndex;
}

void app_runtime_copy_weekday_history(uint8_t weekdayIndex,
                                      lv_coord_t *temperature,
                                      lv_coord_t *humidity,
                                      lv_coord_t *power,
                                      uint8_t pointCount)
{
    if (weekdayIndex >= HISTORY_DAY_COUNT)
    {
        return;
    }

    const DayHistory &history = weeklyHistory[weekdayIndex];
    uint8_t limit = pointCount < APP_HISTORY_POINT_COUNT ? pointCount : APP_HISTORY_POINT_COUNT;
    for (uint8_t index = 0; index < limit; ++index)
    {
        if (temperature != nullptr)
        {
            temperature[index] = metricToChartValue(history.temperature[index]);
        }
        if (humidity != nullptr)
        {
            humidity[index] = metricToChartValue(history.humidity[index]);
        }
        if (power != nullptr)
        {
            power[index] = metricToChartValue(history.power[index]);
        }
    }
}

void app_runtime_request_wifi_scan()
{
    wifiScanRequested = true;
}

const char *app_runtime_get_wifi_options()
{
    return wifiOptions;
}

uint16_t app_runtime_get_wifi_network_count()
{
    return wifiNetworkCount;
}

bool app_runtime_connect_wifi(uint16_t optionIndex, const char *password)
{
    if (optionIndex >= wifiNetworkCount)
    {
        return false;
    }

    if (wifiNetworkNames[optionIndex][0] == '\0')
    {
        return false;
    }

    strncpy(configuredWifiSsid, wifiNetworkNames[optionIndex], sizeof(configuredWifiSsid) - 1);
    configuredWifiSsid[sizeof(configuredWifiSsid) - 1] = '\0';

    if (password == nullptr)
    {
        configuredWifiPassword[0] = '\0';
    }
    else
    {
        strncpy(configuredWifiPassword, password, sizeof(configuredWifiPassword) - 1);
        configuredWifiPassword[sizeof(configuredWifiPassword) - 1] = '\0';
    }

    wifiStarted = false;
    firebaseConfigured = false;
    lastWifiRetryMs = 0;
    lastFirebaseHeartbeatMs = 0;
    lastFirebaseHistorySyncMs = 0;
    storeWifiCredentials();
    ensureWifiStarted();
    refreshWifiLabels();
    return true;
}

void app_runtime_disconnect_wifi()
{
    WiFi.disconnect(true);
    configuredWifiSsid[0] = '\0';
    configuredWifiPassword[0] = '\0';
    wifiStarted = false;
    firebaseConfigured = false;
    clearStoredWifiCredentials();
    clearSignal(wifiSignal);
    clearSignal(firebaseSignal);
    refreshWifiLabels();
    refreshHomeScreen();
    refreshAlertScreen(millis());
}
