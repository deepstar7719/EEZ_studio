import SerialPortModule from "serialport";
import React from "react";
import ReactDOM from "react-dom";
import { observable, action, runInAction, autorun } from "mobx";
import { observer } from "mobx-react";
const os = require("os");

import { objectClone } from "eez-studio-shared/util";

import {
    PropertyList,
    TextInputProperty,
    NumberInputProperty,
    SelectProperty
} from "eez-studio-ui/properties";
import { Dialog, showDialog } from "eez-studio-ui/dialog";

import type { ConnectionParameters } from "instrument/connection/interface";
import type * as UsbTmcModule from "instrument/connection/interfaces/usbtmc";
import { guid } from "eez-studio-shared/guid";

function openLink(url: string) {
    const { shell } = require("electron");
    shell.openExternal(url);
}

interface ConnectionPropertiesProps {
    connectionParameters: ConnectionParameters;
    onConnectionParametersChanged: (
        connectionParameters: ConnectionParameters
    ) => void;
    availableConnections: (
        | "ethernet"
        | "serial"
        | "usbtmc"
        | "visa"
        | "web-simulator"
    )[];
    serialBaudRates: number[];
}

class Devices {
    neverEnumerated = true;

    @observable serialPortPaths: {
        path: string;
        description: string;
        uniqueId: string;
    }[] = [];

    @observable usbDevices: {
        name?: string;
        idVendor: number;
        idProduct: number;
    }[] = [];
}

const devices = new Devices();

@observer
export class ConnectionProperties extends React.Component<
    ConnectionPropertiesProps,
    {}
> {
    constructor(props: any) {
        super(props);

        this.applyConnectionParameters(this.props.connectionParameters);
    }

    div: HTMLDivElement;
    form: HTMLFormElement;

    @observable iface: string;
    @observable ethernetAddress: string;
    @observable ethernetPort: number;

    @observable serialPortPath: string;
    @observable serialPortBaudRate: number;

    @observable selectedUsbDeviceIndex: number | undefined;
    @observable idVendor: number;
    @observable idProduct: number;

    @observable visaResource: string;
    @observable visaResources: string[] | undefined = [];

    disposer: any;

    @action
    componentDidUpdate(prevProps: any) {
        if (this.props != prevProps) {
            this.applyConnectionParameters(this.props.connectionParameters);
        }
    }

    applyConnectionParameters(connectionParameters: ConnectionParameters) {
        this.iface = connectionParameters.type;
        this.ethernetAddress = connectionParameters.ethernetParameters.address;
        this.ethernetPort = connectionParameters.ethernetParameters.port;

        this.serialPortPath = connectionParameters.serialParameters.port;
        this.serialPortBaudRate =
            connectionParameters.serialParameters.baudRate;

        this.idVendor = connectionParameters.usbtmcParameters.idVendor;
        this.idProduct = connectionParameters.usbtmcParameters.idProduct;

        this.visaResource = connectionParameters.visaParameters.resource;
    }

    async componentDidMount() {
        if (os.platform() !== "darwin") {
            if (devices.neverEnumerated) {
                devices.neverEnumerated = false;
                await this.refreshSerialPortPaths();

                // TODO doesn't work on Raspbian
                if (process.arch != "arm") {
                    await this.refreshUsbDevices();
                }
            } else {
                this.initUsbDevices();
            }
        }

        await this.refreshVisaResources();

        $(this.div).modal();

        $(this.div).on("hidden.bs.modal", () => {
            const parent = this.div.parentElement as HTMLElement;
            ReactDOM.unmountComponentAtNode(parent);
            parent.remove();
        });

        this.disposer = autorun(() => {
            let connectionParameters: ConnectionParameters = objectClone(
                this.props.connectionParameters
            );

            if (this.iface === "ethernet") {
                connectionParameters.type = "ethernet";
                connectionParameters.ethernetParameters.address =
                    this.ethernetAddress;
                connectionParameters.ethernetParameters.port =
                    this.ethernetPort;
            } else if (this.iface === "serial") {
                connectionParameters.type = "serial";
                connectionParameters.serialParameters.port =
                    this.serialPortPath;
                connectionParameters.serialParameters.baudRate =
                    this.serialPortBaudRate;
            } else if (this.iface === "usbtmc") {
                connectionParameters.type = "usbtmc";
                connectionParameters.usbtmcParameters.idVendor = this
                    .selectedUsbDeviceIndex
                    ? this.idVendor
                    : 0;
                connectionParameters.usbtmcParameters.idProduct = this
                    .selectedUsbDeviceIndex
                    ? this.idProduct
                    : 0;
            } else if (this.iface === "web-simulator") {
                connectionParameters.type = "web-simulator";
                connectionParameters.webSimulatorParameters.id = guid();
            } else {
                connectionParameters.type = "visa";
                connectionParameters.visaParameters.resource =
                    this.visaResources != undefined ? this.visaResource : "";
            }

            this.props.onConnectionParametersChanged(connectionParameters);
        });
    }

    componentWillUnmount() {
        if (this.disposer) {
            this.disposer();
        }
    }

    @action.bound
    onIfaceChange(value: string) {
        this.iface = value;
    }

    @action.bound
    onEthernetAddressChange(value: string) {
        this.ethernetAddress = value;
    }

    @action.bound
    onEthernetPortChange(value: number) {
        this.ethernetPort = value;
    }

    @action.bound
    onSerialPortPathChange(value: string) {
        this.serialPortPath = value;
    }

    @action.bound
    onSerialPortBaudRateChange(value: string) {
        this.serialPortBaudRate = parseInt(value);
    }

    async refreshSerialPortPaths() {
        const SerialPort = require("serialport") as typeof SerialPortModule;
        try {
            const ports = await SerialPort.list();
            runInAction(() => {
                let found;

                devices.serialPortPaths = [
                    {
                        path: "",
                        description: "",
                        uniqueId: ""
                    }
                ].concat(
                    ports.map(port => {
                        if (this.serialPortPath === port.path) {
                            found = true;
                        }
                        return {
                            path: port.path,
                            description:
                                port.path +
                                (port.manufacturer
                                    ? " - " + port.manufacturer
                                    : "") +
                                (port.productId ? " - " + port.productId : ""),
                            uniqueId: port.pnpId || port.path
                        };
                    })
                );

                if (!found) {
                    this.serialPortPath = "";
                }
            });
        } catch (err) {
            console.error(err);
        }
    }

    onRefreshSerialPortPaths = (event: React.MouseEvent) => {
        event.preventDefault();
        this.refreshSerialPortPaths();
    };

    @action.bound
    onUsbDeviceChange(value: number) {
        this.selectedUsbDeviceIndex = value;

        if (value >= 0 && value < devices.usbDevices.length) {
            this.idVendor = devices.usbDevices[value].idVendor;
            this.idProduct = devices.usbDevices[value].idProduct;
        }
    }

    @action
    initUsbDevices() {
        let selectedUsbDeviceIndex: number | undefined;

        for (let i = 0; i < devices.usbDevices.length; ++i) {
            if (
                devices.usbDevices[i].idVendor === this.idVendor ||
                devices.usbDevices[i].idProduct === this.idProduct
            ) {
                selectedUsbDeviceIndex = i;
                break;
            }
        }

        if (selectedUsbDeviceIndex == undefined) {
            selectedUsbDeviceIndex = -1;
            this.onUsbDeviceChange(selectedUsbDeviceIndex);
        }

        this.selectedUsbDeviceIndex = selectedUsbDeviceIndex;
    }

    async refreshUsbDevices() {
        const { getUsbDevices } =
            require("instrument/connection/interfaces/usbtmc") as typeof UsbTmcModule;

        const usbDevices = await getUsbDevices();

        runInAction(() => {
            devices.usbDevices = usbDevices;
        });

        this.initUsbDevices();
    }

    onRefreshUsbDevices = (event: React.MouseEvent) => {
        event.preventDefault();
        this.refreshUsbDevices();
    };

    refreshVisaResources() {
        return new Promise<void>(resolve => {
            EEZStudio.electron.ipcRenderer.send("get-visa-resources");
            EEZStudio.electron.ipcRenderer.once(
                "visa-resources",
                (event, args) => {
                    runInAction(() => (this.visaResources = args));
                    resolve();
                }
            );
        });
    }

    onRefreshVisaResources = (event: React.MouseEvent) => {
        event.preventDefault();
        this.refreshVisaResources();
    };

    @action.bound
    onVisaResourceChange(value: string) {
        this.visaResource = value;
    }

    render() {
        let options: JSX.Element[] | null = null;

        if (this.iface === "ethernet") {
            options = [
                <TextInputProperty
                    key="ethernetAddress"
                    name="Server address"
                    value={this.ethernetAddress}
                    onChange={this.onEthernetAddressChange}
                />,
                <NumberInputProperty
                    key="ethernetPort"
                    name="Port"
                    value={this.ethernetPort}
                    onChange={this.onEthernetPortChange}
                />
            ];
        } else if (this.iface === "serial") {
            options = [
                <SelectProperty
                    key="serialPort"
                    name="Port"
                    value={this.serialPortPath}
                    onChange={this.onSerialPortPathChange}
                    inputGroupButton={
                        <button
                            className="btn btn-secondary"
                            title="Refresh list of available serial ports"
                            onClick={this.onRefreshSerialPortPaths}
                        >
                            Refresh
                        </button>
                    }
                >
                    {devices.serialPortPaths.map(serialPortPath => (
                        <option
                            key={serialPortPath.uniqueId}
                            value={serialPortPath.path}
                        >
                            {serialPortPath.description}
                        </option>
                    ))}
                </SelectProperty>,
                <SelectProperty
                    key="serialPortBaudRate"
                    name="Baud rate"
                    value={this.serialPortBaudRate.toString()}
                    onChange={this.onSerialPortBaudRateChange}
                >
                    {this.props.serialBaudRates.map(baudRate => (
                        <option key={baudRate} value={baudRate}>
                            {baudRate}
                        </option>
                    ))}
                </SelectProperty>
            ];
        } else if (this.iface === "usbtmc") {
            options = [
                <SelectProperty
                    key="usbDevice"
                    name="Device"
                    value={(this.selectedUsbDeviceIndex ?? -1).toString()}
                    onChange={optionValue =>
                        this.onUsbDeviceChange(parseInt(optionValue))
                    }
                    inputGroupButton={
                        <button
                            className="btn btn-secondary"
                            title="Refresh list of available USB devices"
                            onClick={this.onRefreshUsbDevices}
                        >
                            Refresh
                        </button>
                    }
                >
                    {(() => {
                        const options = devices.usbDevices.map(
                            (usbDevice, i) => (
                                <option key={i} value={i}>
                                    {usbDevice.name ||
                                        `VID=0x${usbDevice.idVendor.toString(
                                            16
                                        )}, PID=0x${usbDevice.idProduct.toString(
                                            16
                                        )}`}
                                </option>
                            )
                        );

                        if (
                            this.selectedUsbDeviceIndex == undefined ||
                            this.selectedUsbDeviceIndex == -1
                        ) {
                            options.unshift(
                                <option key="not-found" value="-1"></option>
                            );
                        }

                        return options;
                    })()}
                </SelectProperty>
            ];
        } else if (this.iface === "web-simulator") {
            options = [];
        } else {
            options = this.visaResources
                ? [
                      <TextInputProperty
                          name="Resource"
                          value={this.visaResource}
                          onChange={this.onVisaResourceChange}
                          inputGroupButton={
                              <>
                                  <button
                                      className="btn btn-outline-secondary dropdown-toggle dropdown-toggle-split"
                                      type="button"
                                      data-bs-toggle="dropdown"
                                  />
                                  <div className="dropdown-menu dropdown-menu-end">
                                      {this.visaResources.map(
                                          (suggestion, i) => (
                                              <button
                                                  key={i}
                                                  className="dropdown-item"
                                                  type="button"
                                                  onClick={() =>
                                                      this.onVisaResourceChange(
                                                          suggestion
                                                      )
                                                  }
                                              >
                                                  {suggestion}
                                              </button>
                                          )
                                      )}
                                  </div>
                                  <button
                                      className="btn btn-outline-secondary"
                                      title="Refresh list of available VISA resources"
                                      onClick={this.onRefreshVisaResources}
                                  >
                                      Refresh
                                  </button>
                              </>
                          }
                      />
                  ]
                : [
                      <tr key="r_and_s_info">
                          <td colSpan={2} style={{ whiteSpace: "normal" }}>
                              <div
                                  className="alert alert-warning"
                                  style={{ marginTop: 10 }}
                              >
                                  R&S® VISA was not found on your system. For
                                  more information on how to install R&S® VISA
                                  please visit{" "}
                                  <a
                                      href="#"
                                      onClick={event => {
                                          event.preventDefault();
                                          openLink(
                                              "https://www.rohde-schwarz.com/fi/applications/r-s-visa-application-note_56280-148812.html"
                                          );
                                      }}
                                  >
                                      this page
                                  </a>
                                  .
                              </div>
                          </td>
                      </tr>
                  ];
        }

        return (
            <PropertyList>
                <SelectProperty
                    name="Interface"
                    value={this.iface}
                    onChange={this.onIfaceChange}
                >
                    {this.props.availableConnections.indexOf("ethernet") !==
                        -1 && <option value="ethernet">Ethernet</option>}
                    {this.props.availableConnections.indexOf("serial") !==
                        -1 && <option value="serial">Serial</option>}
                    {this.props.availableConnections.indexOf("usbtmc") !==
                        -1 && <option value="usbtmc">USBTMC</option>}
                    {this.props.availableConnections.indexOf(
                        "web-simulator"
                    ) !== -1 && (
                        <option value="web-simulator">WebSimulator</option>
                    )}
                    <option value="visa">VISA</option>
                </SelectProperty>
                {options}
            </PropertyList>
        );
    }
}

@observer
class ConnectionDialog extends React.Component<
    {
        connectionParameters: ConnectionParameters;
        connect: (connectionParameters: ConnectionParameters) => void;
        availableConnections: (
            | "ethernet"
            | "serial"
            | "usbtmc"
            | "web-simulator"
        )[];
        serialBaudRates: number[];
    },
    {}
> {
    @observable
    connectionParameters: ConnectionParameters;

    onConnectionParametersChanged = action(
        (connectionParameters: ConnectionParameters) => {
            this.connectionParameters = connectionParameters;
        }
    );

    isValidConnectionParameters = () => {
        if (!this.connectionParameters) {
            return false;
        }
        if (this.connectionParameters.type == "ethernet") {
            return (
                this.connectionParameters.ethernetParameters?.address?.length >
                0
            );
        }
        if (this.connectionParameters.type == "serial") {
            return this.connectionParameters.serialParameters?.port?.length > 0;
        }
        if (this.connectionParameters.type == "usbtmc") {
            return (
                this.connectionParameters.usbtmcParameters?.idVendor != 0 &&
                this.connectionParameters.usbtmcParameters?.idProduct != 0
            );
        }
        if (this.connectionParameters.type == "web-simulator") {
            return true;
        }
        if (this.connectionParameters.type == "visa") {
            return (
                this.connectionParameters.visaParameters?.resource?.length > 0
            );
        }
        return false;
    };

    handleSubmit = () => {
        this.props.connect(this.connectionParameters);
        return true;
    };

    render() {
        return (
            <Dialog
                okButtonText="Connect"
                onOk={this.handleSubmit}
                okEnabled={this.isValidConnectionParameters}
            >
                <ConnectionProperties
                    connectionParameters={this.props.connectionParameters}
                    onConnectionParametersChanged={
                        this.onConnectionParametersChanged
                    }
                    availableConnections={this.props.availableConnections}
                    serialBaudRates={this.props.serialBaudRates}
                />
            </Dialog>
        );
    }
}

export function showConnectionDialog(
    connectionParameters: ConnectionParameters,
    connect: (connectionParameters: ConnectionParameters) => void,
    availableConnections: (
        | "ethernet"
        | "serial"
        | "usbtmc"
        | "web-simulator"
    )[],
    serialBaudRates: number[]
) {
    showDialog(
        <ConnectionDialog
            connectionParameters={connectionParameters}
            connect={connect}
            availableConnections={availableConnections}
            serialBaudRates={serialBaudRates}
        />
    );
}
