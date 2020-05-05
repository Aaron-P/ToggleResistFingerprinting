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

    const maximizeWindowTypes = /** @type {HTMLSelectElement} */ (document.getElementById("maximize-window-types"));

    maximizeWindowTypes.addEventListener("change", async () => {
        await browser.storage.local.set({
            maximizeWindowTypes: maximizeWindowTypes.value
        });
    });

    document.addEventListener("DOMContentLoaded", async () => {
        const results = await browser.storage.local.get({
            maximizeWindowTypes: MaximizeWindowTypes.None
        });
        maximizeWindowTypes.value = results.maximizeWindowTypes;
    });
}());