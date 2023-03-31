import { dialog, getCurrentWindow } from "@electron/remote";
import React from "react";
import {
    observable,
    computed,
    action,
    runInAction,
    autorun,
    makeObservable,
    IReactionDisposer
} from "mobx";
import { observer } from "mobx-react";
import classNames from "classnames";

var sha256 = require("sha256");

import { compareVersions, studioVersion } from "eez-studio-shared/util";
import { humanize } from "eez-studio-shared/string";

import { IExtension } from "eez-studio-shared/extensions/extension";
import {
    extensions,
    installExtension,
    uninstallExtension,
    changeExtensionImage,
    exportExtension
} from "eez-studio-shared/extensions/extensions";

import {
    copyFile,
    getTempFilePath,
    getValidFileNameFromFileName,
    writeBinaryData
} from "eez-studio-shared/util-electron";
import { stringCompare } from "eez-studio-shared/string";

import { Splitter } from "eez-studio-ui/splitter";
import {
    VerticalHeaderWithBody,
    Header,
    ToolbarHeader,
    Body
} from "eez-studio-ui/header-with-body";
import { Toolbar } from "eez-studio-ui/toolbar";
import {
    ButtonAction,
    DropdownIconAction,
    DropdownItem
} from "eez-studio-ui/action";
import { List, ListItem, IListNode } from "eez-studio-ui/list";
import {
    info,
    confirm,
    confirmWithButtons
} from "eez-studio-ui/dialog-electron";
import * as notification from "eez-studio-ui/notification";

import { ExtensionShortcuts } from "home/extensions-manager/extension-shortcuts";
import { extensionsCatalog } from "home/extensions-manager/catalog";

////////////////////////////////////////////////////////////////////////////////

const installedExtensions = computed(() => {
    return Array.from(extensions.values()).filter(
        extension => !extension.preInstalled
    );
});

////////////////////////////////////////////////////////////////////////////////

export enum ViewFilter {
    ALL,
    INSTALLED,
    NOT_INSTALLED,
    NEW_VERSIONS
}

interface IExtensionVersions {
    allVersions: IExtension[];
    installedVersion?: IExtension;
    latestVersion: IExtension;
    versionInFocus: IExtension; // installed || latest
}

class ExtensionsVersionsCatalogBuilder {
    extensionsVersions: IExtensionVersions[] = [];

    isInstalled(extension: IExtension) {
        return !!extension.installationFolderPath;
    }

    addVersion(extensionVersions: IExtensionVersions, extension: IExtension) {
        for (let i = 0; i < extensionVersions.allVersions.length; ++i) {
            const compareResult = compareVersions(
                extension.version,
                extensionVersions.allVersions[i].version
            );

            if (compareResult > 0) {
                extensionVersions.allVersions.splice(i, 0, extension);
                return;
            }

            if (compareResult === 0) {
                if (this.isInstalled(extension)) {
                    extensionVersions.allVersions[i] = extension;
                }
                return;
            }
        }

        extensionVersions.allVersions.push(extension);
    }

    addExtension(extension: IExtension) {
        for (let i = 0; i < this.extensionsVersions.length; ++i) {
            const extensionVersions = this.extensionsVersions[i];
            if (extensionVersions.versionInFocus.id === extension.id) {
                // a new version of already seen extension
                this.addVersion(extensionVersions, extension);

                if (
                    compareVersions(
                        extension.version,
                        extensionVersions.latestVersion.version
                    ) > 0
                ) {
                    extensionVersions.latestVersion = extension;
                }

                if (this.isInstalled(extension)) {
                    extensionVersions.installedVersion = extension;
                }

                extensionVersions.versionInFocus =
                    extensionVersions.installedVersion ||
                    extensionVersions.latestVersion;

                return;
            }
        }

        // a new extension
        const extensionVersions: IExtensionVersions = {
            allVersions: [extension],
            latestVersion: extension,
            versionInFocus: extension
        };

        if (this.isInstalled(extension)) {
            extensionVersions.installedVersion = extension;
        }

        this.extensionsVersions.push(extensionVersions);
    }

    get(viewFilter: ViewFilter) {
        if (viewFilter === ViewFilter.ALL) {
            return this.extensionsVersions;
        } else if (viewFilter === ViewFilter.INSTALLED) {
            return this.extensionsVersions.filter(
                extensionVersions => !!extensionVersions.installedVersion
            );
        } else if (viewFilter === ViewFilter.NOT_INSTALLED) {
            return this.extensionsVersions.filter(
                extensionVersions => !extensionVersions.installedVersion
            );
        } else {
            return this.extensionsVersions.filter(
                extensionVersions =>
                    extensionVersions.installedVersion &&
                    compareVersions(
                        extensionVersions.latestVersion.version,
                        extensionVersions.installedVersion.version
                    ) > 0
            );
        }
    }
}

////////////////////////////////////////////////////////////////////////////////

export class ExtensionsManagerStore {
    selectedExtension: IExtension | undefined;
    _viewFilter: ViewFilter | undefined;

    constructor() {
        makeObservable(this, {
            selectedExtension: observable,
            _viewFilter: observable,
            viewFilter: computed,
            extensionsVersionsCatalogBuilder: computed,
            all: computed,
            installed: computed,
            notInstalled: computed,
            newVersions: computed,
            extensionNodes: computed,
            selectExtensionById: action,
            selectedExtensionVersions: computed
        });
    }

    get viewFilter() {
        if (this._viewFilter !== undefined) {
            return this._viewFilter;
        }

        if (this.newVersions.length > 0) {
            return ViewFilter.NEW_VERSIONS;
        }

        return ViewFilter.ALL;
    }

    set viewFilter(value: ViewFilter) {
        this._viewFilter = value;
    }

    get extensionsVersionsCatalogBuilder() {
        const builder = new ExtensionsVersionsCatalogBuilder();

        installedExtensions
            .get()
            .forEach(extension => builder.addExtension(extension));

        extensionsCatalog.catalog.forEach(extension => {
            const extensionMinStudioVersion = (extension as any)["eez-studio"]
                .minVersion;
            if (extensionMinStudioVersion !== undefined) {
                if (
                    compareVersions(studioVersion, extensionMinStudioVersion) <
                    0
                ) {
                    return;
                }
            }

            builder.addExtension(extension);
        });

        return builder;
    }

    get all() {
        return this.extensionsVersionsCatalogBuilder.get(ViewFilter.ALL);
    }

    get installed() {
        return this.extensionsVersionsCatalogBuilder.get(ViewFilter.INSTALLED);
    }

    get notInstalled() {
        return this.extensionsVersionsCatalogBuilder.get(
            ViewFilter.NOT_INSTALLED
        );
    }

    get newVersions() {
        return this.extensionsVersionsCatalogBuilder.get(
            ViewFilter.NEW_VERSIONS
        );
    }

    get extensionNodes() {
        return this.extensionsVersionsCatalogBuilder
            .get(extensionsManagerStore.viewFilter)
            .sort((a, b) =>
                stringCompare(
                    a.versionInFocus.displayName || a.versionInFocus.name,
                    b.versionInFocus.displayName || b.versionInFocus.name
                )
            )
            .map(extension => ({
                id: extension.versionInFocus.id,
                data: extension.versionInFocus,
                selected:
                    extensionsManagerStore.selectedExtension !== undefined &&
                    extension.versionInFocus.id ===
                        extensionsManagerStore.selectedExtension.id
            }));
    }

    selectExtensionById(id: string) {
        const extensionNode = this.extensionNodes.find(
            extensionNode => extensionNode.id === id
        );
        this.selectedExtension =
            (extensionNode && extensionNode.data) || undefined;
    }

    getExtensionVersionsById(id: string) {
        return this.extensionsVersionsCatalogBuilder
            .get(ViewFilter.ALL)
            .find(
                extensionVersions => extensionVersions.versionInFocus.id === id
            );
    }

    get selectedExtensionVersions() {
        if (!this.selectedExtension) {
            return undefined;
        }
        return this.getExtensionVersionsById(this.selectedExtension.id);
    }

    getSelectedExtensionByVersion(version: string) {
        return (
            this.selectedExtensionVersions &&
            this.selectedExtensionVersions.allVersions.find(
                extension => extension.version === version
            )
        );
    }
}

export const extensionsManagerStore = new ExtensionsManagerStore();

////////////////////////////////////////////////////////////////////////////////

export const ExtensionInMasterView = observer(
    class ExtensionInMasterView extends React.Component<
        {
            extension: IExtension;
        },
        {}
    > {
        constructor(props: { extension: IExtension }) {
            super(props);

            makeObservable(this, {
                extensionInstalled: computed
            });
        }

        get extensionInstalled() {
            const extensionVersions =
                extensionsManagerStore.getExtensionVersionsById(
                    this.props.extension.id
                );
            return extensionVersions && extensionVersions.installedVersion;
        }

        render() {
            const badgeClassName = classNames("badge", {
                "bg-success": this.extensionInstalled,
                "bg-secondary": !this.extensionInstalled
            });

            return (
                <ListItem
                    leftIcon={this.props.extension.image}
                    leftIconSize={64}
                    label={
                        <div>
                            <div
                                style={{
                                    display: "flex",
                                    flexDirection: "row",
                                    justifyContent: "space-between"
                                }}
                            >
                                <h5
                                    className="EezStudio_NoWrap"
                                    style={{ marginBottom: 0 }}
                                >
                                    {this.props.extension.displayName ||
                                        this.props.extension.name}
                                    <span
                                        className={badgeClassName}
                                        style={{
                                            marginLeft: 10,
                                            fontSize: "70%"
                                        }}
                                    >
                                        <div>
                                            {this.extensionInstalled
                                                ? "Installed"
                                                : "Not installed"}
                                        </div>
                                    </span>
                                </h5>
                                <small>{this.props.extension.version}</small>
                            </div>
                            <div>{this.props.extension.description}</div>
                            <div className="EezStudio_NoWrap">
                                <small>{this.props.extension.author}</small>
                            </div>
                        </div>
                    }
                />
            );
        }
    }
);

////////////////////////////////////////////////////////////////////////////////

function confirmMessage(extension: IExtension) {
    return `You are about to install version ${extension.version} of the '${
        extension.displayName || extension.name
    }' extension.`;
}

const BUTTON_INSTRUCTIONS = `
Click 'OK' to replace the installed version.
Click 'Cancel' to stop the installation.`;

const BUTTONS = ["OK", "Cancel"];

const MasterView = observer(
    class MasterView extends React.Component {
        isUpdatingAll: boolean = false;

        constructor(props: any) {
            super(props);

            makeObservable(this, {
                isUpdatingAll: observable
            });
        }

        installExtension = async () => {
            const result = await dialog.showOpenDialog({
                properties: ["openFile"],
                filters: [
                    { name: "Extensions", extensions: ["zip"] },
                    { name: "All Files", extensions: ["*"] }
                ]
            });

            const filePaths = result.filePaths;
            if (filePaths && filePaths[0]) {
                try {
                    let filePath = filePaths[0];

                    const extension = await installExtension(filePath, {
                        notFound() {
                            info(
                                "This is not a valid extension package file.",
                                undefined
                            );
                        },
                        async confirmReplaceNewerVersion(
                            newExtension: IExtension,
                            existingExtension: IExtension
                        ) {
                            return (
                                (await confirmWithButtons(
                                    confirmMessage(newExtension),
                                    `The newer version ${existingExtension.version} is already installed.${BUTTON_INSTRUCTIONS}`,
                                    BUTTONS
                                )) === 0
                            );
                        },
                        async confirmReplaceOlderVersion(
                            newExtension: IExtension,
                            existingExtension: IExtension
                        ) {
                            return (
                                (await confirmWithButtons(
                                    confirmMessage(newExtension),
                                    `The older version ${existingExtension.version} is already installed.${BUTTON_INSTRUCTIONS}`,
                                    BUTTONS
                                )) === 0
                            );
                        },
                        async confirmReplaceTheSameVersion(
                            newExtension: IExtension,
                            existingExtension: IExtension
                        ) {
                            return (
                                (await confirmWithButtons(
                                    confirmMessage(newExtension),
                                    `That version is already installed.${BUTTON_INSTRUCTIONS}`,
                                    BUTTONS
                                )) === 0
                            );
                        }
                    });

                    if (extension) {
                        notification.success(
                            `Extension "${
                                extension.displayName || extension.name
                            }" installed`
                        );

                        extensionsManagerStore.selectExtensionById(
                            extension.id
                        );
                    }
                } catch (err) {
                    notification.error(err.toString());
                }
            }
        };

        updateCatalog = async () => {
            if (!(await extensionsCatalog.checkNewVersionOfCatalog())) {
                notification.info(
                    "There is currently no new version of catalog available."
                );
            }
        };

        updateAll = async () => {
            runInAction(() => (this.isUpdatingAll = true));

            const extensionsToUpdate =
                extensionsManagerStore.extensionNodes.map(
                    extensionNode =>
                        extensionsManagerStore.getExtensionVersionsById(
                            extensionNode.data.id
                        )!.latestVersion
                );

            const progressToastId = notification.info("Updating...", {
                autoClose: false
            });
            await new Promise(resolve => setTimeout(resolve, 500));

            for (let i = 0; i < extensionsToUpdate.length; ++i) {
                await downloadAndInstallExtension(
                    extensionsToUpdate[i],
                    progressToastId
                );
            }

            notification.update(progressToastId, {
                render: "All extensions successfully updated!",
                type: notification.SUCCESS,
                autoClose: 5000
            });

            runInAction(() => (this.isUpdatingAll = false));
        };

        render() {
            return (
                <VerticalHeaderWithBody>
                    <ToolbarHeader>
                        <div style={{ flexGrow: 1 }}>
                            <label style={{ paddingRight: 5 }}>View:</label>
                            <label className="form-check-label">
                                <select
                                    className="form-control"
                                    value={extensionsManagerStore.viewFilter}
                                    onChange={action(
                                        (
                                            event: React.ChangeEvent<HTMLSelectElement>
                                        ) =>
                                            (extensionsManagerStore.viewFilter =
                                                parseInt(
                                                    event.currentTarget.value
                                                ))
                                    )}
                                >
                                    <option value={ViewFilter.ALL.toString()}>
                                        All ({extensionsManagerStore.all.length}
                                        )
                                    </option>
                                    {extensionsManagerStore.installed.length >
                                        0 && (
                                        <option
                                            value={ViewFilter.INSTALLED.toString()}
                                        >
                                            Installed (
                                            {
                                                extensionsManagerStore.installed
                                                    .length
                                            }
                                            )
                                        </option>
                                    )}
                                    {extensionsManagerStore.notInstalled
                                        .length > 0 && (
                                        <option
                                            value={ViewFilter.NOT_INSTALLED.toString()}
                                        >
                                            Not installed (
                                            {
                                                extensionsManagerStore
                                                    .notInstalled.length
                                            }
                                            )
                                        </option>
                                    )}
                                    {extensionsManagerStore.newVersions.length >
                                        0 && (
                                        <option
                                            value={ViewFilter.NEW_VERSIONS.toString()}
                                        >
                                            New versions (
                                            {
                                                extensionsManagerStore
                                                    .newVersions.length
                                            }
                                            )
                                        </option>
                                    )}
                                </select>
                            </label>
                        </div>

                        <Toolbar>
                            {extensionsManagerStore.viewFilter ===
                                ViewFilter.NEW_VERSIONS &&
                                extensionsManagerStore.extensionNodes.length >
                                    0 &&
                                !this.isUpdatingAll && (
                                    <ButtonAction
                                        text="Update All"
                                        title=""
                                        className="btn-success"
                                        onClick={this.updateAll}
                                    />
                                )}
                            <DropdownIconAction
                                icon="material:menu"
                                title="Actions"
                            >
                                <DropdownItem
                                    text="Update Catalog"
                                    onClick={this.updateCatalog}
                                />
                                <DropdownItem
                                    text="Install Extension"
                                    title="Install extension from local file"
                                    onClick={this.installExtension}
                                />
                            </DropdownIconAction>
                        </Toolbar>
                    </ToolbarHeader>
                    <Body tabIndex={0}>
                        <List
                            nodes={extensionsManagerStore.extensionNodes}
                            renderNode={node => (
                                <ExtensionInMasterView extension={node.data} />
                            )}
                            selectNode={action(
                                (node: IListNode) =>
                                    (extensionsManagerStore.selectedExtension =
                                        node.data)
                            )}
                        />
                    </Body>
                </VerticalHeaderWithBody>
            );
        }
    }
);

////////////////////////////////////////////////////////////////////////////////

type SectionType = "properties" | "shortcuts";

interface ExtensionSectionsProps {
    extension: IExtension;
}

export const ExtensionSections = observer(
    class ExtensionSections extends React.Component<
        ExtensionSectionsProps,
        {}
    > {
        activeSection: SectionType = "properties";

        constructor(props: ExtensionSectionsProps) {
            super(props);

            makeObservable(this, {
                activeSection: observable,
                activateSection: action
            });
        }
        activateSection(section: SectionType, event: any) {
            event.preventDefault();
            this.activeSection = section;
        }

        render() {
            let availableSections: SectionType[] = [];

            const propertiesComponent = this.props.extension
                .renderPropertiesComponent
                ? this.props.extension.renderPropertiesComponent()
                : null;

            if (propertiesComponent) {
                availableSections.push("properties");
            }

            if (
                this.props.extension.properties &&
                this.props.extension.properties.shortcuts
            ) {
                availableSections.push("shortcuts");
            }

            if (availableSections.length === 0) {
                return null;
            }

            let activeSection = this.activeSection;

            if (availableSections.indexOf(activeSection) === -1) {
                activeSection = availableSections[0];
            }

            let navigationItems = availableSections.map(section => {
                let className = classNames("nav-link", {
                    active: section === activeSection
                });

                return (
                    <li key={section} className="nav-item">
                        <a
                            className={className}
                            href="#"
                            onClick={this.activateSection.bind(this, section)}
                        >
                            {humanize(section)}
                        </a>
                    </li>
                );
            });

            let body;
            if (activeSection === "properties") {
                body = propertiesComponent;
            } else if (activeSection === "shortcuts") {
                body = <ExtensionShortcuts extension={this.props.extension} />;
            }

            return (
                <div>
                    <div style={{ marginTop: "10px" }}>
                        <ul className="nav nav-tabs">{navigationItems}</ul>
                    </div>

                    <div
                        style={{
                            padding: "10px"
                        }}
                    >
                        {body}
                    </div>
                </div>
            );
        }
    }
);

////////////////////////////////////////////////////////////////////////////////

async function finishInstall(extensionZipPackageData: any) {
    const tempFilePath = await getTempFilePath();

    await writeBinaryData(tempFilePath, extensionZipPackageData);

    const extension = await installExtension(tempFilePath, {
        notFound() {},
        async confirmReplaceNewerVersion(
            newExtension: IExtension,
            existingExtension: IExtension
        ) {
            return true;
        },
        async confirmReplaceOlderVersion(
            newExtension: IExtension,
            existingExtension: IExtension
        ) {
            return true;
        },
        async confirmReplaceTheSameVersion(
            newExtension: IExtension,
            existingExtension: IExtension
        ) {
            return true;
        }
    });

    return extension;
}

export function downloadAndInstallExtension(
    extensionToInstall: IExtension,
    progressId: notification.ProgressId,
    progress: {
        update(
            progressId: string | number,
            options: {
                render: React.ReactNode;
                type: notification.Type;
                autoClose?: number | false;
            }
        ): void;
    } = notification
) {
    return new Promise<IExtension | undefined>((resolve, reject) => {
        var req = new XMLHttpRequest();
        req.responseType = "arraybuffer";
        req.open("GET", extensionToInstall.download!);

        progress.update(progressId, {
            render: `Downloading "${
                extensionToInstall.displayName || extensionToInstall.name
            }" extension package ...`,
            type: notification.INFO
        });

        req.addEventListener("progress", event => {
            progress.update(progressId, {
                render: `Downloading "${
                    extensionToInstall.displayName || extensionToInstall.name
                }" extension package: ${event.loaded} of ${event.total}.`,
                type: notification.INFO
            });
        });

        req.addEventListener("load", () => {
            const extensionZipFileData = Buffer.from(req.response);

            if (extensionToInstall.sha256) {
                if (
                    sha256(extensionZipFileData) !== extensionToInstall.sha256
                ) {
                    progress.update(progressId, {
                        render: `Failed to install "${
                            extensionToInstall.displayName ||
                            extensionToInstall.name
                        }" extension because package file hash doesn't match.`,
                        type: notification.ERROR,
                        autoClose: 5000
                    });
                    reject();
                    return;
                }
            }

            finishInstall(extensionZipFileData)
                .then(extension => {
                    if (extension) {
                        progress.update(progressId, {
                            render: `Extension "${
                                extension.displayName || extension.name
                            }" installed.`,
                            type: notification.SUCCESS,
                            autoClose: 5000
                        });
                    } else {
                        progress.update(progressId, {
                            render: `Failed to install "${
                                extensionToInstall.displayName ||
                                extensionToInstall.name
                            }" extension.`,
                            type: notification.ERROR,
                            autoClose: 5000
                        });
                    }
                    resolve(extension);
                })
                .catch(error => {
                    console.error("Extension download error", error);
                    progress.update(progressId, {
                        render: `Failed to install "${
                            extensionToInstall.displayName ||
                            extensionToInstall.name
                        }" extension.`,
                        type: notification.ERROR,
                        autoClose: 5000
                    });
                    reject();
                });
        });

        req.addEventListener("error", error => {
            console.error("Extension download error", error);
            progress.update(progressId, {
                render: `Failed to download "${
                    extensionToInstall.displayName || extensionToInstall.name
                }" extension package.`,
                type: notification.ERROR,
                autoClose: 5000
            });
            reject();
        });

        req.send();
    });
}

////////////////////////////////////////////////////////////////////////////////

export const DetailsView = observer(
    class DetailsView extends React.Component {
        selectedVersion: string;
        autorunDispose: IReactionDisposer;

        constructor(props: any) {
            super(props);

            makeObservable(this, {
                selectedVersion: observable,
                displayedExtension: computed,
                extensionVersions: computed,
                installEnabled: computed,
                updateEnabled: computed,
                replaceEnabled: computed,
                uninstallEnabled: computed
            });
        }

        componentDidMount() {
            this.autorunDispose = autorun(() => {
                const selectedExtensionVersions =
                    extensionsManagerStore.selectedExtensionVersions;
                if (selectedExtensionVersions) {
                    runInAction(
                        () =>
                            (this.selectedVersion =
                                selectedExtensionVersions.versionInFocus.version)
                    );
                }
            });
        }

        componentWillUnmount() {
            this.autorunDispose();
        }

        get displayedExtension() {
            return extensionsManagerStore.getSelectedExtensionByVersion(
                this.selectedVersion
            );
        }

        get extensionVersions() {
            return extensionsManagerStore.selectedExtensionVersions;
        }

        get installEnabled() {
            return !(
                this.extensionVersions &&
                this.extensionVersions.installedVersion
            );
        }

        get updateEnabled() {
            return (
                this.extensionVersions &&
                this.extensionVersions.installedVersion &&
                this.displayedExtension ===
                    this.extensionVersions.installedVersion &&
                compareVersions(
                    this.extensionVersions.latestVersion.version,
                    this.extensionVersions.installedVersion.version
                ) > 0
            );
        }

        get replaceEnabled() {
            return (
                this.extensionVersions &&
                this.extensionVersions.installedVersion &&
                this.displayedExtension !==
                    this.extensionVersions.installedVersion
            );
        }

        get uninstallEnabled() {
            return (
                this.extensionVersions &&
                this.extensionVersions.installedVersion
            );
        }

        handleInstall = async () => {
            if (!this.extensionVersions) {
                return;
            }

            let extensionToInstall = this.displayedExtension;
            if (!extensionToInstall) {
                return;
            }

            if (
                extensionToInstall === this.extensionVersions.installedVersion
            ) {
                // if already installed then install latest version
                extensionToInstall = this.extensionVersions.latestVersion;
                if (!extensionToInstall) {
                    return;
                }
            }

            const progressToastId = notification.info("Updating...", {
                autoClose: false
            });
            await new Promise(resolve => setTimeout(resolve, 500));

            const extension = await downloadAndInstallExtension(
                extensionToInstall,
                progressToastId
            );

            if (extension) {
                extensionsManagerStore.selectExtensionById(extension.id);
            }
        };

        handleUninstall = () => {
            if (!this.extensionVersions) {
                return;
            }

            const extension = this.extensionVersions.installedVersion;
            if (!extension) {
                return;
            }

            confirm("Are you sure?", undefined, async () => {
                await uninstallExtension(extension.id);
                notification.success(
                    `Extension "${
                        extension.displayName || extension.name
                    }" uninstalled`
                );
                extensionsManagerStore.selectExtensionById(extension.id);
            });
        };

        handleExport = async () => {
            if (!this.extensionVersions) {
                return;
            }

            const extension = this.extensionVersions.installedVersion;
            if (!extension) {
                return;
            }

            const result = await dialog.showSaveDialog(getCurrentWindow(), {
                filters: [
                    { name: "Extension files", extensions: ["zip"] },
                    { name: "All Files", extensions: ["*"] }
                ],
                defaultPath: getValidFileNameFromFileName(
                    extension.name + ".zip"
                )
            });

            let filePath = result.filePath;
            if (filePath) {
                if (!filePath.toLowerCase().endsWith(".zip")) {
                    filePath += ".zip";
                }

                try {
                    const tempFilePath = await getTempFilePath();
                    await exportExtension(extension, tempFilePath);
                    await copyFile(tempFilePath, filePath);
                    notification.success(`Saved to "${filePath}"`);
                } catch (err) {
                    notification.error(err.toString());
                }
            }
        };

        handleChangeImage = async () => {
            if (!this.extensionVersions) {
                return;
            }

            const extension = this.extensionVersions.installedVersion;
            if (!extension) {
                return;
            }

            const result = await dialog.showOpenDialog(getCurrentWindow(), {
                properties: ["openFile"],
                filters: [
                    {
                        name: "Image files",
                        extensions: ["png", "jpg", "jpeg"]
                    },
                    { name: "All Files", extensions: ["*"] }
                ]
            });
            const filePaths = result.filePaths;
            if (filePaths && filePaths[0]) {
                changeExtensionImage(extension, filePaths[0]);
            }
        };

        static getFullDescription(extension: IExtension): React.ReactNode {
            let fullDescription;
            if (extension.moreDescription) {
                if (extension.description) {
                    fullDescription = extension.description.trim();
                    if (fullDescription) {
                        if (!fullDescription.endsWith(".")) {
                            fullDescription += ".";
                        }
                    }
                }

                if (extension.moreDescription) {
                    if (fullDescription) {
                        fullDescription += "\n";
                    }
                    fullDescription += extension.moreDescription.trim();
                    if (fullDescription) {
                        if (!fullDescription.endsWith(".")) {
                            fullDescription += ".";
                        }
                    }
                }
            } else {
                fullDescription = extension.description;
            }
            if (fullDescription) {
                fullDescription = <pre>{fullDescription}</pre>;
            }
            return fullDescription;
        }

        render() {
            const extension = this.displayedExtension;
            if (!extension) {
                return null;
            }

            return (
                <VerticalHeaderWithBody>
                    <Header className="EezStudio_ExtensionDetailsHeader">
                        <div className="EezStudio_ExtensionDetailsHeaderImageContainer">
                            <img src={extension.image} width={256} />
                            {extension.type == "instrument" && (
                                <a
                                    href="#"
                                    style={{ cursor: "pointer" }}
                                    onClick={this.handleChangeImage}
                                >
                                    Change image
                                </a>
                            )}
                        </div>
                        <div className="EezStudio_ExtensionDetailsHeaderProperties">
                            <div className="EezStudio_ExtensionDetailsHeaderPropertiesNameAndVersion">
                                <h5>
                                    {extension.displayName || extension.name}
                                </h5>
                                <div className="form-inline">
                                    <label
                                        className="my-1 me-2"
                                        htmlFor="EezStudio_Extension_Details_VersionSelect"
                                    >
                                        Versions:
                                    </label>
                                    <select
                                        id="EezStudio_Extension_Details_VersionSelect"
                                        className="custom-select my-1 me-sm-2"
                                        value={this.selectedVersion}
                                        onChange={action(
                                            (
                                                event: React.ChangeEvent<HTMLSelectElement>
                                            ) => {
                                                this.selectedVersion =
                                                    event.currentTarget.value;
                                            }
                                        )}
                                    >
                                        {this.extensionVersions!.allVersions.map(
                                            extension => (
                                                <option
                                                    key={extension.version}
                                                    value={extension.version}
                                                >
                                                    {extension.version}
                                                </option>
                                            )
                                        )}
                                    </select>
                                </div>
                            </div>
                            <div>
                                {DetailsView.getFullDescription(extension)}
                            </div>
                            <div>{extension.author}</div>
                            <div style={{ marginBottom: "10px" }}>
                                <small>{extension.id}</small>
                            </div>
                            <Toolbar>
                                {this.installEnabled && (
                                    <ButtonAction
                                        text="Install"
                                        title="Install extension"
                                        className="btn-success"
                                        onClick={this.handleInstall}
                                    />
                                )}
                                {this.updateEnabled && (
                                    <ButtonAction
                                        text="Update"
                                        title="Update extension to the latest version"
                                        className="btn-success"
                                        onClick={this.handleInstall}
                                    />
                                )}
                                {this.replaceEnabled && (
                                    <ButtonAction
                                        text="Replace"
                                        title="Replace installed extension with selected version"
                                        className="btn-success"
                                        onClick={this.handleInstall}
                                    />
                                )}
                                {this.uninstallEnabled && (
                                    <ButtonAction
                                        text="Uninstall"
                                        title="Uninstall extension"
                                        className="btn-danger"
                                        onClick={this.handleUninstall}
                                    />
                                )}
                                {extension.isEditable && extension.isDirty && (
                                    <ButtonAction
                                        text="Export"
                                        title="Export extension"
                                        className="btn-secondary"
                                        onClick={this.handleExport}
                                    />
                                )}
                            </Toolbar>
                        </div>
                    </Header>
                    <Body>
                        <ExtensionSections extension={extension} />
                    </Body>
                </VerticalHeaderWithBody>
            );
        }
    }
);

////////////////////////////////////////////////////////////////////////////////

export const ExtensionsManager = observer(
    class ExtensionsManager extends React.Component {
        render() {
            return (
                <Splitter
                    type="horizontal"
                    sizes="240px|100%"
                    persistId="home/extensions-manager/splitter"
                >
                    <MasterView />
                    <DetailsView />
                </Splitter>
            );
        }
    }
);
