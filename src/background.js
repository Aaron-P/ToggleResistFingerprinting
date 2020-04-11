(async function () {
    "use strict";

    async function setButtonState(enabled) {
        if (enabled) {
            await browser.browserAction.setBadgeBackgroundColor({ color: "#00BF00" });
            await browser.browserAction.setBadgeText({ text: "On" });
        } else {
            await browser.browserAction.setBadgeBackgroundColor({ color: "#FF0000" });
            await browser.browserAction.setBadgeText({ text: "Off" });
        }
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
}());