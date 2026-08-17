const { describe, it } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { setTimeout: sleep } = require("node:timers/promises");
const vm = require("node:vm");

function createMockBrowser(options = {}) {
    const {
        hasWindows = true,
        resistFingerprinting = true,
        platformOs = "linux",
        levelOfControl = "controlled_by_this_extension"
    } = options;

    let disabled = false;
    let actionTitle = "";

    const mock = {
        runtime: {
            getPlatformInfo: async () => ({ os: platformOs })
        },
        browserAction: {
            get disabled() { return disabled; },
            get title() { return actionTitle; },
            setBadgeBackgroundColor: async () => {},
            setBadgeText: async () => {},
            setBadgeTextColor: async () => {},
            setTitle: async ({ title }) => { actionTitle = title; },
            disable: async () => { disabled = true; },
            onClicked: {
                listeners: [],
                addListener(fn) { this.listeners.push(fn); }
            }
        },
        privacy: {
            websites: {
                resistFingerprinting: {
                    value: resistFingerprinting,
                    levelOfControl,
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

describe("background.js behavior", () => {
    const backgroundCode = fs.readFileSync(
        path.resolve(__dirname, "../src/background.js"),
        "utf-8"
    );

    it("should attach onClicked listener and toggle setting on Desktop (linux/mac/win)", async () => {
        const mockBrowser = createMockBrowser({ hasWindows: true, platformOs: "linux" });
        const sandbox = { browser: mockBrowser, console };
        vm.createContext(sandbox);

        vm.runInContext(backgroundCode, sandbox);
        await sleep(50);

        assert.strictEqual(mockBrowser.browserAction.onClicked.listeners.length, 1);

        // Verify click toggles resistFingerprinting
        const [clickListener] = mockBrowser.browserAction.onClicked.listeners;
        assert.strictEqual(mockBrowser.privacy.websites.resistFingerprinting.value, true);
        await clickListener();
        assert.strictEqual(mockBrowser.privacy.websites.resistFingerprinting.value, false);
    });

    it("should attach onClicked listener and toggle setting on Android", async () => {
        const mockBrowser = createMockBrowser({ hasWindows: false, platformOs: "android" });
        const sandbox = { browser: mockBrowser, console };
        vm.createContext(sandbox);

        vm.runInContext(backgroundCode, sandbox);
        await sleep(50);

        assert.strictEqual(mockBrowser.browserAction.onClicked.listeners.length, 1);

        // Verify tap toggles resistFingerprinting on Android
        const [clickListener] = mockBrowser.browserAction.onClicked.listeners;
        assert.strictEqual(mockBrowser.privacy.websites.resistFingerprinting.value, true);
        await clickListener();
        assert.strictEqual(mockBrowser.privacy.websites.resistFingerprinting.value, false);
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

    it("should allow control when levelOfControl is controllable_by_this_extension", async () => {
        const mockBrowser = createMockBrowser({
            hasWindows: true,
            resistFingerprinting: false,
            platformOs: "linux",
            levelOfControl: "controllable_by_this_extension"
        });
        const sandbox = { browser: mockBrowser, console };
        vm.createContext(sandbox);

        vm.runInContext(backgroundCode, sandbox);
        await sleep(50);

        assert.strictEqual(mockBrowser.browserAction.disabled, false);
        assert.strictEqual(mockBrowser.browserAction.onClicked.listeners.length, 1);
    });

    it("should allow control when levelOfControl is controlled_by_this_extension", async () => {
        const mockBrowser = createMockBrowser({
            hasWindows: true,
            resistFingerprinting: true,
            platformOs: "linux",
            levelOfControl: "controlled_by_this_extension"
        });
        const sandbox = { browser: mockBrowser, console };
        vm.createContext(sandbox);

        vm.runInContext(backgroundCode, sandbox);
        await sleep(50);

        assert.strictEqual(mockBrowser.browserAction.disabled, false);
        assert.strictEqual(mockBrowser.browserAction.onClicked.listeners.length, 1);
    });

    it("should disable browserAction and set Permission Denied title when levelOfControl is not_controllable", async () => {
        const mockBrowser = createMockBrowser({
            hasWindows: true,
            resistFingerprinting: false,
            platformOs: "linux",
            levelOfControl: "not_controllable"
        });
        const sandbox = { browser: mockBrowser, console };
        vm.createContext(sandbox);

        vm.runInContext(backgroundCode, sandbox);
        await sleep(50);

        assert.strictEqual(mockBrowser.browserAction.disabled, true);
        assert.strictEqual(mockBrowser.browserAction.title, "Resist Fingerprinting (Permission Denied)");
        assert.strictEqual(mockBrowser.browserAction.onClicked.listeners.length, 0);
    });
});
