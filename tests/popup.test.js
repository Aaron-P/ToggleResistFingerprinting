const { describe, it } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { setTimeout: sleep } = require("node:timers/promises");
const vm = require("node:vm");

function createMockPopupEnvironment(options = {}) {
    const { resistFingerprinting = false, levelOfControl = "controlled_by_this_extension" } = options;

    let toggleChecked = false;
    let toggleDisabled = false;
    const eventListeners = new Map();

    const toggleElement = {
        get checked() { return toggleChecked; },
        set checked(val) { toggleChecked = Boolean(val); },
        get disabled() { return toggleDisabled; },
        set disabled(val) { toggleDisabled = Boolean(val); },
        addEventListener(event, fn) {
            const listeners = eventListeners.get(event) ?? [];
            listeners.push(fn);
            eventListeners.set(event, listeners);
        },
        async dispatchEvent(event) {
            for (const fn of eventListeners.get(event) ?? []) {
                await fn();
            }
        }
    };

    const classList = new Set();
    const statusLabel = {
        textContent: "",
        classList: {
            add: (...cls) => cls.forEach((c) => classList.add(c)),
            remove: (...cls) => cls.forEach((c) => classList.delete(c)),
            toggle: (cls, force) => {
                const shouldAdd = force ?? !classList.has(cls);
                if (shouldAdd) {
                    classList.add(cls);
                } else {
                    classList.delete(cls);
                }
                return classList.has(cls);
            },
            contains: (cls) => classList.has(cls)
        },
        get className() { return Array.from(classList).join(" "); },
        set className(val) {
            classList.clear();
            val.split(/\s+/).filter(Boolean).forEach((c) => classList.add(c));
        }
    };

    const mockBrowser = {
        privacy: {
            websites: {
                resistFingerprinting: {
                    value: resistFingerprinting,
                    levelOfControl,
                    get: async () => ({
                        value: mockBrowser.privacy.websites.resistFingerprinting.value,
                        levelOfControl: mockBrowser.privacy.websites.resistFingerprinting.levelOfControl
                    }),
                    set: async ({ value }) => {
                        mockBrowser.privacy.websites.resistFingerprinting.value = value;
                    }
                }
            }
        }
    };

    const docListeners = new Map();
    const mockDocument = {
        readyState: "complete",
        getElementById: (id) => {
            if (id === "rfp-toggle") return toggleElement;
            if (id === "status-label") return statusLabel;
            return null;
        },
        addEventListener: (event, fn) => {
            const listeners = docListeners.get(event) ?? [];
            listeners.push(fn);
            docListeners.set(event, listeners);
        }
    };

    return {
        mockBrowser,
        mockDocument,
        toggleElement,
        statusLabel
    };
}

describe("popup.js controller", () => {
    const popupCode = fs.readFileSync(
        path.resolve(__dirname, "../src/popup.js"),
        "utf-8"
    );

    it("should initialize with Enabled state when resistFingerprinting is true", async () => {
        const env = createMockPopupEnvironment({ resistFingerprinting: true });
        const sandbox = {
            browser: env.mockBrowser,
            document: env.mockDocument,
            console
        };
        vm.createContext(sandbox);

        vm.runInContext(popupCode, sandbox);
        await sleep(50);

        assert.strictEqual(env.toggleElement.checked, true);
        assert.strictEqual(env.statusLabel.textContent, "Enabled");
        assert.ok(env.statusLabel.classList.contains("status-on"));
    });

    it("should initialize with Disabled state when resistFingerprinting is false", async () => {
        const env = createMockPopupEnvironment({ resistFingerprinting: false });
        const sandbox = {
            browser: env.mockBrowser,
            document: env.mockDocument,
            console
        };
        vm.createContext(sandbox);

        vm.runInContext(popupCode, sandbox);
        await sleep(50);

        assert.strictEqual(env.toggleElement.checked, false);
        assert.strictEqual(env.statusLabel.textContent, "Disabled");
        assert.ok(env.statusLabel.classList.contains("status-off"));
    });

    it("should update setting and UI when toggle change event fires", async () => {
        const env = createMockPopupEnvironment({ resistFingerprinting: false });
        const sandbox = {
            browser: env.mockBrowser,
            document: env.mockDocument,
            console
        };
        vm.createContext(sandbox);

        vm.runInContext(popupCode, sandbox);
        await sleep(50);

        // Simulate user clicking toggle switch
        env.toggleElement.checked = true;
        await env.toggleElement.dispatchEvent("change");

        assert.strictEqual(env.mockBrowser.privacy.websites.resistFingerprinting.value, true);
        assert.strictEqual(env.statusLabel.textContent, "Enabled");
        assert.ok(env.statusLabel.classList.contains("status-on"));
    });

    it("should disable toggle and show Permission Denied if control is not available", async () => {
        const env = createMockPopupEnvironment({
            resistFingerprinting: false,
            levelOfControl: "not_controllable"
        });
        const sandbox = {
            browser: env.mockBrowser,
            document: env.mockDocument,
            console
        };
        vm.createContext(sandbox);

        vm.runInContext(popupCode, sandbox);
        await sleep(50);

        assert.strictEqual(env.toggleElement.disabled, true);
        assert.strictEqual(env.statusLabel.textContent, "Permission Denied");
        assert.ok(env.statusLabel.classList.contains("status-off"));
    });
});
