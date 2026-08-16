const { describe, it } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { setTimeout: sleep } = require("node:timers/promises");
const vm = require("node:vm");

function createMockBrowser(options = {}) {
    const { hasWindows = true, resistFingerprinting = true, platformOs = "linux" } = options;

    const mock = {
        runtime: {
            getPlatformInfo: async () => ({ os: platformOs })
        },
        browserAction: {
            popup: undefined,
            setPopup: async ({ popup }) => {
                mock.browserAction.popup = popup;
            },
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
                mock.windows.updatedWindows.push({ windowId, updateInfo: { ...updateInfo } });
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

describe("background.js platform-adaptive behavior", () => {
    const backgroundCode = fs.readFileSync(
        path.resolve(__dirname, "../src/background.js"),
        "utf-8"
    );

    it("should clear popup and attach onClicked listener on Desktop (linux/mac/win)", async () => {
        const mockBrowser = createMockBrowser({ hasWindows: true, platformOs: "linux" });
        const sandbox = { browser: mockBrowser, console };
        vm.createContext(sandbox);

        vm.runInContext(backgroundCode, sandbox);
        await sleep(50);

        // On desktop, popup should be cleared to allow onClicked events
        assert.strictEqual(mockBrowser.browserAction.popup, "");
        assert.strictEqual(mockBrowser.browserAction.onClicked.listeners.length, 1);

        // Verify click toggles resistFingerprinting
        const [clickListener] = mockBrowser.browserAction.onClicked.listeners;
        assert.strictEqual(mockBrowser.privacy.websites.resistFingerprinting.value, true);
        await clickListener();
        assert.strictEqual(mockBrowser.privacy.websites.resistFingerprinting.value, false);
    });

    it("should retain default popup and NOT attach onClicked listener on Android", async () => {
        const mockBrowser = createMockBrowser({ hasWindows: false, platformOs: "android" });
        const sandbox = { browser: mockBrowser, console };
        vm.createContext(sandbox);

        vm.runInContext(backgroundCode, sandbox);
        await sleep(50);

        // On Android, popup must NOT be cleared and onClicked must NOT be registered
        assert.strictEqual(mockBrowser.browserAction.popup, undefined);
        assert.strictEqual(mockBrowser.browserAction.onClicked.listeners.length, 0);
    });

    it("should execute cleanly on Android environment where browser.windows is undefined", async () => {
        const mockBrowser = createMockBrowser({ hasWindows: false, platformOs: "android" });
        const sandbox = { browser: mockBrowser, console };
        vm.createContext(sandbox);

        await assert.doesNotReject(async () => {
            vm.runInContext(backgroundCode, sandbox);
            await sleep(50);
        });

        assert.strictEqual(mockBrowser.tabs.onActivated.listeners.length, 1);
    });

    it("should maximize normal windows on Desktop when configured", async () => {
        const mockBrowser = createMockBrowser({ hasWindows: true, resistFingerprinting: true, platformOs: "linux" });
        mockBrowser.storage.local.data = { maximizeWindowTypes: 1 }; // Maximize Normal
        const sandbox = { browser: mockBrowser, console };
        vm.createContext(sandbox);

        vm.runInContext(backgroundCode, sandbox);
        await sleep(50);

        const [windowListener] = mockBrowser.windows.onCreated.listeners;
        await windowListener({ id: 42, type: "normal", incognito: false });

        assert.strictEqual(mockBrowser.windows.updatedWindows.length, 1);
        assert.deepStrictEqual(mockBrowser.windows.updatedWindows[0], {
            windowId: 42,
            updateInfo: { state: "maximized" }
        });
    });
});
