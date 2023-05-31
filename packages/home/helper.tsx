import { ProjectType } from "project-editor/project/project";
import {
    DASHBOARD_PROJECT_ICON,
    EEZ_GUI_PROJECT_ICON,
    MICROPYTHON_ICON,
    APPLET_ICON
} from "project-editor/ui-components/icons";

export function getProjectIcon(
    filePath: string,
    projectType: string,
    size: number
) {
    if (projectType == ProjectType.LVGL) {
        return "../eez-studio-ui/_images/eez-project-lvgl.png";
    }

    const isProject = filePath.endsWith(".eez-project");
    if (!isProject || projectType == ProjectType.DASHBOARD) {
        return DASHBOARD_PROJECT_ICON(size);
    }

    if (projectType == ProjectType.RESOURCE) {
        return MICROPYTHON_ICON(size);
    }

    if (projectType == ProjectType.APPLET) {
        return APPLET_ICON(size);
    }

    return EEZ_GUI_PROJECT_ICON(size);
}
