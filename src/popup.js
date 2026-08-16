(async () => {
    "use strict";

    const toggle = /** @type {HTMLInputElement | null} */ (document.getElementById("rfp-toggle"));
    const statusLabel = document.getElementById("status-label");

    const updateUI = (enabled) => {
        if (toggle) {
            toggle.checked = enabled;
        }
        if (statusLabel) {
            statusLabel.textContent = enabled ? "Enabled" : "Disabled";
            statusLabel.classList.toggle("status-on", enabled);
            statusLabel.classList.toggle("status-off", !enabled);
        }
    };

    const init = async () => {
        try {
            const { value: enabled, levelOfControl } = await browser.privacy.websites.resistFingerprinting.get({});
            updateUI(enabled);

            const isControllable = levelOfControl === "controlled_by_this_extension" ||
                                  levelOfControl === "controllable_by_this_extension";

            if (!isControllable) {
                if (toggle) {
                    toggle.disabled = true;
                }
                if (statusLabel) {
                    statusLabel.textContent = "Permission Denied";
                    statusLabel.classList.remove("status-on");
                    statusLabel.classList.add("status-off");
                }
                return;
            }

            toggle?.addEventListener("change", async () => {
                const isChecked = toggle.checked;
                try {
                    await browser.privacy.websites.resistFingerprinting.set({ value: isChecked });
                    updateUI(isChecked);
                } catch (err) {
                    console.error("Failed to update resistFingerprinting setting:", err);
                    updateUI(!isChecked);
                }
            });
        } catch (err) {
            console.error("Failed to initialize popup:", err);
        }
    };

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init, { once: true });
    } else {
        await init();
    }
})();
