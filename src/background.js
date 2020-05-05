(async function () {
    "use strict";

    //Bit-flag enum
    const MaximizeWindowTypes = {
        0: "None",
        1: "Normal",
        2: "Private",
        "None": 0,
        "Normal": 1,
        "Private": 2,
    };

    async function setButtonState(enabled) {
        if (enabled) {
            await browser.browserAction.setBadgeBackgroundColor({ color: "#00BF00" });
            await browser.browserAction.setBadgeText({ text: "On" });
        } else {
            await browser.browserAction.setBadgeBackgroundColor({ color: "#FF0000" });
            await browser.browserAction.setBadgeText({ text: "Off" });
        }
    }

    async function refreshState() {
        enabled = (await browser.privacy.websites.resistFingerprinting.get({})).value;
        await setButtonState(enabled);
    }

    const settings = await browser.privacy.websites.resistFingerprinting.get({});
    let enabled = settings.value;
    await browser.browserAction.setBadgeTextColor({ color: "#FFFFFF" });
    await setButtonState(enabled);

    if (settings.levelOfControl !== "controlled_by_this_extension" &&
        settings.levelOfControl !== "controllable_by_this_extension") {
        await browser.browserAction.disable();
        await browser.browserAction.setTitle({ title: "Resist Fingerprinting (Permission Denied)" });
        return;
    }

    browser.browserAction.onClicked.addListener(async () => {
        enabled = !(await browser.privacy.websites.resistFingerprinting.get({})).value;
        await browser.privacy.websites.resistFingerprinting.set({ value: enabled });
        await setButtonState(enabled);
    });

    browser.windows.onCreated.addListener(async (window) => {
        //Only resize normal windows.
        if (window.type !== "normal")
            return;

        //If resist fingerprinting is disabled rely on normal window size functionality.
        refreshState();
        if (!enabled)
            return;

        const options = await browser.storage.local.get({
            maximizeWindowTypes: MaximizeWindowTypes.None
        });

        if (!window.incognito && (options.maximizeWindowTypes & MaximizeWindowTypes.Normal))
            await browser.windows.update(window.id, { state: "maximized" });
        if (window.incognito && (options.maximizeWindowTypes & MaximizeWindowTypes.Private))
            await browser.windows.update(window.id, { state: "maximized" });
    });

    //The setting can be changed out from under us, e.g. via about:config, and
    //browser.privacy.websites.resistFingerprinting.onChange doesn't seem to
    //fire in all cases, so check the value periodically.
    browser.tabs.onActivated.addListener(refreshState);
    browser.windows.onFocusChanged.addListener(refreshState)
}());