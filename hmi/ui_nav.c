#include "ui_nav.h"

#include "ui.h"
#include "ui_helpers.h"

typedef struct
{
    const void *iconSrc;
    const char *label;
    lv_event_cb_t callback;
} NavAction;

typedef struct
{
    lv_obj_t *screen;
    lv_obj_t *overlay;
    lv_obj_t *panel;
    lv_obj_t *toggleButton;
    lv_obj_t *toggleLabel;
    bool open;
} NavDrawer;

typedef struct
{
    NavDrawer *drawer;
    lv_event_cb_t callback;
} NavActionContext;

static NavDrawer navDrawers[5];
static uint8_t navDrawerCount = 0;
static NavActionContext navActionContexts[20];
static uint8_t navActionContextCount = 0;

static const lv_coord_t NAV_TOGGLE_X = -220;
static const lv_coord_t NAV_TOGGLE_Y = -115;
static const lv_coord_t NAV_TOGGLE_SIZE = 30;
static const lv_coord_t NAV_PANEL_WIDTH = 148;
static const lv_coord_t NAV_PANEL_HEIGHT = 188;
static const lv_coord_t NAV_PANEL_OPEN_X = -166;
static const lv_coord_t NAV_PANEL_CLOSED_X = -270;
static const lv_coord_t NAV_PANEL_Y = -5;
static const uint16_t NAV_ANIM_TIME_MS = 280;
static const lv_opa_t NAV_OVERLAY_OPEN_OPA = LV_OPA_50;

static void close_all_drawers(void);
static void close_drawer(NavDrawer *drawer);
static void open_drawer(NavDrawer *drawer);

static void nav_anim_set_x(void *var, int32_t value)
{
    lv_obj_set_x((lv_obj_t *)var, value);
}

static void nav_anim_set_bg_opa(void *var, int32_t value)
{
    lv_obj_set_style_bg_opa((lv_obj_t *)var, (lv_opa_t)value, LV_PART_MAIN | LV_STATE_DEFAULT);
}

static void set_toggle_symbol(NavDrawer *drawer, bool open)
{
    if (drawer == NULL || drawer->toggleLabel == NULL)
    {
        return;
    }

    lv_label_set_text(drawer->toggleLabel, open ? LV_SYMBOL_LEFT : LV_SYMBOL_RIGHT);
}

static void close_overlay_ready_cb(lv_anim_t *anim)
{
    NavDrawer *drawer = (NavDrawer *)lv_anim_get_user_data(anim);
    if (drawer == NULL)
    {
        return;
    }

    lv_obj_clear_flag(drawer->overlay, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_add_flag(drawer->overlay, LV_OBJ_FLAG_HIDDEN);
}

static void animate_drawer(NavDrawer *drawer,
                           lv_coord_t startX,
                           lv_coord_t endX,
                           lv_opa_t startOverlayOpa,
                           lv_opa_t endOverlayOpa,
                           lv_anim_ready_cb_t readyCb)
{
    lv_anim_t panelAnim;
    lv_anim_init(&panelAnim);
    lv_anim_set_var(&panelAnim, drawer->panel);
    lv_anim_set_values(&panelAnim, startX, endX);
    lv_anim_set_time(&panelAnim, NAV_ANIM_TIME_MS);
    lv_anim_set_path_cb(&panelAnim, endX > startX ? lv_anim_path_ease_out : lv_anim_path_ease_in);
    lv_anim_set_exec_cb(&panelAnim, nav_anim_set_x);
    lv_anim_start(&panelAnim);

    lv_anim_t overlayAnim;
    lv_anim_init(&overlayAnim);
    lv_anim_set_var(&overlayAnim, drawer->overlay);
    lv_anim_set_values(&overlayAnim, startOverlayOpa, endOverlayOpa);
    lv_anim_set_time(&overlayAnim, NAV_ANIM_TIME_MS);
    lv_anim_set_exec_cb(&overlayAnim, nav_anim_set_bg_opa);
    if (readyCb != NULL)
    {
        lv_anim_set_ready_cb(&overlayAnim, readyCb);
        lv_anim_set_user_data(&overlayAnim, drawer);
    }
    lv_anim_start(&overlayAnim);
}

static void open_drawer(NavDrawer *drawer)
{
    if (drawer == NULL || drawer->open)
    {
        return;
    }

    close_all_drawers();
    drawer->open = true;
    set_toggle_symbol(drawer, true);
    lv_obj_clear_flag(drawer->overlay, LV_OBJ_FLAG_HIDDEN);
    lv_obj_add_flag(drawer->overlay, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_move_foreground(drawer->overlay);
    lv_obj_move_foreground(drawer->toggleButton);
    lv_obj_set_x(drawer->panel, NAV_PANEL_CLOSED_X);
    animate_drawer(drawer, NAV_PANEL_CLOSED_X, NAV_PANEL_OPEN_X, LV_OPA_0, NAV_OVERLAY_OPEN_OPA, NULL);
}

static void close_drawer(NavDrawer *drawer)
{
    if (drawer == NULL || !drawer->open)
    {
        return;
    }

    drawer->open = false;
    set_toggle_symbol(drawer, false);
    animate_drawer(drawer,
                   lv_obj_get_x(drawer->panel),
                   NAV_PANEL_CLOSED_X,
                   NAV_OVERLAY_OPEN_OPA,
                   LV_OPA_0,
                   close_overlay_ready_cb);
}

static void close_all_drawers(void)
{
    uint8_t index;
    for (index = 0; index < navDrawerCount; ++index)
    {
        close_drawer(&navDrawers[index]);
    }
}

static void toggle_drawer_event(lv_event_t *e)
{
    NavDrawer *drawer;

    if (lv_event_get_code(e) != LV_EVENT_CLICKED)
    {
        return;
    }

    drawer = (NavDrawer *)lv_event_get_user_data(e);
    if (drawer == NULL)
    {
        return;
    }

    if (drawer->open)
    {
        close_drawer(drawer);
    }
    else
    {
        open_drawer(drawer);
    }
}

static void overlay_click_event(lv_event_t *e)
{
    NavDrawer *drawer;

    if (lv_event_get_code(e) != LV_EVENT_CLICKED)
    {
        return;
    }

    drawer = (NavDrawer *)lv_event_get_user_data(e);
    if (drawer == NULL || lv_event_get_target(e) != drawer->overlay)
    {
        return;
    }

    close_drawer(drawer);
}

static lv_obj_t *create_drawer_item(lv_obj_t *parent,
                                    const NavAction *action,
                                    lv_coord_t y)
{
    lv_obj_t *button;
    lv_obj_t *icon;
    lv_obj_t *label;

    if (parent == NULL || action == NULL)
    {
        return NULL;
    }

    button = lv_btn_create(parent);
    lv_obj_set_size(button, NAV_PANEL_WIDTH - 20, 32);
    lv_obj_set_x(button, 0);
    lv_obj_set_y(button, y);
    lv_obj_set_align(button, LV_ALIGN_TOP_MID);
    lv_obj_clear_flag(button, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_set_style_bg_color(button, lv_color_hex(0xFFFFFF), LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_bg_color(button, lv_color_hex(0xE3F2FD), LV_PART_MAIN | LV_STATE_PRESSED);
    lv_obj_set_style_bg_opa(button, LV_OPA_COVER, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_border_width(button, 0, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_shadow_width(button, 0, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_outline_width(button, 0, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_radius(button, 8, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_pad_all(button, 0, LV_PART_MAIN | LV_STATE_DEFAULT);

    icon = lv_img_create(button);
    lv_img_set_src(icon, action->iconSrc);
    lv_obj_set_align(icon, LV_ALIGN_LEFT_MID);
    lv_obj_set_x(icon, 10);
    lv_obj_set_y(icon, 0);
    lv_obj_clear_flag(icon, LV_OBJ_FLAG_CLICKABLE);

    label = lv_label_create(button);
    lv_label_set_text(label, action->label);
    lv_obj_set_align(label, LV_ALIGN_LEFT_MID);
    lv_obj_set_x(label, 44);
    lv_obj_set_y(label, 0);
    lv_obj_set_style_text_font(label, &lv_font_montserrat_12, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_text_color(label, lv_color_hex(0x1F2937), LV_PART_MAIN | LV_STATE_DEFAULT);

    return button;
}

static void nav_action_event(lv_event_t *e)
{
    NavActionContext *context;

    if (lv_event_get_code(e) != LV_EVENT_CLICKED)
    {
        return;
    }

    context = (NavActionContext *)lv_event_get_user_data(e);
    if (context == NULL || context->callback == NULL)
    {
        return;
    }

    if (context->drawer != NULL)
    {
        close_drawer(context->drawer);
    }

    context->callback(e);
}

static void hide_object_if_present(lv_obj_t *object)
{
    if (object != NULL)
    {
        lv_obj_add_flag(object, LV_OBJ_FLAG_HIDDEN);
    }
}

static void init_drawer(NavDrawer *drawer,
                        lv_obj_t *screen,
                        lv_obj_t **legacyIcons,
                        uint8_t legacyIconCount,
                        const NavAction *actions,
                        uint8_t actionCount)
{
    uint8_t index;

    if (drawer == NULL || screen == NULL || actions == NULL || actionCount == 0)
    {
        return;
    }

    drawer->screen = screen;
    drawer->open = false;

    for (index = 0; index < legacyIconCount; ++index)
    {
        hide_object_if_present(legacyIcons[index]);
    }

    drawer->overlay = lv_obj_create(screen);
    lv_obj_remove_style_all(drawer->overlay);
    lv_obj_set_size(drawer->overlay, 480, 272);
    lv_obj_set_align(drawer->overlay, LV_ALIGN_CENTER);
    lv_obj_set_x(drawer->overlay, 0);
    lv_obj_set_y(drawer->overlay, 0);
    lv_obj_set_style_bg_color(drawer->overlay, lv_color_hex(0x000000), LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_bg_opa(drawer->overlay, LV_OPA_0, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_add_flag(drawer->overlay, LV_OBJ_FLAG_HIDDEN);
    lv_obj_clear_flag(drawer->overlay, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_clear_flag(drawer->overlay, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_add_event_cb(drawer->overlay, overlay_click_event, LV_EVENT_CLICKED, drawer);

    drawer->panel = lv_obj_create(drawer->overlay);
    lv_obj_set_size(drawer->panel, NAV_PANEL_WIDTH, NAV_PANEL_HEIGHT);
    lv_obj_set_align(drawer->panel, LV_ALIGN_CENTER);
    lv_obj_set_x(drawer->panel, NAV_PANEL_CLOSED_X);
    lv_obj_set_y(drawer->panel, NAV_PANEL_Y);
    lv_obj_clear_flag(drawer->panel, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_add_flag(drawer->panel, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_set_style_bg_color(drawer->panel, lv_color_hex(0xFFFFFF), LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_bg_opa(drawer->panel, LV_OPA_COVER, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_border_width(drawer->panel, 0, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_radius(drawer->panel, 12, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_shadow_width(drawer->panel, 18, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_shadow_color(drawer->panel, lv_color_hex(0x000000), LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_shadow_opa(drawer->panel, LV_OPA_30, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_shadow_ofs_x(drawer->panel, 5, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_pad_all(drawer->panel, 10, LV_PART_MAIN | LV_STATE_DEFAULT);

    for (index = 0; index < actionCount; ++index)
    {
        NavActionContext *context;
        lv_obj_t *button = create_drawer_item(drawer->panel,
                                              &actions[index],
                                              (lv_coord_t)(12 + (index * 42)));
        if (button != NULL && navActionContextCount < (sizeof(navActionContexts) / sizeof(navActionContexts[0])))
        {
            context = &navActionContexts[navActionContextCount++];
            context->drawer = drawer;
            context->callback = actions[index].callback;
            lv_obj_add_event_cb(button, nav_action_event, LV_EVENT_CLICKED, context);
        }
    }

    drawer->toggleButton = lv_btn_create(screen);
    lv_obj_set_size(drawer->toggleButton, NAV_TOGGLE_SIZE, NAV_TOGGLE_SIZE);
    lv_obj_set_align(drawer->toggleButton, LV_ALIGN_CENTER);
    lv_obj_set_x(drawer->toggleButton, NAV_TOGGLE_X);
    lv_obj_set_y(drawer->toggleButton, NAV_TOGGLE_Y);
    lv_obj_clear_flag(drawer->toggleButton, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_set_style_radius(drawer->toggleButton, NAV_TOGGLE_SIZE / 2, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_bg_color(drawer->toggleButton, lv_color_hex(0x2196F3), LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_bg_color(drawer->toggleButton, lv_color_hex(0x1976D2), LV_PART_MAIN | LV_STATE_PRESSED);
    lv_obj_set_style_bg_opa(drawer->toggleButton, LV_OPA_COVER, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_border_width(drawer->toggleButton, 0, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_shadow_width(drawer->toggleButton, 8, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_shadow_color(drawer->toggleButton, lv_color_hex(0x000000), LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_shadow_opa(drawer->toggleButton, LV_OPA_20, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_pad_all(drawer->toggleButton, 0, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_add_event_cb(drawer->toggleButton, toggle_drawer_event, LV_EVENT_CLICKED, drawer);

    drawer->toggleLabel = lv_label_create(drawer->toggleButton);
    lv_obj_set_style_text_color(drawer->toggleLabel, lv_color_hex(0xFFFFFF), LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_text_font(drawer->toggleLabel, &lv_font_montserrat_16, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_center(drawer->toggleLabel);
    set_toggle_symbol(drawer, false);
}

static void go_home(void)
{
    close_all_drawers();
    _ui_screen_change(&ui_HOME, LV_SCR_LOAD_ANIM_MOVE_RIGHT, 200, 0, &ui_HOME_screen_init);
}

static void go_monitoreo(void)
{
    close_all_drawers();
    _ui_screen_change(&ui_MONITOREO_, LV_SCR_LOAD_ANIM_MOVE_LEFT, 200, 0, &ui_MONITOREO__screen_init);
}

static void go_config(void)
{
    close_all_drawers();
    _ui_screen_change(&ui_CONFIGURACIONES, LV_SCR_LOAD_ANIM_MOVE_LEFT, 200, 0, &ui_CONFIGURACIONES_screen_init);
}

static void go_wifi(void)
{
    close_all_drawers();
    _ui_screen_change(&ui_WIFI, LV_SCR_LOAD_ANIM_MOVE_LEFT, 200, 0, &ui_WIFI_screen_init);
}

static void go_alertas(void)
{
    close_all_drawers();
    _ui_screen_change(&ui_ALERTAS, LV_SCR_LOAD_ANIM_MOVE_LEFT, 200, 0, &ui_ALERTAS_screen_init);
}

static void nav_home(lv_event_t *e)
{
    if (lv_event_get_code(e) != LV_EVENT_CLICKED) return;
    go_home();
}

static void nav_monitoreo(lv_event_t *e)
{
    if (lv_event_get_code(e) != LV_EVENT_CLICKED) return;
    go_monitoreo();
}

static void nav_config(lv_event_t *e)
{
    if (lv_event_get_code(e) != LV_EVENT_CLICKED) return;
    go_config();
}

static void nav_wifi(lv_event_t *e)
{
    if (lv_event_get_code(e) != LV_EVENT_CLICKED) return;
    go_wifi();
}

static void nav_alertas(lv_event_t *e)
{
    if (lv_event_get_code(e) != LV_EVENT_CLICKED) return;
    go_alertas();
}

static void gesture_home(lv_event_t *e)
{
    lv_dir_t dir;

    if (lv_event_get_code(e) != LV_EVENT_GESTURE) return;
    dir = lv_indev_get_gesture_dir(lv_indev_get_act());
    if (dir == LV_DIR_LEFT) go_monitoreo();
    else if (dir == LV_DIR_RIGHT) go_wifi();
}

static void gesture_monitoreo(lv_event_t *e)
{
    lv_dir_t dir;

    if (lv_event_get_code(e) != LV_EVENT_GESTURE) return;
    dir = lv_indev_get_gesture_dir(lv_indev_get_act());
    if (dir == LV_DIR_LEFT) go_config();
    else if (dir == LV_DIR_RIGHT) go_home();
}

static void gesture_config(lv_event_t *e)
{
    lv_dir_t dir;

    if (lv_event_get_code(e) != LV_EVENT_GESTURE) return;
    dir = lv_indev_get_gesture_dir(lv_indev_get_act());
    if (dir == LV_DIR_LEFT) go_alertas();
    else if (dir == LV_DIR_RIGHT) go_monitoreo();
}

static void gesture_alertas(lv_event_t *e)
{
    lv_dir_t dir;

    if (lv_event_get_code(e) != LV_EVENT_GESTURE) return;
    dir = lv_indev_get_gesture_dir(lv_indev_get_act());
    if (dir == LV_DIR_LEFT) go_wifi();
    else if (dir == LV_DIR_RIGHT) go_config();
}

static void gesture_wifi(lv_event_t *e)
{
    lv_dir_t dir;

    if (lv_event_get_code(e) != LV_EVENT_GESTURE) return;
    dir = lv_indev_get_gesture_dir(lv_indev_get_act());
    if (dir == LV_DIR_LEFT) go_home();
    else if (dir == LV_DIR_RIGHT) go_alertas();
}

static void register_click(lv_obj_t *object, lv_event_cb_t callback)
{
    if (object == NULL || callback == NULL)
    {
        return;
    }

    lv_obj_add_flag(object, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_add_event_cb(object, callback, LV_EVENT_CLICKED, NULL);
}

void ui_register_navigation_callbacks(void)
{
    lv_obj_t *homeLegacyIcons[4] = {ui_Image17, ui_Image16, ui_Image18, ui_Image26};
    lv_obj_t *monitorLegacyIcons[4] = {ui_Image19, ui_Image20, ui_Image23, ui_Image24};
    lv_obj_t *configLegacyIcons[4] = {ui_Image10, ui_Image11, ui_Image12, ui_Image28};
    lv_obj_t *wifiLegacyIcons[4] = {ui_Image4, ui_Image5, ui_Image2, ui_Image29};
    lv_obj_t *alertLegacyIcons[5] = {ui_Image30, ui_Image31, ui_Image32, ui_Image33, ui_Image34};

    static const NavAction homeActions[4] = {
        {&ui_img_wifi_png, "Red", nav_wifi},
        {&ui_img_configuraciones_png, "Config", nav_config},
        {&ui_img_spyware_png, "Monitoreo", nav_monitoreo},
        {&ui_img_peligro_png, "Alertas", nav_alertas},
    };
    static const NavAction monitorActions[4] = {
        {&ui_img_wifi_png, "Red", nav_wifi},
        {&ui_img_configuraciones_png, "Config", nav_config},
        {&ui_img_561359873, "Inicio", nav_home},
        {&ui_img_peligro_png, "Alertas", nav_alertas},
    };
    static const NavAction configActions[4] = {
        {&ui_img_wifi_png, "Red", nav_wifi},
        {&ui_img_561359873, "Inicio", nav_home},
        {&ui_img_spyware_png, "Monitoreo", nav_monitoreo},
        {&ui_img_peligro_png, "Alertas", nav_alertas},
    };
    static const NavAction wifiActions[4] = {
        {&ui_img_configuraciones_png, "Config", nav_config},
        {&ui_img_561359873, "Inicio", nav_home},
        {&ui_img_spyware_png, "Monitoreo", nav_monitoreo},
        {&ui_img_peligro_png, "Alertas", nav_alertas},
    };
    static const NavAction alertActions[4] = {
        {&ui_img_wifi_png, "Red", nav_wifi},
        {&ui_img_configuraciones_png, "Config", nav_config},
        {&ui_img_561359873, "Inicio", nav_home},
        {&ui_img_spyware_png, "Monitoreo", nav_monitoreo},
    };

    navDrawerCount = 0;
    navActionContextCount = 0;

    init_drawer(&navDrawers[navDrawerCount++], ui_HOME, homeLegacyIcons, 4, homeActions, 4);
    init_drawer(&navDrawers[navDrawerCount++], ui_MONITOREO_, monitorLegacyIcons, 4, monitorActions, 4);
    init_drawer(&navDrawers[navDrawerCount++], ui_CONFIGURACIONES, configLegacyIcons, 4, configActions, 4);
    init_drawer(&navDrawers[navDrawerCount++], ui_WIFI, wifiLegacyIcons, 4, wifiActions, 4);
    init_drawer(&navDrawers[navDrawerCount++], ui_ALERTAS, alertLegacyIcons, 5, alertActions, 4);

    lv_obj_add_event_cb(ui_HOME, gesture_home, LV_EVENT_GESTURE, NULL);
    lv_obj_add_event_cb(ui_MONITOREO_, gesture_monitoreo, LV_EVENT_GESTURE, NULL);
    lv_obj_add_event_cb(ui_CONFIGURACIONES, gesture_config, LV_EVENT_GESTURE, NULL);
    lv_obj_add_event_cb(ui_ALERTAS, gesture_alertas, LV_EVENT_GESTURE, NULL);
    lv_obj_add_event_cb(ui_WIFI, gesture_wifi, LV_EVENT_GESTURE, NULL);

    register_click(ui_Image6, nav_wifi);
}
