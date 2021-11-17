/// <reference path="./globals.d.ts"/>
import "bootstrap";
import React from "react";
import ReactDOM from "react-dom";
import { configure } from "mobx";
import { observer } from "mobx-react";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";

import { loadExtensions } from "eez-studio-shared/extensions/extensions";

import * as notification from "eez-studio-ui/notification";
import { showAboutBox } from "eez-studio-ui/about-box";

import type * as ImportInstrumentDefinitionModule from "instrument/import-instrument-definition";

import { handleDragAndDrop } from "home/drag-and-drop";
import { loadTabs, ProjectEditorTab, tabs } from "home/tabs-store";
import { settingsController } from "home/settings";
import { App } from "home/app";

import "home/settings";

configure({ enforceActions: "observed" });

// make sure we store all the values waiting to be stored inside blur event handler
function blurAll() {
    var tmp = document.createElement("input");
    document.body.appendChild(tmp);
    tmp.focus();
    document.body.removeChild(tmp);
}

async function beforeAppClose() {
    blurAll();

    for (const tab of tabs.tabs) {
        if (tab.beforeAppClose) {
            if (!(await tab.beforeAppClose())) {
                return false;
            }
        }
    }

    const {
        destroyExtensions
    } = require("eez-studio-shared/extensions/extensions");
    destroyExtensions();

    return true;
}

EEZStudio.electron.ipcRenderer.on("beforeClose", async () => {
    if (await beforeAppClose()) {
        EEZStudio.electron.ipcRenderer.send("readyToClose");
    }
});

EEZStudio.electron.ipcRenderer.on("reload", async () => {
    if (await beforeAppClose()) {
        EEZStudio.electron.ipcRenderer.send("reload");
    }
});

EEZStudio.electron.ipcRenderer.on("switch-theme", async () => {
    settingsController.switchTheme(!settingsController.isDarkTheme);
});

EEZStudio.electron.ipcRenderer.on(
    "importInstrumentDefinitionFile",
    (sender: any, filePath: string) => {
        const { importInstrumentDefinition } =
            require("instrument/import-instrument-definition") as typeof ImportInstrumentDefinitionModule;
        importInstrumentDefinition(filePath);
    }
);

EEZStudio.electron.ipcRenderer.on("show-about-box", async () => {
    showAboutBox();
});

EEZStudio.electron.ipcRenderer.on(
    "open-project",
    async (sender: any, filePath: any) => {
        try {
            let tab = tabs.findProjectEditorTab(filePath);
            if (!tab) {
                tab = tabs.addProjectTab(filePath);
            }
            if (tab) {
                tab.makeActive();
            }
        } catch (err) {
            console.error(err);
        }
    }
);

EEZStudio.electron.ipcRenderer.on(
    "load-debug-info",
    async (sender: any, filePath: any) => {
        try {
            let tab = tabs.activeTab;
            if (tab instanceof ProjectEditorTab) {
                tab.loadDebugInfo(filePath);
            }
        } catch (err) {
            console.error(err);
        }
    }
);

EEZStudio.electron.ipcRenderer.on(
    "new-project",
    async (sender: any, filePath: any) => {
        const { showNewProjectWizard } = await import(
            "project-editor/project/Wizard"
        );
        showNewProjectWizard();
    }
);

EEZStudio.electron.ipcRenderer.on("command-palette", () => {
    if (tabs.activeTab && tabs.activeTab.showCommandPalette) {
        tabs.activeTab.showCommandPalette();
    }
});

@observer
class Main extends React.Component {
    render() {
        return (
            <DndProvider backend={HTML5Backend}>
                {this.props.children}
                {notification.container}
            </DndProvider>
        );
    }
}

async function main() {
    await loadExtensions();

    loadTabs();

    ReactDOM.render(
        <Main>
            <App />
        </Main>,
        document.getElementById("EezStudio_Content")
    );

    handleDragAndDrop();

    EEZStudio.electron.ipcRenderer.send("open-command-line-project");
}

main();

//require("eez-studio-shared/module-stat");
