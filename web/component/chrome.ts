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
    window.addEventListener("storage", update)
    update()
    return button
}

export type ConnectionTestState = "idle" | "testing" | "success" | "failure"

export class Chrome {
    readonly header = document.createElement("header")
    readonly primary = document.createElement("nav")
    readonly actions = document.createElement("div")
    readonly accountItems = document.createElement("div")
    readonly bottom = document.createElement("nav")

    readonly selector = document.createElement("select")
    readonly serverButton = document.createElement("button")
    readonly serverPopover = document.createElement("div")
    readonly testConnectionButton = document.createElement("button")
    readonly connectionResult = document.createElement("p")
    readonly manageServersButton = document.createElement("button")

    private account = document.createElement("button")
    private accountPopover = document.createElement("div")
    private identity = document.createElement("div")
    private serverName = document.createElement("span")
    private serverIndicator = document.createElement("span")
    private accountInitials = document.createElement("span")

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

        this.serverButton.className = "gs-server-chip"
        this.serverButton.setAttribute("aria-label", I.servers)
        this.serverButton.setAttribute("aria-expanded", "false")
        this.serverButton.setAttribute("aria-controls", "gs-server-popover")
        this.serverName.className = "gs-server-chip__name"
        this.serverIndicator.className = "gs-server-chip__status"
        this.serverIndicator.setAttribute("aria-hidden", "true")
        this.serverButton.replaceChildren(icon("monitor"), this.serverName, this.serverIndicator)
        this.setServer(I.serverUnavailable, "unknown")

        this.serverPopover.id = "gs-server-popover"
        this.serverPopover.className = "gs-server-popover"
        this.serverPopover.hidden = true
        this.selector.className = "gs-host-selector"
        this.selector.setAttribute("aria-label", I.servers)
        this.selector.hidden = true

        labelButton(this.testConnectionButton, "activity", I.testConnection)
        this.testConnectionButton.className = "gs-btn gs-btn--secondary gs-server-popover__test"
        this.testConnectionButton.disabled = true
        this.connectionResult.className = "gs-connection-result"
        this.connectionResult.setAttribute("role", "status")
        this.connectionResult.setAttribute("aria-live", "polite")
        this.connectionResult.hidden = true

        labelButton(this.manageServersButton, "settings-2", I.manageServers)
        this.manageServersButton.className = "gs-btn gs-btn--ghost gs-server-popover__manage"
        this.serverPopover.append(this.selector, this.testConnectionButton, this.connectionResult, this.manageServersButton)

        const closeServerMenu = () => {
            this.serverPopover.hidden = true
            this.serverButton.setAttribute("aria-expanded", "false")
        }
        this.selector.addEventListener("change", closeServerMenu)
        this.serverButton.addEventListener("click", () => {
            this.accountPopover.hidden = true
            this.account.setAttribute("aria-expanded", "false")
            this.serverPopover.hidden = !this.serverPopover.hidden
            this.serverButton.setAttribute("aria-expanded", String(!this.serverPopover.hidden))
        })
        this.manageServersButton.addEventListener("click", closeServerMenu)

        this.account.className = "gs-icon-btn gs-account-button"
        this.accountInitials.className = "gs-account-avatar"
        this.account.append(this.accountInitials)
        this.account.setAttribute("aria-label", I.account)
        this.account.setAttribute("aria-expanded", "false")
        this.account.setAttribute("aria-controls", "gs-account-popover")
        this.accountPopover.id = "gs-account-popover"
        this.accountPopover.className = "gs-account-popover"
        this.accountPopover.hidden = true
        const closeAccountMenu = () => {
            this.accountPopover.hidden = true
            this.account.setAttribute("aria-expanded", "false")
        }
        this.account.addEventListener("click", () => {
            closeServerMenu()
            this.accountPopover.hidden = !this.accountPopover.hidden
            this.account.setAttribute("aria-expanded", String(!this.accountPopover.hidden))
        })

        document.addEventListener("click", event => {
            const target = event.target as Node
            if (!this.serverPopover.contains(target) && !this.serverButton.contains(target)) closeServerMenu()
            if (!this.accountPopover.contains(target) && !this.account.contains(target)) closeAccountMenu()
        })
        document.addEventListener("keydown", event => {
            if (event.key === "Escape") {
                if (!this.serverPopover.hidden) { closeServerMenu(); this.serverButton.focus() }
                if (!this.accountPopover.hidden) { closeAccountMenu(); this.account.focus() }
            }
        })
        this.accountPopover.addEventListener("click", event => {
            if ((event.target as Element).closest("button, a")) closeAccountMenu()
        })

        this.identity.className = "gs-account-identity"
        this.accountPopover.append(this.identity, this.accountItems)
        this.actions.append(this.serverButton, this.serverPopover, themeButton(), this.account, this.accountPopover)
        this.header.append(wordmark, this.primary, this.actions)
        this.bottom.className = "gs-bottomnav"
        this.bottom.setAttribute("aria-label", I.navigation)

        this.setConnectionTestState("idle")
    }

    setIdentity(name: string, role: string) {
        const initials = name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join("").toLocaleUpperCase() || "G"
        this.accountInitials.textContent = initials
        this.account.setAttribute("aria-label", `${getTranslations(getCurrentLanguage()).chrome.account}: ${name}`)
        this.account.title = name

        const nameElement = document.createElement("span")
        nameElement.className = "gs-account-identity__name"
        nameElement.textContent = name
        const badge = document.createElement("span")
        badge.className = "gs-role-badge"
        badge.textContent = role
        this.identity.replaceChildren(nameElement, badge)
    }

    setServer(name: string, state: "online" | "offline" | "unknown") {
        const I = getTranslations(getCurrentLanguage()).chrome
        const status = state === "online" ? I.serverOnline : state === "offline" ? I.serverOffline : I.serverUnavailable
        this.serverName.textContent = name
        this.serverIndicator.dataset.state = state
        this.serverButton.setAttribute("aria-label", `${I.servers}: ${name}, ${status}`)
        this.serverButton.title = `${name} · ${status}`
    }

    setConnectionTestState(state: ConnectionTestState, message?: string) {
        const I = getTranslations(getCurrentLanguage()).chrome
        this.testConnectionButton.disabled = state === "testing" || state === "idle" && this.selector.options.length === 0
        this.testConnectionButton.setAttribute("aria-busy", String(state === "testing"))
        labelButton(this.testConnectionButton, state === "testing" ? "rotate-ccw" : "activity", state === "testing" ? I.testingConnection : I.testConnection)
        this.connectionResult.hidden = state === "idle"
        this.connectionResult.dataset.state = state
        this.connectionResult.textContent = message ?? (state === "testing" ? I.testingConnection : "")
    }

    resetConnectionTest() {
        this.setConnectionTestState("idle")
    }
}
