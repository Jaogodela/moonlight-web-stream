export type ThemePreference = "system" | "light" | "dark";

const storageKey = "gaspar.theme";
const lightScheme = window.matchMedia("(prefers-color-scheme: light)");

function readPreference(): ThemePreference {
    try {
        const value = localStorage.getItem(storageKey);
        if (value === "light" || value === "dark") return value;
    } catch { /* Storage may be unavailable; keep the device default. */ }
    return "system";
}

let preference = readPreference();

export function getThemePreference(): ThemePreference {
    return preference;
}

export function applyTheme(): void {
    const theme = preference === "system"
        ? (lightScheme.matches ? "light" : "dark")
        : preference;
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.themePref = preference;

    const manualMetas = document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]:not([media])');
    if (preference === "system") {
        manualMetas.forEach(meta => meta.remove());
    } else {
        let meta = manualMetas[0];
        if (!meta) {
            meta = document.createElement("meta");
            meta.name = "theme-color";
            document.head.prepend(meta);
        }
        meta.content = theme === "dark" ? "#161615" : "#FFFFFF";
        manualMetas.forEach((other, index) => { if (index > 0) other.remove(); });
    }

    document.dispatchEvent(new CustomEvent("gs-themechange", {
        bubbles: true,
        detail: { preference, theme }
    }));
}

export function setThemePreference(value: ThemePreference): void {
    if (value !== "system" && value !== "light" && value !== "dark") {
        throw new TypeError("Invalid theme preference");
    }
    preference = value;
    try {
        localStorage.setItem(storageKey, value);
    } catch { /* Apply the preference even when persistence is unavailable. */ }
    applyTheme();
}

lightScheme.addEventListener("change", () => {
    if (preference === "system") applyTheme();
});

window.addEventListener("storage", event => {
    if (event.key === storageKey || event.key === null) {
        // Ignore sessionStorage events; reading localStorage can throw in restricted contexts.
        try {
            if (event.storageArea && event.storageArea !== localStorage) return;
        } catch { return; }
        preference = readPreference();
        applyTheme();
    }
});

applyTheme();
