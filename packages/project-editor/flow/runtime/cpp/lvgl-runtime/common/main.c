#include <stdlib.h>
#include <stdio.h>
#include <unistd.h>
#include <math.h>
#include <emscripten.h>

#include "lvgl/lvgl.h"

#include "src/flow.h"

#define EM_PORT_API(rettype) rettype EMSCRIPTEN_KEEPALIVE

static void hal_init();

static lv_disp_t *disp1;

int hor_res;
int ver_res;

uint32_t *display_fb;
bool display_fb_dirty;

#if LVGL_VERSION_MAJOR >= 9
void my_driver_flush(lv_display_t *disp_drv, const lv_area_t *area, uint8_t *px_map) {
#else
void my_driver_flush(lv_disp_drv_t * disp_drv, const lv_area_t * area, lv_color_t * color_p) {
#endif
    /*Return if the area is out the screen */
    if (area->x2 < 0 || area->y2 < 0 || area->x1 > hor_res - 1 || area->y1 > ver_res - 1) {
        lv_disp_flush_ready(disp_drv);
        return;
    }

    uint8_t *dst = (uint8_t *)&display_fb[area->y1 * hor_res + area->x1];
    uint32_t s = 4 * (hor_res - lv_area_get_width(area));
    for (int y = area->y1; y <= area->y2 && y < ver_res; y++) {
        for (int x = area->x1; x <= area->x2; x++) {
#if LVGL_VERSION_MAJOR >= 9
            uint8_t *src = px_map;
            px_map += 4;
#else
            uint8_t *src = (uint8_t *)color_p++;
#endif

            // bgr -> rgb
            *dst++ = src[2];
            *dst++ = src[1];
            *dst++ = src[0];
            *dst++ = src[3];
        }

        dst += s;
    }

    lv_disp_flush_ready(disp_drv);

    display_fb_dirty = true;
}

static int mouse_x = 0;
static int mouse_y = 0;
static int mouse_pressed = 0;

#if LVGL_VERSION_MAJOR >= 9
void my_mouse_read(lv_indev_t * indev_drv, lv_indev_data_t * data) {
#else
void my_mouse_read(lv_indev_drv_t * indev_drv, lv_indev_data_t * data) {
#endif
    (void) indev_drv;      /*Unused*/

    /*Store the collected data*/
    data->point.x = (lv_coord_t)mouse_x;
    data->point.y = (lv_coord_t)mouse_y;
    data->state = mouse_pressed ? LV_INDEV_STATE_PRESSED : LV_INDEV_STATE_RELEASED;
}

#if LVGL_VERSION_MAJOR >= 9
void my_keyboard_read(lv_indev_t * indev_drv, lv_indev_data_t * data) {
#else
void my_keyboard_read(lv_indev_drv_t * indev_drv, lv_indev_data_t * data) {
#endif
    (void) indev_drv;      /*Unused*/
}

static int mouse_wheel_delta = 0;
static int mouse_wheel_pressed = 0;

#if LVGL_VERSION_MAJOR >= 9
void my_mousewheel_read(lv_indev_t * indev_drv, lv_indev_data_t * data) {
#else
void my_mousewheel_read(lv_indev_drv_t * indev_drv, lv_indev_data_t * data) {
#endif
    (void) indev_drv;      /*Unused*/

    data->state = mouse_wheel_pressed ? LV_INDEV_STATE_PRESSED : LV_INDEV_STATE_RELEASED;
    data->enc_diff = (int16_t)mouse_wheel_delta;

    mouse_wheel_delta = 0;
}

////////////////////////////////////////////////////////////////////////////////
// memory based file system

uint16_t my_cache_size = 0;

#if LV_USE_USER_DATA
void *my_user_data = 0;
#endif

typedef struct {
    uint8_t *ptr;
    uint32_t pos;
} my_file_t;

bool my_ready_cb(struct _lv_fs_drv_t * drv) {
    return true;
}

void *my_open_cb(struct _lv_fs_drv_t * drv, const char * path, lv_fs_mode_t mode) {
#if LVGL_VERSION_MAJOR >= 9
    my_file_t *file = (my_file_t *)lv_malloc(sizeof(my_file_t));
#else
    my_file_t *file = (my_file_t *)lv_mem_alloc(sizeof(my_file_t));
#endif
    file->ptr = (void *)atoi(path);
    file->pos = 0;
    return file;
}

lv_fs_res_t my_close_cb(struct _lv_fs_drv_t * drv, void * file_p) {
#if LVGL_VERSION_MAJOR >= 9
    lv_free(file_p);
#else
    lv_mem_free(file_p);
#endif
    return LV_FS_RES_OK;
}

lv_fs_res_t my_read_cb(struct _lv_fs_drv_t * drv, void * file_p, void * buf, uint32_t btr, uint32_t * br) {
    my_file_t *file = (my_file_t *)file_p;
    memcpy(buf, file->ptr + file->pos, btr);
    file->pos += btr;
    if (br != 0)
        *br = btr;
    return LV_FS_RES_OK;
}

lv_fs_res_t my_seek_cb(struct _lv_fs_drv_t * drv, void * file_p, uint32_t pos, lv_fs_whence_t whence) {
    my_file_t *file = (my_file_t *)file_p;
    if (whence == LV_FS_SEEK_SET) {
        file->pos = pos;
        return LV_FS_RES_OK;
    }
    if (whence == LV_FS_SEEK_CUR) {
        file->pos += pos;
        return LV_FS_RES_OK;
    }
    return LV_FS_RES_NOT_IMP;
}

lv_fs_res_t my_tell_cb(struct _lv_fs_drv_t * drv, void * file_p, uint32_t * pos_p) {
    my_file_t *file = (my_file_t *)file_p;
    *pos_p = file->pos;
    return LV_FS_RES_OK;
}

static void init_fs_driver() {
    static lv_fs_drv_t drv;                   /*Needs to be static or global*/
    lv_fs_drv_init(&drv);                     /*Basic initialization*/

    drv.letter = 'M';                         /*An uppercase letter to identify the drive */
    drv.cache_size = my_cache_size;           /*Cache size for reading in bytes. 0 to not cache.*/

    drv.ready_cb = my_ready_cb;               /*Callback to tell if the drive is ready to use */
    drv.open_cb = my_open_cb;                 /*Callback to open a file */
    drv.close_cb = my_close_cb;               /*Callback to close a file */
    drv.read_cb = my_read_cb;                 /*Callback to read a file */
    drv.write_cb = 0;               /*Callback to write a file */
    drv.seek_cb = my_seek_cb;                 /*Callback to seek in a file (Move cursor) */
    drv.tell_cb = my_tell_cb;                 /*Callback to tell the cursor position  */

    drv.dir_open_cb = 0;         /*Callback to open directory to read its content */
    drv.dir_read_cb = 0;         /*Callback to read a directory's content */
    drv.dir_close_cb = 0;       /*Callback to close a directory */

#if LV_USE_USER_DATA
    drv.user_data = my_user_data;             /*Any custom data if required*/
#endif

    lv_fs_drv_register(&drv);                 /*Finally register the drive*/
}

////////////////////////////////////////////////////////////////////////////////

static void hal_init() {
    // alloc memory for the display front buffer
    display_fb = (uint32_t *)malloc(sizeof(uint32_t) * hor_res * ver_res);
    memset(display_fb, 0x44, hor_res * ver_res * sizeof(uint32_t));

#if LVGL_VERSION_MAJOR >= 9
    lv_display_t * disp = lv_display_create(hor_res, ver_res);
    lv_display_set_flush_cb(disp, my_driver_flush);

    uint8_t *buf1 = malloc(sizeof(uint32_t) * hor_res * ver_res);
    uint8_t *buf2 = NULL;
    lv_display_set_buffers(disp, buf1, buf2, sizeof(uint32_t) * hor_res * ver_res, LV_DISPLAY_RENDER_MODE_PARTIAL);
#else
    /*Create a display buffer*/
    static lv_disp_draw_buf_t disp_buf1;
    lv_color_t * buf1_1 = malloc(sizeof(lv_color_t) * hor_res * ver_res);
    lv_disp_draw_buf_init(&disp_buf1, buf1_1, NULL, hor_res * ver_res);

    /*Create a display*/
    static lv_disp_drv_t disp_drv;
    lv_disp_drv_init(&disp_drv);            /*Basic initialization*/
    disp_drv.draw_buf = &disp_buf1;
    disp_drv.flush_cb = my_driver_flush;    /*Used when `LV_VDB_SIZE != 0` in lv_conf.h (buffered drawing)*/
    disp_drv.hor_res = hor_res;
    disp_drv.ver_res = ver_res;
    disp1 = lv_disp_drv_register(&disp_drv);
#endif

    if (!is_editor) {
        // mourse init
#if LVGL_VERSION_MAJOR >= 9
        lv_indev_t * indev1 = lv_indev_create();
        lv_indev_set_type(indev1, LV_INDEV_TYPE_POINTER);
        lv_indev_set_read_cb(indev1, my_mouse_read);
        //lv_indev_set_mode(indev1, LV_INDEV_MODE_EVENT);
#else
        static lv_indev_drv_t indev_drv_1;
        lv_indev_drv_init(&indev_drv_1); /*Basic initialization*/
        indev_drv_1.type = LV_INDEV_TYPE_POINTER;
        indev_drv_1.read_cb = my_mouse_read;
        lv_indev_drv_register(&indev_drv_1);
#endif

        // keyboard init
#if LVGL_VERSION_MAJOR >= 9
        lv_indev_t * indev2 = lv_indev_create();
        lv_indev_set_type(indev2, LV_INDEV_TYPE_KEYPAD);
        lv_indev_set_read_cb(indev2, my_keyboard_read);
        //lv_indev_set_mode(indev2, LV_INDEV_MODE_EVENT);
#else
        static lv_indev_drv_t indev_drv_2;
        lv_indev_drv_init(&indev_drv_2);
        indev_drv_2.type = LV_INDEV_TYPE_KEYPAD;
        indev_drv_2.read_cb = my_keyboard_read;
        lv_indev_t *kb_indev = lv_indev_drv_register(&indev_drv_2);
#endif

        // mousewheel init
#if LVGL_VERSION_MAJOR >= 9
        lv_indev_t * indev3 = lv_indev_create();
        lv_indev_set_type(indev3, LV_INDEV_TYPE_ENCODER);
        lv_indev_set_read_cb(indev3, my_mousewheel_read);
        //lv_indev_set_mode(indev3, LV_INDEV_MODE_EVENT);
#else
        static lv_indev_drv_t indev_drv_3;
        lv_indev_drv_init(&indev_drv_3);
        indev_drv_3.type = LV_INDEV_TYPE_ENCODER;
        indev_drv_3.read_cb = my_mousewheel_read;
        lv_indev_t * enc_indev = lv_indev_drv_register(&indev_drv_3);
#endif
    }

    init_fs_driver();
}

bool initialized = false;

#if LVGL_VERSION_MAJOR >= 9
static uint32_t g_prevTick;
#endif

EM_PORT_API(void) init(uint32_t wasmModuleId, uint32_t debuggerMessageSubsciptionFilter, uint8_t *assets, uint32_t assetsSize, uint32_t displayWidth, uint32_t displayHeight, uint32_t timeZone) {
    is_editor = assetsSize == 0;

    hor_res = displayWidth;
    ver_res = displayHeight;

    /*Initialize LittlevGL*/
    lv_init();

    /*Initialize the HAL (display, input devices, tick) for LittlevGL*/
    hal_init();

    lv_disp_t *dispp = lv_disp_get_default();
    lv_theme_t *theme = lv_theme_default_init(dispp, lv_palette_main(LV_PALETTE_BLUE), lv_palette_main(LV_PALETTE_RED), false, LV_FONT_DEFAULT);
    lv_disp_set_theme(dispp, theme);

    if (!is_editor) {
        flowInit(wasmModuleId, debuggerMessageSubsciptionFilter, assets, assetsSize, timeZone);
    }

#if LVGL_VERSION_MAJOR >= 9
    g_prevTick = (uint32_t)emscripten_get_now();
#endif

    initialized = true;
}

EM_PORT_API(bool) mainLoop() {
    if (!initialized) {
        return true;
    }

#if LVGL_VERSION_MAJOR >= 9
    uint32_t currentTick = (uint32_t)emscripten_get_now();
    lv_tick_inc(currentTick - g_prevTick);
    g_prevTick = currentTick;
#endif

    /* Periodically call the lv_task handler */
    lv_task_handler();

    return flowTick();
}

EM_PORT_API(uint8_t*) getSyncedBuffer() {
    if (display_fb_dirty) {
        display_fb_dirty = false;
        return (uint8_t*)display_fb;
    }
	return NULL;
}

EM_PORT_API(bool) isRTL() {
    return false;
}

EM_PORT_API(void) onPointerEvent(int x, int y, int pressed) {
    if (x < 0) x = 0;
    else if (x >= hor_res) x = hor_res - 1;
    mouse_x = x;

    if (y < 0) y = 0;
    else if (y >= ver_res) y = ver_res - 1;
    mouse_y = y;

    mouse_pressed = pressed;
}

EM_PORT_API(void) onMouseWheelEvent(double yMouseWheel, int clicked) {
    if (yMouseWheel >= 100 || yMouseWheel <= -100) {
        yMouseWheel /= 100;
    }
    mouse_wheel_delta = round(yMouseWheel);
    mouse_wheel_pressed = clicked;
}
