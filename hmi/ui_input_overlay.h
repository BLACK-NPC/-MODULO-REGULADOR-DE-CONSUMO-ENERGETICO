#ifndef UI_INPUT_OVERLAY_H
#define UI_INPUT_OVERLAY_H

void ui_input_overlay_init();
void ui_input_overlay_tick();
const char *ui_input_overlay_get_wifi_password();
int ui_input_overlay_get_setpoint();
void ui_input_overlay_set_setpoint(int setpoint);

#endif
