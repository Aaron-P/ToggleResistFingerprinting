const { describe, it } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function createMockBrowser(options = {}) {
    const { hasWindows = true, resistFingerprinting = true } = options;

    const mock = {
        browserAction: {
            setBadgeBackgroundColor: async () => {},
            setBadgeText: async () => {},
            setBadgeTextColor: async () => {},
            setTitle: async () => {},
            disable: async () => {},
            onClicked: {
                listeners: [],
                addListener(fn) { this.listeners.push(fn); }
            }
        },
        privacy: {
            websites: {
                resistFingerprinting: {
                    value: resistFingerprinting,
                    levelOfControl: "controlled_by_this_extension",
                    get: async () => ({
                        value: mock.privacy.websites.resistFingerprinting.value,
                        levelOfControl: mock.privacy.websites.resistFingerprinting.levelOfControl
                    }),
                    set: async ({ value }) => {
                        mock.privacy.websites.resistFingerprinting.value = value;
                    }
                }
            }
        },
        tabs: {
            onActivated: {
                listeners: [],
                addListener(fn) { this.listeners.push(fn); }
            }
        },
        storage: {
            local: {
                data: {},
                get: async (defaults) => ({ ...defaults, ...mock.storage.local.data }),
                set: async (values) => { Object.assign(mock.storage.local.data, values); }
            }
        }
    };

    if (hasWindows) {
        mock.windows = {
            updatedWindows: [],
            update: async (windowId, updateInfo) => {
                mock.windows.updatedWindows.push({ windowId, updateInfo });
            },
            onCreated: {
                listeners: [],
                addListener(fn) { this.listeners.push(fn); }
            },
            onFocusChanged: {
                listeners: [],
                addListener(fn) { this.listeners.push(fn); }
            }
        };
    }

    return mock;
}

describe("background.js compatibility", () => {
    const backgroundCode = fs.readFileSync(
        path.resolve(__dirname, "../src/background.js"),
        "utf-8"
    );

    it("should execute cleanly on Android environment where browser.windows is undefined", async () => {
        const mockBrowser = createMockBrowser({ hasWindows: false });
        const sandbox = { browser: mockBrowser, console };
        vm.createContext(sandbox);

        // Without guard, this will throw: TypeError: Cannot read properties of undefined (reading 'onCreated')
        await assert.doesNotReject(async () => {
            vm.runInContext(backgroundCode, sandbox);
            await new Promise((resolve) => setTimeout(resolve, 50));
        });

        // Tabs and browser action listeners must still register
        assert.strictEqual(mockBrowser.tabs.onActivated.listeners.length, 1);
        assert.strictEqual(mockBrowser.browserAction.onClicked.listeners.length, 1);
    });

    it("should register windows listeners on Desktop environment where browser.windows is defined", async () => {
        const mockBrowser = createMockBrowser({ hasWindows: true });
        const sandbox = { browser: mockBrowser, console };
        vm.createContext(sandbox);

        await assert.doesNotReject(async () => {
            vm.runInContext(backgroundCode, sandbox);
            await new Promise((resolve) => setTimeout(resolve, 50));
        });

        assert.strictEqual(mockBrowser.windows.onCreated.listeners.length, 1);
        assert.strictEqual(mockBrowser.windows.onFocusChanged.listeners.length, 1);
        assert.strictEqual(mockBrowser.tabs.onActivated.listeners.length, 1);
    });

    it("should maximize normal windows on Desktop when configured", async () => {
        const mockBrowser = createMockBrowser({ hasWindows: true, resistFingerprinting: true });
        mockBrowser.storage.local.data = { maximizeWindowTypes: 1 }; // Maximize Normal
        const sandbox = { browser: mockBrowser, console };
        vm.createContext(sandbox);

        vm.runInContext(backgroundCode, sandbox);
        await new Promise((resolve) => setTimeout(resolve, 50));

        // Trigger onCreated
        const windowListener = mockBrowser.windows.onCreated.listeners[0];
        await windowListener({ id: 42, type: "normal", incognito: false });

        assert.strictEqual(mockBrowser.windows.updatedWindows.length, 1);
        assert.strictEqual(mockBrowser.windows.updatedWindows[0].windowId, 42);
        assert.strictEqual(mockBrowser.windows.updatedWindows[0].updateInfo.state, "maximized");
    });
});
