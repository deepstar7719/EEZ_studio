import React from "react";

import type { IDashboardComponentContext } from "eez-studio-types";

import { registerActionComponents } from "project-editor/flow/component";
import { toJS } from "mobx";

////////////////////////////////////////////////////////////////////////////////

const jsonParseIcon: any = (
    <svg viewBox="0 0 58 58">
        <path d="m50.949 12.187-1.361-1.361-9.504-9.505-.002-.001-.77-.771A1.867 1.867 0 0 0 37.985 0H8.963C7.776 0 6.5.916 6.5 2.926V56c0 .837.841 1.652 1.836 1.909.051.014.1.033.152.043.156.031.315.048.475.048h40.074c.16 0 .319-.017.475-.048.052-.01.101-.029.152-.043.995-.257 1.836-1.072 1.836-1.909V13.978c0-.767-.093-1.334-.551-1.791zM39.5 3.565 47.935 12H39.5V3.565zM8.963 56c-.071 0-.135-.025-.198-.049a.46.46 0 0 1-.265-.414V41h41v14.537a.46.46 0 0 1-.265.414c-.063.024-.127.049-.198.049H8.963zM8.5 39V2.926c0-.217.033-.926.463-.926h28.595a1.54 1.54 0 0 0-.058.391V13.78a2.976 2.976 0 0 0-2-.78 1 1 0 1 0 0 2c.552 0 1 .449 1 1v4c0 1.2.542 2.266 1.382 3a3.975 3.975 0 0 0-1.382 3v4c0 .551-.448 1-1 1a1 1 0 1 0 0 2c1.654 0 3-1.346 3-3v-4c0-1.103.897-2 2-2a1 1 0 1 0 0-2c-1.103 0-2-.897-2-2v-4a2.98 2.98 0 0 0-.78-2h11.389c.135 0 .265-.025.391-.058l.001.036V39H8.5z" />
        <path d="M16.354 51.43c-.019.446-.171.764-.458.95s-.672.28-1.155.28c-.191 0-.396-.022-.615-.068s-.429-.098-.629-.157-.385-.123-.554-.191-.299-.135-.39-.198l-.697 1.107c.183.137.405.26.67.369s.54.207.827.294.565.15.834.191.504.062.704.062c.401 0 .791-.039 1.169-.116.378-.077.713-.214 1.005-.41s.524-.456.697-.779.26-.723.26-1.196V43.72h-1.668v7.71zM25.083 49.064c-.314-.228-.654-.422-1.019-.581s-.702-.323-1.012-.492-.569-.364-.779-.588-.314-.518-.314-.882c0-.146.036-.299.109-.458s.173-.303.301-.431.273-.234.438-.321.337-.139.52-.157c.328-.027.597-.032.807-.014s.378.05.506.096.226.091.294.137.13.082.185.109c.009-.009.036-.055.082-.137s.101-.185.164-.308l.205-.396a8.49 8.49 0 0 0 .191-.39c-.265-.173-.61-.299-1.039-.376s-.853-.116-1.271-.116c-.41 0-.8.063-1.169.191s-.692.313-.971.554-.499.535-.663.882-.248.744-.248 1.19c0 .492.104.902.314 1.23s.474.613.793.854.661.451 1.025.629.704.355 1.019.533.576.376.786.595.314.483.314.793c0 .511-.148.896-.444 1.155s-.723.39-1.278.39c-.183 0-.378-.019-.588-.055s-.419-.084-.629-.144-.412-.123-.608-.191-.357-.139-.485-.212l-.287 1.176c.155.137.34.253.554.349s.439.171.677.226c.237.055.472.094.704.116s.458.034.677.034c.511 0 .966-.077 1.367-.232s.738-.362 1.012-.622.485-.561.636-.902.226-.695.226-1.06c0-.538-.104-.978-.314-1.319s-.474-.627-.788-.855zM34.872 45.072c-.378-.429-.82-.754-1.326-.978s-1.06-.335-1.661-.335-1.155.111-1.661.335-.948.549-1.326.978-.675.964-.889 1.606-.321 1.388-.321 2.235.107 1.595.321 2.242.511 1.185.889 1.613.82.752 1.326.971 1.06.328 1.661.328 1.155-.109 1.661-.328.948-.542 1.326-.971.675-.966.889-1.613.321-1.395.321-2.242-.107-1.593-.321-2.235-.511-1.177-.889-1.606zm-.677 5.626c-.137.487-.326.882-.567 1.183s-.515.518-.82.649-.627.198-.964.198c-.328 0-.641-.07-.937-.212s-.561-.364-.793-.67-.415-.699-.547-1.183-.203-1.066-.212-1.75c.009-.702.082-1.294.219-1.777.137-.483.326-.877.567-1.183s.515-.521.82-.649.627-.191.964-.191c.328 0 .641.068.937.205s.561.36.793.67.415.704.547 1.183.203 1.06.212 1.743c-.009.702-.082 1.297-.219 1.784zM44.012 50.869l-3.951-6.945h-1.668V54h1.668v-6.945L44.012 54h1.668V43.924h-1.668zM20.5 20v-4c0-.551.448-1 1-1a1 1 0 1 0 0-2c-1.654 0-3 1.346-3 3v4c0 1.103-.897 2-2 2a1 1 0 1 0 0 2c1.103 0 2 .897 2 2v4c0 1.654 1.346 3 3 3a1 1 0 1 0 0-2c-.552 0-1-.449-1-1v-4c0-1.2-.542-2.266-1.382-3a3.975 3.975 0 0 0 1.382-3z" />
        <circle cx="28.5" cy="19.5" r="1.5" />
        <path d="M28.5 25a1 1 0 0 0-1 1v3a1 1 0 1 0 2 0v-3a1 1 0 0 0-1-1z" />
    </svg>
);

const componentHeaderColor = "#FFDFD3";

registerActionComponents("Dashboard Specific", [
    {
        name: "JSONParse",
        componentPaletteLabel: "JSONParse",
        icon: jsonParseIcon,
        componentHeaderColor,
        inputs: [],
        outputs: [],
        defaults: {
            customInputs: [
                {
                    name: "text",
                    type: "string"
                }
            ],
            customOutputs: [
                {
                    name: "result",
                    type: "any"
                }
            ],
            value: "text"
        },
        properties: [
            {
                name: "value",
                type: "expression",
                valueType: "string"
            }
        ],
        execute: (context: IDashboardComponentContext) => {
            const value = context.evalProperty<string>("value");
            if (value == undefined || typeof value != "string") {
                context.throwError(`Invalid value property`);
                return;
            }

            try {
                const result = JSON.parse(value);
                context.propagateValue("result", result);
                context.propagateValueThroughSeqout();
            } catch (err) {
                context.throwError(err.toString());
            }
        }
    },
    {
        name: "JSONStringify",
        componentPaletteLabel: "JSONStringify",
        icon: jsonParseIcon,
        componentHeaderColor,
        inputs: [],
        outputs: [
            {
                name: "result",
                type: "string",
                isSequenceOutput: false,
                isOptionalOutput: false
            }
        ],
        defaults: {
            indentation: "2"
        },
        properties: [
            {
                name: "value",
                type: "expression",
                valueType: "any"
            },
            {
                name: "indentation",
                type: "expression",
                valueType: "integer"
            }
        ],
        bodyPropertyName: "value",
        execute: (context: IDashboardComponentContext) => {
            const value = context.evalProperty("value");
            if (value == undefined) {
                context.throwError(`Invalid value property`);
                return;
            }

            const indentation = context.evalProperty("indentation");

            try {
                const result = JSON.stringify(toJS(value), null, indentation);
                context.propagateValue("result", result);
                context.propagateValueThroughSeqout();
            } catch (err) {
                context.throwError(err.toString());
            }
        }
    }
]);
