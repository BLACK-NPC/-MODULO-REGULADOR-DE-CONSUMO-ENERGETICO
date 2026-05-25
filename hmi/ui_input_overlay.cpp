#include "ui_input_overlay.h"

#include <Arduino.h>
#include <cstring>

#include "ui.h"

namespace
{
lv_obj_t *overlayPanel = nullptr;
lv_obj_t *overlayTitle = nullptr;
lv_obj_t *overlayInput = nullptr;
lv_obj_t *overlayKeyboard = nullptr;
lv_obj_t *activeSource = nullptr;
char wifiPassword[65] = "";

constexpr char WIFI_DEFAULT_TEXT[] = "Clave de wifi: ******";
constexpr char WIFI_PASSWORD_PREFIX[] = "Clave de wifi: ";
constexpr int SP_MIN_C = 18;
constexpr int SP_MAX_C = 35;
constexpr int SP_DEFAULT_C = 22;

bool isNumericField(lv_obj_t *source)
{
    return source == ui_TextArea1;
}

const char *getFieldTitle(lv_obj_t *source)
{
    if (source == ui_TextArea1)
    {
        return "EDITAR SP (18-35 C)";
    }
    if (source == ui_TextArea3)
    {
        return "CLAVE WIFI";
    }
    return "EDITAR VALOR";
}

void setMaskedWifiPasswordText()
{
    if (ui_TextArea3 == nullptr)
    {
        return;
    }

    if (wifiPassword[0] == '\0')
    {
        lv_textarea_set_text(ui_TextArea3, WIFI_DEFAULT_TEXT);
        return;
    }

    char maskedText[96];
    snprintf(maskedText, sizeof(maskedText), "%s", WIFI_PASSWORD_PREFIX);
    size_t prefixLength = strlen(maskedText);
    size_t passwordLength = strlen(wifiPassword);
    size_t maxMaskLength = sizeof(maskedText) - prefixLength - 1;
    size_t maskLength = passwordLength < maxMaskLength ? passwordLength : maxMaskLength;

    for (size_t index = 0; index < maskLength; ++index)
    {
        maskedText[prefixLength + index] = '*';
    }
    maskedText[prefixLength + maskLength] = '\0';
    lv_textarea_set_text(ui_TextArea3, maskedText);
}

void formatSetpointText(const char *input, char *output, size_t outputSize)
{
    if (output == nullptr || outputSize == 0)
    {
        return;
    }

    int setpoint = SP_DEFAULT_C;
    if (input != nullptr && input[0] != '\0')
    {
        setpoint = static_cast<int>(lroundf(atof(input)));
    }

    setpoint = constrain(setpoint, SP_MIN_C, SP_MAX_C);
    snprintf(output, outputSize, "%d", setpoint);
}

void hideGeneratedKeyboards()
{
    lv_obj_add_flag(ui_Keyboard1, LV_OBJ_FLAG_HIDDEN);
    lv_obj_add_flag(ui_Keyboard2, LV_OBJ_FLAG_HIDDEN);
    lv_obj_add_flag(ui_Keyboard3, LV_OBJ_FLAG_HIDDEN);

    lv_keyboard_set_textarea(ui_Keyboard1, nullptr);
    lv_keyboard_set_textarea(ui_Keyboard2, nullptr);
    lv_keyboard_set_textarea(ui_Keyboard3, nullptr);
}

void styleSourceField(lv_obj_t *source)
{
    if (source == nullptr)
    {
        return;
    }

    lv_textarea_set_one_line(source, true);
    lv_obj_clear_flag(source, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_clear_flag(source, LV_OBJ_FLAG_SCROLL_ON_FOCUS);
    lv_obj_set_scrollbar_mode(source, LV_SCROLLBAR_MODE_OFF);
    lv_obj_set_style_text_align(source, LV_TEXT_ALIGN_CENTER, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_pad_left(source, 6, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_pad_right(source, 6, LV_PART_MAIN | LV_STATE_DEFAULT);
}

void configureSourceFields()
{
    styleSourceField(ui_TextArea1);
    styleSourceField(ui_TextArea3);

    lv_obj_set_width(ui_TextArea1, 58);
    lv_obj_set_width(ui_TextArea3, 180);
    lv_obj_set_x(ui_TextArea1, -150);

    lv_textarea_set_max_length(ui_TextArea1, 2);
    lv_textarea_set_max_length(ui_TextArea3, 64);

    lv_textarea_set_accepted_chars(ui_TextArea1, "0123456789");

    lv_textarea_set_placeholder_text(ui_TextArea3, "Clave de WiFi");
    setMaskedWifiPasswordText();
}

void hideOverlay(bool keepEditedValue)
{
    if (overlayPanel == nullptr || overlayKeyboard == nullptr || overlayInput == nullptr)
    {
        return;
    }

    if (keepEditedValue && activeSource != nullptr)
    {
        if (activeSource == ui_TextArea1)
        {
            char setpointText[8];
            formatSetpointText(lv_textarea_get_text(overlayInput), setpointText, sizeof(setpointText));
            lv_textarea_set_text(activeSource, setpointText);
        }
        else if (activeSource == ui_TextArea3)
        {
            strncpy(wifiPassword, lv_textarea_get_text(overlayInput), sizeof(wifiPassword) - 1);
            wifiPassword[sizeof(wifiPassword) - 1] = '\0';
            setMaskedWifiPasswordText();
        }
        else
        {
            lv_textarea_set_text(activeSource, lv_textarea_get_text(overlayInput));
        }
    }

    lv_keyboard_set_textarea(overlayKeyboard, nullptr);
    lv_textarea_set_text(overlayInput, "");
    lv_obj_add_flag(overlayPanel, LV_OBJ_FLAG_HIDDEN);
    lv_obj_add_flag(overlayKeyboard, LV_OBJ_FLAG_HIDDEN);
    activeSource = nullptr;
}

void openOverlay(lv_obj_t *source)
{
    if (source == nullptr || overlayPanel == nullptr || overlayKeyboard == nullptr || overlayInput == nullptr)
    {
        return;
    }

    activeSource = source;
    lv_label_set_text(overlayTitle, getFieldTitle(source));
    lv_textarea_set_text(overlayInput, source == ui_TextArea3 ? wifiPassword : lv_textarea_get_text(source));
    lv_keyboard_set_textarea(overlayKeyboard, overlayInput);
    lv_keyboard_set_mode(overlayKeyboard, isNumericField(source) ? LV_KEYBOARD_MODE_NUMBER : LV_KEYBOARD_MODE_TEXT_LOWER);
    lv_textarea_set_accepted_chars(overlayInput, isNumericField(source) ? "0123456789" : nullptr);
    lv_textarea_set_max_length(overlayInput, isNumericField(source) ? 2 : 64);
    lv_textarea_set_password_mode(overlayInput, false);
    lv_obj_clear_flag(overlayPanel, LV_OBJ_FLAG_HIDDEN);
    lv_obj_clear_flag(overlayKeyboard, LV_OBJ_FLAG_HIDDEN);
    lv_obj_move_foreground(overlayPanel);
    lv_obj_move_foreground(overlayKeyboard);
    lv_obj_scroll_to_view(source, LV_ANIM_OFF);
}

void sourceTextareaEvent(lv_event_t *e)
{
    lv_event_code_t code = lv_event_get_code(e);
    if (code != LV_EVENT_CLICKED)
    {
        return;
    }

    openOverlay(lv_event_get_target(e));
}

void overlayKeyboardEvent(lv_event_t *e)
{
    lv_event_code_t code = lv_event_get_code(e);

    if (code == LV_EVENT_READY)
    {
        hideOverlay(true);
    }
    else if (code == LV_EVENT_CANCEL)
    {
        hideOverlay(false);
    }
}

void buildOverlay()
{
    lv_obj_t *topLayer = lv_layer_top();

    overlayPanel = lv_obj_create(topLayer);
    lv_obj_set_size(overlayPanel, 440, 58);
    lv_obj_align(overlayPanel, LV_ALIGN_TOP_MID, 0, 8);
    lv_obj_clear_flag(overlayPanel, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_add_flag(overlayPanel, LV_OBJ_FLAG_HIDDEN);
    lv_obj_set_style_radius(overlayPanel, 12, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_bg_opa(overlayPanel, LV_OPA_COVER, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_pad_all(overlayPanel, 8, LV_PART_MAIN | LV_STATE_DEFAULT);

    overlayTitle = lv_label_create(overlayPanel);
    lv_label_set_text(overlayTitle, "EDITAR");
    lv_obj_align(overlayTitle, LV_ALIGN_LEFT_MID, 8, 0);

    overlayInput = lv_textarea_create(overlayPanel);
    lv_obj_set_size(overlayInput, 280, 40);
    lv_obj_align(overlayInput, LV_ALIGN_RIGHT_MID, -8, 0);
    lv_textarea_set_one_line(overlayInput, true);
    lv_obj_clear_flag(overlayInput, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_set_scrollbar_mode(overlayInput, LV_SCROLLBAR_MODE_OFF);
    lv_obj_set_style_text_align(overlayInput, LV_TEXT_ALIGN_LEFT, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_pad_left(overlayInput, 8, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_pad_right(overlayInput, 8, LV_PART_MAIN | LV_STATE_DEFAULT);

    overlayKeyboard = lv_keyboard_create(topLayer);
    lv_obj_set_size(overlayKeyboard, 470, 118);
    lv_obj_align(overlayKeyboard, LV_ALIGN_BOTTOM_MID, 0, 0);
    lv_keyboard_set_popovers(overlayKeyboard, false);
    lv_obj_add_flag(overlayKeyboard, LV_OBJ_FLAG_HIDDEN);
    lv_obj_add_event_cb(overlayKeyboard, overlayKeyboardEvent, LV_EVENT_ALL, nullptr);
}
} // namespace

const char *ui_input_overlay_get_wifi_password()
{
    return wifiPassword;
}

int ui_input_overlay_get_setpoint()
{
    char setpointText[8];
    formatSetpointText(ui_TextArea1 != nullptr ? lv_textarea_get_text(ui_TextArea1) : nullptr,
                       setpointText,
                       sizeof(setpointText));
    return atoi(setpointText);
}

void ui_input_overlay_set_setpoint(int setpoint)
{
    char setpointText[8];
    char rawInput[8];
    snprintf(rawInput, sizeof(rawInput), "%d", setpoint);
    formatSetpointText(rawInput, setpointText, sizeof(setpointText));

    if (ui_TextArea1 != nullptr)
    {
        lv_textarea_set_text(ui_TextArea1, setpointText);
    }
}

void ui_input_overlay_init()
{
    hideGeneratedKeyboards();

    lv_obj_remove_event_cb(ui_TextArea1, ui_event_TextArea1);
    lv_obj_remove_event_cb(ui_TextArea2, ui_event_TextArea2);
    lv_obj_remove_event_cb(ui_TextArea3, ui_event_TextArea3);

    configureSourceFields();
    buildOverlay();

    lv_obj_add_event_cb(ui_TextArea1, sourceTextareaEvent, LV_EVENT_ALL, nullptr);
    lv_obj_add_event_cb(ui_TextArea3, sourceTextareaEvent, LV_EVENT_ALL, nullptr);
}

void ui_input_overlay_tick()
{
    if (activeSource == nullptr || overlayPanel == nullptr || overlayKeyboard == nullptr)
    {
        return;
    }

    if (lv_obj_has_flag(overlayPanel, LV_OBJ_FLAG_HIDDEN))
    {
        return;
    }

    if (lv_obj_get_screen(activeSource) != lv_scr_act())
    {
        hideOverlay(false);
    }
}
