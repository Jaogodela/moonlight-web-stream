import { getCurrentLanguage, getTranslations } from "../i18n"
import { getThemePreference, setThemePreference } from "../styles/theme"
import { buildUrl } from "../config_"
import { icon, IconName } from "./icon"

export function labelButton(button: HTMLButtonElement, name: IconName, label: string, text = true) {
    button.type = "button"
    button.setAttribute("aria-label", label)
    button.replaceChildren(icon(name), ...(text ? [document.createTextNode(label)] : []))
}

export function themeButton() {
    const I = getTranslations(getCurrentLanguage()).chrome
    const button = document.createElement("button")
    button.className = "gs-icon-btn"
    const update = () => {
        const preference = getThemePreference()
        const label = `${I.theme}: ${I[preference]}. ${I.changeTheme}`
        labelButton(button, preference === "system" ? "monitor-smartphone" : preference === "light" ? "sun" : "moon", label, false)
        button.title = label
    }
    button.addEventListener("click", () => {
        const current = getThemePreference()
        setThemePreference(current === "system" ? "light" : current === "light" ? "dark" : "system")
    })
    document.addEventListener("gs-themechange", update)
    // theme.ts reads storage and dispatches gs-themechange before this listener.
    window.addEventListener("storage", update)
    update()
    return button
}

export class Chrome {
    readonly header = document.createElement("header")
    readonly primary = document.createElement("nav")
    readonly actions = document.createElement("div")
    readonly accountItems = document.createElement("div")
    readonly bottom = document.createElement("nav")
    readonly selector = document.createElement("select")
    private account = document.createElement("button")
    private popover = document.createElement("div")
    private identity = document.createElement("div")
    constructor() {
        const I = getTranslations(getCurrentLanguage()).chrome
        document.documentElement.lang = getCurrentLanguage()
        const skipLink = document.querySelector<HTMLAnchorElement>(".gs-skiplink")
        if (skipLink) skipLink.textContent = I.skipLink
        this.header.className = "gs-topbar"
        const wordmark = document.createElement("a")
        wordmark.className = "gs-wordmark"
        wordmark.href = buildUrl("/")
        wordmark.setAttribute("aria-label", `Gaspar — ${I.library}`)
        wordmark.append("gaspar", document.createElement("span"))
        this.primary.className = "gs-primary-nav"
        this.primary.setAttribute("aria-label", I.navigation)
        this.actions.className = "gs-topbar__actions"
        this.selector.className = "gs-host-selector"
        this.selector.setAttribute("aria-label", I.servers)
        this.selector.hidden = true
        this.account.className = "gs-icon-btn"
        labelButton(this.account, "circle-user-round", I.account, false)
        this.account.setAttribute("aria-expanded", "false")
        this.account.setAttribute("aria-controls", "gs-account-popover")
        this.popover.id = "gs-account-popover"
        this.popover.className = "gs-account-popover"
        this.popover.hidden = true
        const close = () => { this.popover.hidden = true; this.account.setAttribute("aria-expanded", "false") }
        this.account.addEventListener("click", () => {
            this.popover.hidden = !this.popover.hidden
            this.account.setAttribute("aria-expanded", String(!this.popover.hidden))
        })
        document.addEventListener("click", event => {
            if (!this.popover.contains(event.target as Node) && !this.account.contains(event.target as Node)) close()
        })
        document.addEventListener("keydown", event => {
            if (event.key === "Escape" && !this.popover.hidden) { close(); this.account.focus() }
        })
        this.popover.addEventListener("click", event => { if ((event.target as Element).closest("button")) close() })
        this.popover.append(this.identity, this.accountItems)
        this.actions.append(this.selector, themeButton(), this.account, this.popover)
        this.header.append(wordmark, this.primary, this.actions)
        this.bottom.className = "gs-bottomnav"
        this.bottom.setAttribute("aria-label", I.navigation)
    }
    setIdentity(name: string, role: string) {
        const badge = document.createElement("span")
        badge.className = "gs-role-badge"
        badge.textContent = role
        this.identity.replaceChildren(document.createTextNode(name), badge)
        this.account.replaceChildren(document.createTextNode(name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase() || "G"))
    }
}
