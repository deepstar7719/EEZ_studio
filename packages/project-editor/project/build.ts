import { createTransformer } from "mobx-utils";

import { formatNumber } from "eez-studio-shared/util";
import {
    writeTextFile,
    writeBinaryData
} from "eez-studio-shared/util-electron";
import { _map } from "eez-studio-shared/algorithm";
import { underscore } from "eez-studio-shared/string";

import type { BuildResult } from "project-editor/core/extensions";
import {
    IEezObject,
    getProperty,
    IMessage,
    getPropertyInfo,
    MessageType
} from "project-editor/core/object";
import {
    DocumentStoreClass,
    isArray,
    getArrayAndObjectProperties,
    getClassInfo,
    Section,
    getJSON
} from "project-editor/core/store";

import type { BuildConfiguration } from "project-editor/project/project";
import {
    extensionDefinitionAnythingToBuild,
    extensionDefinitionBuild
} from "project-editor/features/extension-definitions/build";
import { ProjectEditor } from "project-editor/project-editor-interface";

////////////////////////////////////////////////////////////////////////////////

export const TAB = "    ";

////////////////////////////////////////////////////////////////////////////////

export enum NamingConvention {
    UnderscoreUpperCase,
    UnderscoreLowerCase
}

export function getName<
    T extends {
        name: string;
    }
>(
    prefix: string,
    objectOrName: T | string,
    namingConvention: NamingConvention
) {
    let name;
    if (typeof objectOrName == "string") {
        name = objectOrName;
    } else {
        const project = ProjectEditor.getProject(objectOrName);
        name = project.namespace
            ? project.namespace + "_" + objectOrName.name
            : objectOrName.name;
    }
    name = name.replace(/[^a-zA-Z_0-9]/g, " ");

    if (namingConvention == NamingConvention.UnderscoreUpperCase) {
        name = underscore(name).toUpperCase();
    } else if (namingConvention == NamingConvention.UnderscoreLowerCase) {
        name = underscore(name).toLowerCase();
    }

    name = prefix + name;

    return name;
}

////////////////////////////////////////////////////////////////////////////////

export function dumpData(data: number[] | Buffer) {
    const NUMBERS_PER_LINE = 16;
    let result = "";
    _map(data, value => "0x" + formatNumber(value, 16, 2)).forEach(
        (value, index) => {
            if (result.length > 0) {
                result += ",";
            }
            if (index % NUMBERS_PER_LINE == 0) {
                result += "\n" + TAB;
            } else {
                result += " ";
            }
            result += value;
        }
    );
    result += "\n";
    return result;
}

////////////////////////////////////////////////////////////////////////////////

function showCheckResult(DocumentStore: DocumentStoreClass) {
    const OutputSections = DocumentStore.outputSectionsStore;

    let outputSection = OutputSections.getSection(Section.OUTPUT);

    let checkResultMassage: string;

    if (outputSection.numErrors == 0) {
        checkResultMassage = "No error";
    } else if (outputSection.numErrors == 1) {
        checkResultMassage = "1 error";
    } else {
        checkResultMassage = `${outputSection.numErrors} errors`;
    }

    checkResultMassage += " and ";

    if (outputSection.numWarnings == 0) {
        checkResultMassage += " no warning";
    } else if (outputSection.numWarnings == 1) {
        checkResultMassage += " 1 warning";
    } else {
        checkResultMassage += ` ${outputSection.numWarnings} warnings`;
    }

    checkResultMassage += " detected";

    OutputSections.write(Section.OUTPUT, MessageType.INFO, checkResultMassage);
}

class BuildException {
    constructor(
        public message: string,
        public object?: IEezObject | undefined
    ) {}
}

async function getBuildResults(
    DocumentStore: DocumentStoreClass,
    sectionNames: string[] | undefined,
    buildConfiguration: BuildConfiguration | undefined
) {
    const project = DocumentStore.project;

    let buildResults: BuildResult[] = [];

    let projectExtensions = ProjectEditor.extensions;
    for (let projectExtension of projectExtensions) {
        const projectFeature =
            projectExtension.eezStudioExtension.implementation.projectFeature;
        if (projectFeature.build && getProperty(project, projectFeature.key)) {
            buildResults.push(
                await projectFeature.build(
                    project,
                    sectionNames,
                    buildConfiguration
                )
            );
        }
    }

    return buildResults;
}

const sectionNamesRegexp = /\/\/\$\{eez-studio (\w*)\s*(\w*)\}/g;

function getSectionNames(DocumentStore: DocumentStoreClass): string[] {
    if (DocumentStore.masterProject) {
        return ["GUI_ASSETS_DATA", "GUI_ASSETS_DATA_MAP"];
    }

    const project = DocumentStore.project;

    const sectionNames: string[] = [];

    project.settings.build.files.forEach(buildFile => {
        let result;
        while (
            (result = sectionNamesRegexp.exec(buildFile.template)) !== null
        ) {
            sectionNames.push(result[1]);
        }
    });

    return sectionNames;
}

async function generateFile(
    DocumentStore: DocumentStoreClass,
    configurationBuildResults: {
        [configurationName: string]: BuildResult[];
    },
    defaultConfigurationName: string,
    template: string | undefined,
    filePath: string
): Promise<any> {
    let parts: any;

    if (template) {
        let buildFileContent = template.replace(
            sectionNamesRegexp,
            (_1, part, configurationName) => {
                const buildResults =
                    configurationBuildResults[
                        configurationName || defaultConfigurationName
                    ];

                parts = {};
                for (const buildResult of buildResults) {
                    parts = Object.assign(parts, buildResult);
                }

                return parts[part];
            }
        );

        await writeTextFile(filePath, buildFileContent);
    } else {
        const buildResults =
            configurationBuildResults[defaultConfigurationName];

        parts = {};
        for (const buildResult of buildResults) {
            parts = Object.assign(parts, buildResult);
        }

        await writeBinaryData(filePath, parts["GUI_ASSETS_DATA"]);
        if (parts["GUI_ASSETS_DATA_MAP"]) {
            await writeBinaryData(
                filePath + ".map",
                parts["GUI_ASSETS_DATA_MAP"]
            );

            DocumentStore.outputSectionsStore.write(
                Section.OUTPUT,
                MessageType.INFO,
                `File "${filePath}.map" builded`
            );
        }
    }

    DocumentStore.outputSectionsStore.write(
        Section.OUTPUT,
        MessageType.INFO,
        `File "${filePath}" builded`
    );

    return parts;
}

async function generateFiles(
    DocumentStore: DocumentStoreClass,
    destinationFolderPath: string,
    configurationBuildResults: {
        [configurationName: string]: BuildResult[];
    }
) {
    const path = EEZStudio.remote.require("path");

    let parts: any = undefined;

    const project = DocumentStore.project;

    if (DocumentStore.masterProject) {
        parts = generateFile(
            DocumentStore,
            configurationBuildResults,
            DocumentStore.selectedBuildConfiguration
                ? DocumentStore.selectedBuildConfiguration.name
                : "default",
            undefined,
            destinationFolderPath +
                "/" +
                path.basename(DocumentStore.filePath, ".eez-project") +
                (project.isAppletProject ? ".app" : ".res")
        );

        if (project.isResourceProject && project.micropython) {
            await writeTextFile(
                destinationFolderPath +
                    "/" +
                    path.basename(DocumentStore.filePath, ".eez-project") +
                    ".py",
                project.micropython.code
            );
        }
    } else {
        const build = project.settings.build;

        for (const buildFile of build.files) {
            if (buildFile.fileName.indexOf("<configuration>") !== -1) {
                for (const configuration of build.configurations) {
                    try {
                        parts = await generateFile(
                            DocumentStore,
                            configurationBuildResults,
                            configuration.name,
                            buildFile.template,
                            destinationFolderPath +
                                "/" +
                                buildFile.fileName.replace(
                                    "<configuration>",
                                    configuration.name
                                )
                        );
                    } catch (err) {
                        await new Promise(resolve => setTimeout(resolve, 10));

                        parts = await generateFile(
                            DocumentStore,
                            configurationBuildResults,
                            configuration.name,
                            buildFile.template,
                            destinationFolderPath +
                                "/" +
                                buildFile.fileName.replace(
                                    "<configuration>",
                                    configuration.name
                                )
                        );
                    }
                }
            } else {
                parts = generateFile(
                    DocumentStore,
                    configurationBuildResults,
                    DocumentStore.selectedBuildConfiguration
                        ? DocumentStore.selectedBuildConfiguration.name
                        : "default",
                    buildFile.template,
                    destinationFolderPath + "/" + buildFile.fileName
                );
            }
        }
    }

    return parts;
}

function anythingToBuild(DocumentStore: DocumentStoreClass) {
    const project = DocumentStore.project;
    return (
        project.settings.build.files.length > 0 ||
        DocumentStore.masterProject ||
        project.isDashboardProject
    );
}

export async function build(
    DocumentStore: DocumentStoreClass,
    { onlyCheck }: { onlyCheck: boolean }
) {
    const timeStart = new Date().getTime();

    const OutputSections = DocumentStore.outputSectionsStore;

    OutputSections.clear(Section.OUTPUT);

    if (!anythingToBuild(DocumentStore)) {
        OutputSections.write(
            Section.OUTPUT,
            MessageType.INFO,
            `Nothing to build!`
        );
        return undefined;
    }

    OutputSections.setLoading(Section.OUTPUT, true);

    // give some time for loader to start
    await new Promise(resolve => setTimeout(resolve, 50));

    let parts: any = undefined;

    const project = DocumentStore.project;

    try {
        let sectionNames: string[] | undefined = undefined;

        let destinationFolderPath;
        if (!onlyCheck) {
            destinationFolderPath = DocumentStore.getAbsoluteFilePath(
                project.settings.build.destinationFolder || "."
            );

            const fs = EEZStudio.remote.require("fs");
            if (!fs.existsSync(destinationFolderPath)) {
                throw new BuildException("Cannot find destination folder.");
            }

            if (!project.isDashboardProject) {
                sectionNames = getSectionNames(DocumentStore);
            }
        }

        let configurationBuildResuts: {
            [configurationName: string]: BuildResult[];
        } = {};

        if (!project.isDashboardProject) {
            if (
                project.settings.general.projectVersion !== "v1" &&
                project.settings.build.configurations.length > 0 &&
                !DocumentStore.masterProject
            ) {
                for (const configuration of project.settings.build
                    .configurations) {
                    OutputSections.write(
                        Section.OUTPUT,
                        MessageType.INFO,
                        `Building ${configuration.name} configuration`
                    );
                    configurationBuildResuts[configuration.name] =
                        await getBuildResults(
                            DocumentStore,
                            sectionNames,
                            configuration
                        );
                }
            } else {
                const selectedBuildConfiguration =
                    DocumentStore.selectedBuildConfiguration ||
                    project.settings.build.configurations[0];
                if (selectedBuildConfiguration) {
                    OutputSections.write(
                        Section.OUTPUT,
                        MessageType.INFO,
                        `Building ${selectedBuildConfiguration.name} configuration`
                    );
                    configurationBuildResuts[selectedBuildConfiguration.name] =
                        await getBuildResults(
                            DocumentStore,
                            sectionNames,
                            selectedBuildConfiguration
                        );
                } else {
                    configurationBuildResuts["default"] = await getBuildResults(
                        DocumentStore,
                        sectionNames,
                        undefined
                    );
                }
            }
        }

        showCheckResult(DocumentStore);

        if (onlyCheck) {
            return undefined;
        }

        if (!project.isDashboardProject) {
            parts = await generateFiles(
                DocumentStore,
                destinationFolderPath,
                configurationBuildResuts
            );
        } else {
            const path = EEZStudio.remote.require("path");

            const baseName = path.basename(
                DocumentStore.filePath,
                ".eez-project"
            );

            const destinationFilePahth =
                destinationFolderPath + "/" + baseName + ".eez-dashboard";

            await new Promise<void>((resolve, reject) => {
                const fs = EEZStudio.remote.require("fs");
                const archiver = require("archiver");

                var archive = archiver("zip", {
                    zlib: {
                        level: 9
                    }
                });

                var output = fs.createWriteStream(destinationFilePahth);

                output.on("close", function () {
                    resolve();
                });

                archive.on("warning", function (err: any) {
                    reject(err);
                });

                archive.on("error", function (err: any) {
                    reject(err);
                });

                archive.pipe(output);

                const json = getJSON(DocumentStore, 0);
                archive.append(json, { name: baseName + ".eez-project" });

                archive.finalize();
            });
        }

        OutputSections.write(
            Section.OUTPUT,
            MessageType.INFO,
            `Build duration: ${
                (new Date().getTime() - timeStart) / 1000
            } seconds`
        );

        OutputSections.write(
            Section.OUTPUT,
            MessageType.INFO,
            `Build successfully finished at ${new Date().toLocaleString()}`
        );
    } catch (err) {
        if (err instanceof BuildException) {
            OutputSections.write(
                Section.OUTPUT,
                MessageType.ERROR,
                err.message,
                err.object
            );
        } else {
            OutputSections.write(
                Section.OUTPUT,
                MessageType.ERROR,
                `Module build error: ${err}`
            );
        }

        showCheckResult(DocumentStore);
    } finally {
        OutputSections.setLoading(Section.OUTPUT, false);
    }

    return parts;
}

export async function buildExtensions(DocumentStore: DocumentStoreClass) {
    const timeStart = new Date().getTime();

    const OutputSections = DocumentStore.outputSectionsStore;

    OutputSections.clear(Section.OUTPUT);

    if (!extensionDefinitionAnythingToBuild(DocumentStore)) {
        OutputSections.write(
            Section.OUTPUT,
            MessageType.INFO,
            `Nothing to build!`
        );
        return;
    }

    OutputSections.setLoading(Section.OUTPUT, true);

    // give some time for loader to start
    await new Promise(resolve => setTimeout(resolve, 50));

    const project = DocumentStore.project;

    try {
        let destinationFolderPath = DocumentStore.getAbsoluteFilePath(
            project.settings.build.destinationFolder || "."
        );
        const fs = EEZStudio.remote.require("fs");
        if (!fs.existsSync(destinationFolderPath)) {
            throw new BuildException("Cannot find destination folder.");
        }

        showCheckResult(DocumentStore);

        await extensionDefinitionBuild(DocumentStore);

        OutputSections.write(
            Section.OUTPUT,
            MessageType.INFO,
            `Build duration: ${
                (new Date().getTime() - timeStart) / 1000
            } seconds`
        );

        OutputSections.write(
            Section.OUTPUT,
            MessageType.INFO,
            `Build successfully finished at ${new Date().toLocaleString()}`
        );
    } catch (err) {
        if (err instanceof BuildException) {
            OutputSections.write(
                Section.OUTPUT,
                MessageType.ERROR,
                err.message,
                err.object
            );
        } else {
            OutputSections.write(
                Section.OUTPUT,
                MessageType.ERROR,
                `Module build error: ${err}`
            );
        }

        showCheckResult(DocumentStore);
    } finally {
        OutputSections.setLoading(Section.OUTPUT, false);
    }
}

////////////////////////////////////////////////////////////////////////////////

var checkTransformer: (object: IEezObject) => IMessage[] = createTransformer(
    (object: IEezObject): IMessage[] => {
        let messages: IMessage[] = [];

        // call check method of the object
        if (!isArray(object)) {
            const classCheckMethod = getClassInfo(object).check;
            if (classCheckMethod) {
                messages = messages.concat(classCheckMethod(object));
            }
        }

        // call check from property definition
        const propertyCheckMethod =
            getPropertyInfo(object) && getPropertyInfo(object).check;
        if (propertyCheckMethod) {
            messages = messages.concat(propertyCheckMethod(object));
        }

        if (isArray(object)) {
            // check array elements
            for (const childObject of object) {
                messages = messages.concat(checkTransformer(childObject));
            }
        } else {
            // check all child array and object properties
            for (const propertyInfo of getArrayAndObjectProperties(object)) {
                const childObject = (object as any)[propertyInfo.name];
                if (childObject) {
                    messages = messages.concat(checkTransformer(childObject));
                }
            }
        }

        return messages;
    }
);

let setMessagesTimeoutId: any;

export function backgroundCheck(DocumentStore: DocumentStoreClass) {
    //console.time("backgroundCheck");

    const messages = checkTransformer(DocumentStore.project);

    if (setMessagesTimeoutId) {
        clearTimeout(setMessagesTimeoutId);
    }

    setMessagesTimeoutId = setTimeout(() => {
        DocumentStore.outputSectionsStore.setMessages(Section.CHECKS, messages);
    }, 100);

    //console.timeEnd("backgroundCheck");
}
