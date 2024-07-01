export type LVGLStylePropCode = {
    "8.3": number | undefined;
    "9.0": number | undefined;
};

export const LVGL_STYLE_PROP_CODES: {
    [key: string]: LVGLStylePropCode;
} = {
    /*Group 0*/
    LV_STYLE_WIDTH: { "8.3": 1, "9.0": 1 },
    LV_STYLE_HEIGHT: { "8.3": 4, "9.0": 2 },
    LV_STYLE_LENGTH: { "8.3": undefined, "9.0": 3 }, // ONLY 9.0

    LV_STYLE_MIN_WIDTH: { "8.3": 2, "9.0": 4 },
    LV_STYLE_MAX_WIDTH: { "8.3": 3, "9.0": 5 },
    LV_STYLE_MIN_HEIGHT: { "8.3": 5, "9.0": 6 },
    LV_STYLE_MAX_HEIGHT: { "8.3": 6, "9.0": 7 },

    LV_STYLE_X: { "8.3": 7, "9.0": 8 },
    LV_STYLE_Y: { "8.3": 8, "9.0": 9 },
    LV_STYLE_ALIGN: { "8.3": 9, "9.0": 10 },

    LV_STYLE_RADIUS: { "8.3": 11, "9.0": 12 },

    /*Group 1*/
    LV_STYLE_PAD_TOP: { "8.3": 16, "9.0": 16 },
    LV_STYLE_PAD_BOTTOM: { "8.3": 17, "9.0": 17 },
    LV_STYLE_PAD_LEFT: { "8.3": 18, "9.0": 18 },
    LV_STYLE_PAD_RIGHT: { "8.3": 19, "9.0": 19 },

    LV_STYLE_PAD_ROW: { "8.3": 20, "9.0": 20 },
    LV_STYLE_PAD_COLUMN: { "8.3": 21, "9.0": 21 },
    LV_STYLE_LAYOUT: { "8.3": 10, "9.0": 22 },

    LV_STYLE_MARGIN_TOP: { "8.3": undefined, "9.0": 24 }, // ONLY 9.0
    LV_STYLE_MARGIN_BOTTOM: { "8.3": undefined, "9.0": 25 }, // ONLY 9.0
    LV_STYLE_MARGIN_LEFT: { "8.3": undefined, "9.0": 26 }, // ONLY 9.0
    LV_STYLE_MARGIN_RIGHT: { "8.3": undefined, "9.0": 27 }, // ONLY 9.0

    /*Group 2*/
    LV_STYLE_BG_COLOR: { "8.3": 32, "9.0": 28 },
    LV_STYLE_BG_OPA: { "8.3": 33, "9.0": 29 },

    LV_STYLE_BG_GRAD_DIR: { "8.3": 35, "9.0": 32 },
    LV_STYLE_BG_MAIN_STOP: { "8.3": 36, "9.0": 33 },
    LV_STYLE_BG_GRAD_STOP: { "8.3": 37, "9.0": 34 },
    LV_STYLE_BG_GRAD_COLOR: { "8.3": 34, "9.0": 35 },

    LV_STYLE_BG_MAIN_OPA: { "8.3": undefined, "9.0": 36 }, // ONLY 9.0
    LV_STYLE_BG_GRAD_OPA: { "8.3": undefined, "9.0": 37 }, // ONLY 9.0
    LV_STYLE_BG_GRAD: { "8.3": 38, "9.0": 38 },
    LV_STYLE_BASE_DIR: { "8.3": 22, "9.0": 39 },

    LV_STYLE_BG_DITHER_MODE: { "8.3": 39, "9.0": undefined }, // ONLY 8.3

    LV_STYLE_BG_IMG_SRC: { "8.3": 40, "9.0": 40 },
    LV_STYLE_BG_IMG_OPA: { "8.3": 41, "9.0": 41 },
    LV_STYLE_BG_IMG_RECOLOR: { "8.3": 42, "9.0": 42 },
    LV_STYLE_BG_IMG_RECOLOR_OPA: { "8.3": 43, "9.0": 43 },

    LV_STYLE_BG_IMG_TILED: { "8.3": 44, "9.0": 44 },
    LV_STYLE_CLIP_CORNER: { "8.3": 23, "9.0": 45 },

    /*Group 3*/
    LV_STYLE_BORDER_WIDTH: { "8.3": 50, "9.0": 48 },
    LV_STYLE_BORDER_COLOR: { "8.3": 48, "9.0": 49 },
    LV_STYLE_BORDER_OPA: { "8.3": 49, "9.0": 50 },

    LV_STYLE_BORDER_SIDE: { "8.3": 51, "9.0": 52 },
    LV_STYLE_BORDER_POST: { "8.3": 52, "9.0": 53 },

    LV_STYLE_OUTLINE_WIDTH: { "8.3": 53, "9.0": 56 },
    LV_STYLE_OUTLINE_COLOR: { "8.3": 54, "9.0": 57 },
    LV_STYLE_OUTLINE_OPA: { "8.3": 55, "9.0": 58 },
    LV_STYLE_OUTLINE_PAD: { "8.3": 56, "9.0": 59 },

    /*Group 4*/
    LV_STYLE_SHADOW_WIDTH: { "8.3": 64, "9.0": 60 },
    LV_STYLE_SHADOW_COLOR: { "8.3": 68, "9.0": 61 },
    LV_STYLE_SHADOW_OPA: { "8.3": 69, "9.0": 62 },

    LV_STYLE_SHADOW_OFS_X: { "8.3": 65, "9.0": 64 },
    LV_STYLE_SHADOW_OFS_Y: { "8.3": 66, "9.0": 65 },
    LV_STYLE_SHADOW_SPREAD: { "8.3": 67, "9.0": 66 },

    LV_STYLE_IMG_OPA: { "8.3": 70, "9.0": 68 },
    LV_STYLE_IMG_RECOLOR: { "8.3": 71, "9.0": 69 },
    LV_STYLE_IMG_RECOLOR_OPA: { "8.3": 72, "9.0": 70 },

    LV_STYLE_LINE_WIDTH: { "8.3": 73, "9.0": 72 },
    LV_STYLE_LINE_DASH_WIDTH: { "8.3": 74, "9.0": 73 },
    LV_STYLE_LINE_DASH_GAP: { "8.3": 75, "9.0": 74 },
    LV_STYLE_LINE_ROUNDED: { "8.3": 76, "9.0": 75 },
    LV_STYLE_LINE_COLOR: { "8.3": 77, "9.0": 76 },
    LV_STYLE_LINE_OPA: { "8.3": 78, "9.0": 77 },

    /*Group 5*/
    LV_STYLE_ARC_WIDTH: { "8.3": 80, "9.0": 80 },
    LV_STYLE_ARC_ROUNDED: { "8.3": 81, "9.0": 81 },
    LV_STYLE_ARC_COLOR: { "8.3": 82, "9.0": 82 },
    LV_STYLE_ARC_OPA: { "8.3": 83, "9.0": 83 },
    LV_STYLE_ARC_IMG_SRC: { "8.3": 84, "9.0": 84 },

    LV_STYLE_TEXT_COLOR: { "8.3": 85, "9.0": 88 },
    LV_STYLE_TEXT_OPA: { "8.3": 86, "9.0": 89 },
    LV_STYLE_TEXT_FONT: { "8.3": 87, "9.0": 90 },

    LV_STYLE_TEXT_LETTER_SPACE: { "8.3": 88, "9.0": 91 },
    LV_STYLE_TEXT_LINE_SPACE: { "8.3": 89, "9.0": 92 },
    LV_STYLE_TEXT_DECOR: { "8.3": 90, "9.0": 93 },
    LV_STYLE_TEXT_ALIGN: { "8.3": 91, "9.0": 94 },

    LV_STYLE_OPA: { "8.3": 96, "9.0": 95 },
    LV_STYLE_OPA_LAYERED: { "8.3": 97, "9.0": 96 },
    LV_STYLE_COLOR_FILTER_DSC: { "8.3": 98, "9.0": 97 },
    LV_STYLE_COLOR_FILTER_OPA: { "8.3": 99, "9.0": 98 },

    LV_STYLE_ANIM: { "8.3": 100, "9.0": 99 },
    LV_STYLE_ANIM_TIME: { "8.3": 101, "9.0": undefined }, // ONLY 8.3
    LV_STYLE_ANIM_DURATION: { "8.3": undefined, "9.0": 100 }, // ONLY 9.0
    LV_STYLE_ANIM_SPEED: { "8.3": 102, "9.0": undefined }, // ONLY 8.3
    LV_STYLE_TRANSITION: { "8.3": 103, "9.0": 102 },

    LV_STYLE_BLEND_MODE: { "8.3": 104, "9.0": 103 },
    LV_STYLE_TRANSFORM_WIDTH: { "8.3": 105, "9.0": 104 },
    LV_STYLE_TRANSFORM_HEIGHT: { "8.3": 106, "9.0": 105 },
    LV_STYLE_TRANSLATE_X: { "8.3": 107, "9.0": 106 },
    LV_STYLE_TRANSLATE_Y: { "8.3": 108, "9.0": 107 },
    LV_STYLE_TRANSFORM_ZOOM: { "8.3": 109, "9.0": undefined }, // ONLY 8.3
    LV_STYLE_TRANSFORM_SCALE_X: { "8.3": undefined, "9.0": 108 }, // ONLY 9.0
    LV_STYLE_TRANSFORM_SCALE_Y: { "8.3": undefined, "9.0": 109 }, // ONLY 9.0
    LV_STYLE_TRANSFORM_ANGLE: { "8.3": 110, "9.0": undefined }, // ONLY 8.3
    LV_STYLE_TRANSFORM_ROTATION: { "8.3": undefined, "9.0": 110 }, // ONLY 9.0
    LV_STYLE_TRANSFORM_PIVOT_X: { "8.3": 111, "9.0": 111 },
    LV_STYLE_TRANSFORM_PIVOT_Y: { "8.3": 112, "9.0": 112 },
    LV_STYLE_TRANSFORM_SKEW_X: { "8.3": undefined, "9.0": 113 }, // ONLY 9.0
    LV_STYLE_TRANSFORM_SKEW_Y: { "8.3": undefined, "9.0": 114 }, // ONLY 9.0

    /* Flex */
    LV_STYLE_FLEX_FLOW: { "8.3": 113, "9.0": 115 },
    LV_STYLE_FLEX_MAIN_PLACE: { "8.3": 114, "9.0": 116 },
    LV_STYLE_FLEX_CROSS_PLACE: { "8.3": 115, "9.0": 117 },
    LV_STYLE_FLEX_TRACK_PLACE: { "8.3": 116, "9.0": 118 },
    LV_STYLE_FLEX_GROW: { "8.3": 0, "9.0": 119 },

    /* Grid */
    LV_STYLE_GRID_COLUMN_ALIGN: { "8.3": 119, "9.0": 120 },
    LV_STYLE_GRID_ROW_ALIGN: { "8.3": 120, "9.0": 121 },
    LV_STYLE_GRID_ROW_DSC_ARRAY: { "8.3": 118, "9.0": 122 },
    LV_STYLE_GRID_COLUMN_DSC_ARRAY: { "8.3": 117, "9.0": 123 },
    LV_STYLE_GRID_CELL_COLUMN_POS: { "8.3": 124, "9.0": 124 },
    LV_STYLE_GRID_CELL_COLUMN_SPAN: { "8.3": 123, "9.0": 125 },
    LV_STYLE_GRID_CELL_X_ALIGN: { "8.3": 125, "9.0": 126 },
    LV_STYLE_GRID_CELL_ROW_POS: { "8.3": 122, "9.0": 127 },
    LV_STYLE_GRID_CELL_ROW_SPAN: { "8.3": 121, "9.0": 128 },
    LV_STYLE_GRID_CELL_Y_ALIGN: { "8.3": 126, "9.0": 129 }
};

////////////////////////////////////////////////////////////////////////////////

const _LV_FLEX_COLUMN = 1 << 0;
const _LV_FLEX_WRAP = 1 << 2;
const _LV_FLEX_REVERSE = 1 << 3;

export const LV_LAYOUT_NONE = 0;
export const LV_LAYOUT_FLEX = 1;
export const LV_LAYOUT_GRID = 2;

export const LV_FLEX_FLOW_ROW = 0x00;
export const LV_FLEX_FLOW_COLUMN = _LV_FLEX_COLUMN;
export const LV_FLEX_FLOW_ROW_WRAP = LV_FLEX_FLOW_ROW | _LV_FLEX_WRAP;
export const LV_FLEX_FLOW_ROW_REVERSE = LV_FLEX_FLOW_ROW | _LV_FLEX_REVERSE;
export const LV_FLEX_FLOW_ROW_WRAP_REVERSE =
    LV_FLEX_FLOW_ROW | _LV_FLEX_WRAP | _LV_FLEX_REVERSE;
export const LV_FLEX_FLOW_COLUMN_WRAP = LV_FLEX_FLOW_COLUMN | _LV_FLEX_WRAP;
export const LV_FLEX_FLOW_COLUMN_REVERSE =
    LV_FLEX_FLOW_COLUMN | _LV_FLEX_REVERSE;
export const LV_FLEX_FLOW_COLUMN_WRAP_REVERSE =
    LV_FLEX_FLOW_COLUMN | _LV_FLEX_WRAP | _LV_FLEX_REVERSE;

export const LV_FLEX_ALIGN_START = 0;
export const LV_FLEX_ALIGN_END = 1;
export const LV_FLEX_ALIGN_CENTER = 2;
export const LV_FLEX_ALIGN_SPACE_EVENLY = 3;
export const LV_FLEX_ALIGN_SPACE_AROUND = 4;
export const LV_FLEX_ALIGN_SPACE_BETWEEN = 5;

const LV_SCROLLBAR_MODE_OFF = 0;
const LV_SCROLLBAR_MODE_ON = 1;
const LV_SCROLLBAR_MODE_ACTIVE = 2;
const LV_SCROLLBAR_MODE_AUTO = 3;

export const LVGL_SCROLL_BAR_MODES: { [key: string]: number } = {
    off: LV_SCROLLBAR_MODE_OFF,
    on: LV_SCROLLBAR_MODE_ON,
    active: LV_SCROLLBAR_MODE_ACTIVE,
    auto: LV_SCROLLBAR_MODE_AUTO
};

export const LV_DIR_NONE = 0x00;
export const LV_DIR_LEFT = 1 << 0;
export const LV_DIR_RIGHT = 1 << 1;
export const LV_DIR_TOP = 1 << 2;
export const LV_DIR_BOTTOM = 1 << 3;
export const LV_DIR_HOR = LV_DIR_LEFT | LV_DIR_RIGHT;
export const LV_DIR_VER = LV_DIR_TOP | LV_DIR_BOTTOM;
export const LV_DIR_ALL = LV_DIR_HOR | LV_DIR_VER;

export const LVGL_SCROLL_DIRECTION: { [key: string]: number } = {
    none: LV_DIR_NONE,
    left: LV_DIR_LEFT,
    right: LV_DIR_RIGHT,
    top: LV_DIR_TOP,
    bottom: LV_DIR_BOTTOM,
    hor: LV_DIR_HOR,
    ver: LV_DIR_VER,
    all: LV_DIR_ALL
};

export const LV_ANIM_OFF = 0;
export const LV_ANIM_ON = 1;

export const LV_EVENT_CHECKED = 0x7e;
export const LV_EVENT_UNCHECKED = 0x7f;

////////////////////////////////////////////////////////////////////////////////

export const LVGL_FLAG_CODES = {
    HIDDEN: 1 << 0, // Make the object hidden. (Like it wasn't there at all)
    CLICKABLE: 1 << 1, // Make the object clickable by the input devices
    CLICK_FOCUSABLE: 1 << 2, // Add focused state to the object when clicked
    CHECKABLE: 1 << 3, // Toggle checked state when the object is clicked
    SCROLLABLE: 1 << 4, // Make the object scrollable
    SCROLL_ELASTIC: 1 << 5, // Allow scrolling inside but with slower speed
    SCROLL_MOMENTUM: 1 << 6, // Make the object scroll further when "thrown"
    SCROLL_ONE: 1 << 7, // Allow scrolling only one snappable children
    SCROLL_CHAIN_HOR: 1 << 8, // Allow propagating the horizontal scroll to a parent
    SCROLL_CHAIN_VER: 1 << 9, // Allow propagating the vertical scroll to a parent
    SCROLL_CHAIN: (1 << 8) | (1 << 9),
    SCROLL_ON_FOCUS: 1 << 10, // Automatically scroll object to make it visible when focused
    SCROLL_WITH_ARROW: 1 << 11, // Allow scrolling the focused object with arrow keys
    SNAPPABLE: 1 << 12, // If scroll snap is enabled on the parent it can snap to this object
    PRESS_LOCK: 1 << 13, // Keep the object pressed even if the press slid from the object
    EVENT_BUBBLE: 1 << 14, // Propagate the events to the parent too
    GESTURE_BUBBLE: 1 << 15, // Propagate the gestures to the parent
    ADV_HITTEST: 1 << 16, // Allow performing more accurate hit (click) test. E.g. consider rounded corners.
    IGNORE_LAYOUT: 1 << 17, // Make the object position-able by the layouts
    FLOATING: 1 << 18, // Do not scroll the object when the parent scrolls and ignore layout
    OVERFLOW_VISIBLE: 1 << 19 // Do not clip the children's content to the parent's boundary*/
};

export const LVGL_FLAG_CODES_90 = {
    HIDDEN: 1 << 0, // Make the object hidden. (Like it wasn't there at all)
    CLICKABLE: 1 << 1, // Make the object clickable by the input devices
    CLICK_FOCUSABLE: 1 << 2, // Add focused state to the object when clicked
    CHECKABLE: 1 << 3, // Toggle checked state when the object is clicked
    SCROLLABLE: 1 << 4, // Make the object scrollable
    SCROLL_ELASTIC: 1 << 5, // Allow scrolling inside but with slower speed
    SCROLL_MOMENTUM: 1 << 6, // Make the object scroll further when "thrown"
    SCROLL_ONE: 1 << 7, // Allow scrolling only one snappable children
    SCROLL_CHAIN_HOR: 1 << 8, // Allow propagating the horizontal scroll to a parent
    SCROLL_CHAIN_VER: 1 << 9, // Allow propagating the vertical scroll to a parent
    SCROLL_CHAIN: (1 << 8) | (1 << 9),
    SCROLL_ON_FOCUS: 1 << 10, // Automatically scroll object to make it visible when focused
    SCROLL_WITH_ARROW: 1 << 11, // Allow scrolling the focused object with arrow keys
    SNAPPABLE: 1 << 12, // If scroll snap is enabled on the parent it can snap to this object
    PRESS_LOCK: 1 << 13, // Keep the object pressed even if the press slid from the object
    EVENT_BUBBLE: 1 << 14, // Propagate the events to the parent too
    GESTURE_BUBBLE: 1 << 15, // Propagate the gestures to the parent
    ADV_HITTEST: 1 << 16, // Allow performing more accurate hit (click) test. E.g. consider rounded corners.
    IGNORE_LAYOUT: 1 << 17, // Make the object position-able by the layouts
    FLOATING: 1 << 18, // Do not scroll the object when the parent scrolls and ignore layout
    OVERFLOW_VISIBLE: 1 << 20 // Do not clip the children's content to the parent's boundary*/
};

////////////////////////////////////////////////////////////////////////////////

export const LVGL_REACTIVE_FLAGS: (keyof typeof LVGL_FLAG_CODES)[] = [
    "HIDDEN",
    "CLICKABLE"
];

export const LVGL_STATE_CODES = {
    CHECKED: 0x0001,
    DISABLED: 0x0080,
    FOCUSED: 0x0002,
    PRESSED: 0x0020
};

export const LVGL_REACTIVE_STATES: (keyof typeof LVGL_STATE_CODES)[] = [
    "CHECKED",
    "DISABLED"
];

export const LVGL_STYLE_STATES = [
    "DEFAULT",
    "CHECKED",
    "PRESSED",
    "CHECKED|PRESSED",
    "DISABLED",
    "FOCUSED"
];

////////////////////////////////////////////////////////////////////////////////

export const lvglStates = {
    DEFAULT: 0x0000, // LV_STATE_DEFAULT
    CHECKED: 0x0001, // LV_STATE_CHECKED
    FOCUSED: 0x0002, // LV_STATE_FOCUSED,
    FOCUS_KEY: 0x0004, // LV_STATE_FOCUS_KEY
    EDITED: 0x0008, // LV_STATE_EDITED,
    HOVERED: 0x0010, // LV_STATE_HOVERED
    PRESSED: 0x0020, // LV_STATE_PRESSED
    SCROLLEd: 0x0040, // LV_STATE_SCROLLED
    DISABLED: 0x0080, // LV_STATE_DISABLED

    USER_1: 0x1000, // LV_STATE_USER_1,
    USER_2: 0x2000, // LV_STATE_USER_1,
    USER_3: 0x4000, // LV_STATE_USER_1,
    USER_4: 0x8000, // LV_STATE_USER_1,

    ANY: 0xffff // Special value can be used in some functions to target all states
};

////////////////////////////////////////////////////////////////////////////////

export const LVGL_PARTS_8: { [key: string]: number } = {
    MAIN: 0x000000, // LV_PART_MAIN         A background like rectangle
    SCROLLBAR: 0x010000, // LV_PART_SCROLLBAR    The scrollbar(s)
    INDICATOR: 0x020000, // LV_PART_INDICATOR    Indicator, e.g. for slider, bar, switch, or the tick box of the checkbox
    KNOB: 0x030000, // LV_PART_KNOB         Like handle to grab to adjust the value
    SELECTED: 0x040000, // LV_PART_SELECTED     Indicate the currently selected option or section
    ITEMS: 0x050000, // LV_PART_ITEMS        Used if the widget has multiple similar elements (e.g. table cells)
    TICKS: 0x060000, // LV_PART_TICKS        Ticks on scale e.g. for a chart or meter
    CURSOR: 0x070000, // LV_PART_CURSOR       Mark a specific place e.g. for text area's cursor or on a chart

    CUSTOM1: 0x080000, // LV_PART_CUSTOM_FIRST Extension point for custom widgets

    ANY: 0x0f0000 // LV_PART_ANY          Special value can be used in some functions to target all parts
};

export const LVGL_PARTS_9: { [key: string]: number } = {
    MAIN: 0x000000, // LV_PART_MAIN         A background like rectangle
    SCROLLBAR: 0x010000, // LV_PART_SCROLLBAR    The scrollbar(s)
    INDICATOR: 0x020000, // LV_PART_INDICATOR    Indicator, e.g. for slider, bar, switch, or the tick box of the checkbox
    KNOB: 0x030000, // LV_PART_KNOB         Like handle to grab to adjust the value
    SELECTED: 0x040000, // LV_PART_SELECTED     Indicate the currently selected option or section
    ITEMS: 0x050000, // LV_PART_ITEMS        Used if the widget has multiple similar elements (e.g. table cells)
    CURSOR: 0x060000, // LV_PART_CURSOR       Mark a specific place e.g. for text area's cursor or on a chart

    CUSTOM1: 0x080000, // LV_PART_CUSTOM_FIRST Extension point for custom widgets

    ANY: 0x0f0000 // LV_PART_ANY          Special value can be used in some functions to target all parts
};

export type LVGLParts = string;

////////////////////////////////////////////////////////////////////////////////

export const LV_EVENT_METER_TICK_LABEL_EVENT = 0x76;
export const LV_EVENT_DROPDOWN_SELECTED_CHANGED = 0x77;
export const LV_EVENT_ROLLER_SELECTED_CHANGED = 0x78;
export const LV_EVENT_TEXTAREA_TEXT_CHANGED = 0x79;
export const LV_EVENT_CHECKED_STATE_CHANGED = 0x7a;
export const LV_EVENT_ARC_VALUE_CHANGED = 0x7b;
export const LV_EVENT_SLIDER_VALUE_CHANGED = 0x7c;
export const LV_EVENT_SLIDER_VALUE_LEFT_CHANGED = 0x7d;

////////////////////////////////////////////////////////////////////////////////

export const CF_ALPHA_1_BIT = 1;
export const CF_ALPHA_2_BIT = 2;
export const CF_ALPHA_4_BIT = 3;
export const CF_ALPHA_8_BIT = 4;

export const CF_L8 = 0x06;

export const CF_RGB565 = 15;
export const CF_RGB565A8 = 16;

export const CF_TRUE_COLOR = 24;
export const CF_TRUE_COLOR_ALPHA = 32;
export const CF_TRUE_COLOR_CHROMA = 33;

export const CF_INDEXED_1_BIT = 41;
export const CF_INDEXED_2_BIT = 42;
export const CF_INDEXED_4_BIT = 43;
export const CF_INDEXED_8_BIT = 44;

export const CF_RAW = 51;
export const CF_RAW_CHROMA = 52;
export const CF_RAW_ALPHA = 53;

////////////////////////////////////////////////////////////////////////////////

// _lv_label_long_mode_t
export const LONG_MODE_CODES = {
    WRAP: 0,
    DOT: 1,
    SCROLL: 2,
    SCROLL_CIRCULAR: 3,
    CLIP: 4
};

// lv_slider_mode_t
export const SLIDER_MODES = {
    NORMAL: 0,
    SYMMETRICAL: 1,
    RANGE: 2
};

// lv_roller_mode_t
export const ROLLER_MODES = {
    NORMAL: 0,
    INFINITE: 1
};

// lv_bar_mode_t
export const BAR_MODES = {
    NORMAL: 0,
    SYMMETRICAL: 1,
    RANGE: 2
};

// _lv_arc_mode_t
export const ARC_MODES = {
    NORMAL: 0,
    REVERSE: 1,
    SYMMETRICAL: 2
};

// lv_colorwheel_mode_t
export const COLORWHEEL_MODES = {
    HUE: 0,
    SATURATION: 1,
    VALUE: 2
};

// lv_imgbtn_state_t
export const enum ImgbuttonStates {
    LV_IMGBTN_STATE_RELEASED,
    LV_IMGBTN_STATE_PRESSED,
    LV_IMGBTN_STATE_DISABLED,
    LV_IMGBTN_STATE_CHECKED_RELEASED,
    LV_IMGBTN_STATE_CHECKED_PRESSED,
    LV_IMGBTN_STATE_CHECKED_DISABLED
}

// lv_keyboard_mode_t
export const KEYBOARD_MODES = {
    TEXT_LOWER: 0,
    TEXT_UPPER: 1,
    SPECIAL: 2,
    NUMBER: 3,
    USER1: 4,
    USER2: 5,
    USER3: 6,
    USER4: 7
};

// lv_scale_mode_t, LV_SCALE_MODE_
export const SCALE_MODES = {
    HORIZONTAL_TOP: 0x00,
    HORIZONTAL_BOTTOM: 0x01,
    VERTICAL_LEFT: 0x02,
    VERTICAL_RIGHT: 0x04,
    ROUND_INNER: 0x08,
    ROUND_OUTER: 0x10
};
