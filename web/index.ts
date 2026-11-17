import { Chrome, labelButton, themeButton } from "./component/chrome"
import "./polyfill/index"
import { Api, getApi, apiPostHost, FetchError, apiLogout, apiGetUser, tryLogin, apiGetHost, apiGetRole, apiPatchRole } from "./api"
import { AddHostModal } from "./component/host/add_modal"
import { HostList } from "./component/host/list"
import { Component, ComponentEvent } from "./component/index"
import { showNotification } from "./component/notification"
import { showMessage, showModal } from "./component/modal/index"
import { setContextMenu } from "./component/context_menu"
import { GameList } from "./component/game/list"
import { Host } from "./component/host/index"
import { testHostConnection } from "./component/host/connection_test"
import { App, DetailedRole, DetailedUser } from "./api_bindings"
import { getLocalStreamSettings, globalDefaultSettings, setLocalStreamSettings, StreamSettingsComponent } from "./component/settings_menu"
import { adoptRoleDefaultLanguage, getCurrentLanguage, getTranslations } from "./i18n"
import { setTouchContextMenuEnabled } from "./polyfill/ios_right_click"
import { buildUrl } from "./config_"
import { setStyle as setPageStyle } from "./styles/index"

// TODO: look at this? https://developer.mozilla.org/en-US/docs/Web/API/Web_components

let I = getTranslations(getCurrentLanguage())

async function startApp() {
    setTouchContextMenuEnabled(true)

    const api = await getApi()

    const bootstrapRole = await apiGetRole(api, { id: null })
    adoptRoleDefaultLanguage(bootstrapRole.role.default_settings)
    I = getTranslations(getCurrentLanguage())

    const rootElement = document.getElementById("root");
    if (rootElement == null) {
        showNotification(I.index.rootNotFound, "error")
        return;
    }

    let lastAppState: AppState | null = null
    if (sessionStorage) {
        const lastStateText = sessionStorage.getItem("mlState")
        if (lastStateText) {
            lastAppState = JSON.parse(lastStateText)
            // Server management is a menu destination; launch back into the library.
            if (lastAppState?.display === "hosts") lastAppState = null
        }
    }

    const app = new MainApp(api, bootstrapRole.role)
    app.mount(rootElement)

    window.addEventListener("popstate", event => {
        app.setAppState(event.state, false)
    })

    app.forceFetch()

    if (lastAppState) {
        app.setAppState(lastAppState)
    }
}

startApp()

type DisplayStates = "hosts" | "games" | "settings"

type AppState = { display: DisplayStates, hostId?: number }
function setAppState(state: AppState, pushHistory: boolean) {
    if (pushHistory) {
        history.pushState(state, "")
    }

    if (sessionStorage) {
        sessionStorage.setItem("mlState", JSON.stringify(state))
    }
}
function backAppState() {
    history.back()
}

class MainApp implements Component {
    private api: Api
    private user: DetailedUser | null = null
    private role: DetailedRole | null = null

    private divElement = document.createElement("div")

    // Top Line
    private chrome = new Chrome()
    private topLine = this.chrome.header
    private pageHeader = document.createElement("header")
    private pageTitle = document.createElement("h1")
    private main = document.createElement("main")
    private libraryNav = document.createElement("button")
    private mobileLibrary = document.createElement("button")
    private mobileSettings = document.createElement("button")
    private lastHostId: number | null = null
    private appearance = document.createElement("div")


    private topLineActions = document.createElement("div")
    private logoutButton = document.createElement("button")
    // This is for the default user
    private loginButton = document.createElement("button")
    private adminButton = document.createElement("button")

    // Actions
    private actionElement = document.createElement("div")

    private backButton: HTMLButtonElement = document.createElement("button")

    private hostAddButton: HTMLButtonElement = document.createElement("button")
    private settingsButton: HTMLButtonElement = document.createElement("button")
    private saveRoleDefaultsButton: HTMLButtonElement = document.createElement("button")

    // Different submenus
    private currentDisplay: DisplayStates | null = null
    private appStateWasRestored = false

    private hostList: HostList
    private gameList: GameList | null = null
    private libraryHeader = document.createElement("header")
    private libraryCount = document.createElement("p")
    private settings: StreamSettingsComponent | null = null

    constructor(api: Api, bootstrapRole: DetailedRole) {
        this.api = api
        this.role = bootstrapRole

        this.topLineActions = this.chrome.accountItems
        const C = I.chrome
        labelButton(this.loginButton, "log-in", C.login)
        labelButton(this.logoutButton, "log-out", C.logout)
        labelButton(this.adminButton, "shield-check", C.admin)
        labelButton(this.backButton, "arrow-left", I.index.back)
        labelButton(this.hostAddButton, "plus", C.addHost)
        labelButton(this.settingsButton, "settings-2", C.settings, false)
        labelButton(this.saveRoleDefaultsButton, "save", I.settings.saveRoleDefaults)
        this.chrome.actions.insertBefore(this.settingsButton, this.chrome.actions.children[2])
        this.settingsButton.className = "gs-desktop-settings gs-icon-btn"
        this.libraryNav.type = "button"
        this.libraryNav.textContent = C.library
        labelButton(this.mobileLibrary, "library-big", C.library)
        labelButton(this.mobileSettings, "settings-2", C.settings)
        const openLibrary = () => {
            const id = this.lastHostId != null && this.hostList.getHost(this.lastHostId)
                ? this.lastHostId : this.hostList.getHosts()[0]?.getHostId()
            if (id != null) this.setCurrentDisplay("games", { hostId: id })
            else this.setCurrentDisplay("hosts")
        }
        for (const button of [this.libraryNav, this.mobileLibrary]) button.addEventListener("click", openLibrary)
        this.mobileSettings.addEventListener("click", () => this.setCurrentDisplay("settings"))
        this.chrome.primary.append(this.libraryNav)
        this.chrome.bottom.append(this.mobileLibrary, this.mobileSettings)
        this.chrome.manageServersButton.addEventListener("click", () => this.setCurrentDisplay("hosts"))
        this.chrome.selector.addEventListener("change", () => {
            const hostId = Number(this.chrome.selector.value)
            if (!Number.isFinite(hostId)) return
            this.lastHostId = hostId
            this.chrome.resetConnectionTest()
            this.setCurrentDisplay("games", { hostId })
        })
        this.chrome.testConnectionButton.addEventListener("click", () => { void this.testServerConnection() })
        this.pageHeader.className = "gs-page-header"
        this.main.id = "main-content"
        this.main.tabIndex = -1
        this.main.className = "gs-main"
        this.pageHeader.append(this.pageTitle, this.actionElement)
        this.main.append(this.pageHeader)
        this.logoutButton.addEventListener("click", async () => {
            await apiLogout(this.api)
            window.location.reload()
        })


        this.loginButton.addEventListener("click", async () => {
            const success = await tryLogin()
            if (success) {
                window.location.reload()
            }
        })


        this.adminButton.addEventListener("click", async () => {
            window.location.href = buildUrl("/admin.html")
        })


        // Actions
        this.actionElement.classList.add("gs-page-header__actions")

        // Back button

        this.backButton.classList.add("button-fit-content")
        this.backButton.addEventListener("click", backAppState)
        this.backButton.dataset.variant = "back-button"

        // Host add button

        this.hostAddButton.addEventListener("click", this.addHost.bind(this))

        // Host list
        this.hostList = new HostList(api)
        this.hostList.addHostsChangedListener(() => this.syncNavigation())
        this.appearance.className = "gs-theme-row"
        this.appearance.append(document.createTextNode(I.chrome.theme), themeButton())
        this.hostList.addHostOpenListener(this.onHostOpen.bind(this))

        // Settings Button

        this.settingsButton.addEventListener("click", () => this.setCurrentDisplay("settings"))


        this.saveRoleDefaultsButton.classList.add("button-fit-content")
        this.saveRoleDefaultsButton.addEventListener("click", this.onSaveRoleDefaults.bind(this))
        this.saveRoleDefaultsButton.dataset.variant = "save-button"

        // Settings
        this.settings = new StreamSettingsComponent(
            bootstrapRole.permissions,
            getLocalStreamSettings(bootstrapRole.default_settings)
        )
        this.settings.addChangeListener(this.onSettingsChange.bind(this))

        // Append default elements
        this.divElement.appendChild(this.topLine)
        this.divElement.append(this.main, this.chrome.bottom)

        this.setCurrentDisplay("hosts", null, false)

        // Context Menu
        document.body.addEventListener("contextmenu", this.onContextMenu.bind(this), { passive: false })
    }

    setAppState(state: AppState, pushIntoHistory?: boolean) {
        if (!state) return
        this.appStateWasRestored = true
        if (state.display == "hosts") {
            this.setCurrentDisplay("hosts", null, pushIntoHistory)
        } else if (state.display == "games" && state.hostId != null) {
            this.setCurrentDisplay("games", { hostId: state.hostId }, pushIntoHistory)
        } else if (state.display == "settings") {
            this.setCurrentDisplay("settings", null, pushIntoHistory)
        }
    }

    private async addHost() {
        const modal = new AddHostModal()

        let host = await showModal(modal);

        if (host) {
            let newHost
            try {
                newHost = await apiPostHost(this.api, host)
            } catch (e) {
                if (e instanceof FetchError) {
                    const response = e.getResponse()
                    if (response && response.status == 404) {
                        showNotification(I.index.addHostUnreachable(host.address))
                        return
                    }
                }
                throw e
            }

            this.hostList.insertList(newHost.host_id, newHost)
            this.syncNavigation()
        }
    }

    private onContextMenu(event: MouseEvent) {
        if (this.currentDisplay == "hosts" || this.currentDisplay == "games") {
            const elements = [
                {
                    name: I.index.reload,
                    callback: this.forceFetch.bind(this)
                }
            ]

            setContextMenu(event, {
                elements
            })
        }
    }

    private async onHostOpen(event: ComponentEvent<Host>) {
        const hostId = event.component.getHostId()

        this.setCurrentDisplay("games", { hostId })
    }

    private onSettingsChange() {
        if (!this.settings) {
            showNotification(I.index.saveSettingsFailed)
            return
        }

        const previousLanguage = getLocalStreamSettings(globalDefaultSettings()).language
        const newSettings = this.settings.getStreamSettings()

        // store settings in localStorage
        setLocalStreamSettings(newSettings)
        // apply style
        setPageStyle(newSettings.pageStyle)

        if (previousLanguage !== newSettings.language) {
            window.location.reload()
        }
    }

    private async onSaveRoleDefaults() {
        if (!this.settings || !this.role || this.user?.role !== "Admin") {
            showNotification(I.settings.saveRoleDefaultsFailed)
            return
        }

        this.saveRoleDefaultsButton.disabled = true

        try {
            const newSettings = this.settings.getStreamSettings()
            await apiPatchRole(this.api, {
                id: this.role.id,
                name: null,
                ty: this.role.ty,
                default_settings: newSettings,
                permissions: null,
            })

            this.role = {
                ...this.role,
                default_settings: newSettings,
            }

            await showMessage(I.settings.saveRoleDefaultsSuccess)
        } catch {
            showNotification(I.settings.saveRoleDefaultsFailed)
        } finally {
            this.saveRoleDefaultsButton.disabled = false
        }
    }

    private setCurrentDisplay(display: "hosts",
        extraInfo?: null,
        pushIntoHistory?: boolean
    ): void
    private setCurrentDisplay(
        display: "games",
        extraInfo?: {
            hostId?: number | null,
            hostCache?: Array<App>
        },
        pushIntoHistory?: boolean
    ): void
    private setCurrentDisplay(display: "settings", extraInfo?: null, pushIntoHistory?: boolean): void

    private setCurrentDisplay(
        display: "hosts" | "games" | "settings",
        extraInfo?: {
            hostId?: number | null,
            hostCache?: Array<App>
        } | null,
        pushIntoHistory_?: boolean
    ) {
        const pushIntoHistory = pushIntoHistory_ === undefined ? true : pushIntoHistory_
        if (pushIntoHistory) this.appStateWasRestored = true

        if (display == "games" && extraInfo?.hostId == null) {
            // invalid input state
            throw "invalid display state was requested"
        }

        // Check if we need to change
        if (this.currentDisplay == display) {
            if (this.currentDisplay == "games" && this.gameList?.getHostId() != extraInfo?.hostId) {
                // fall through
            } else {
                return
            }
        }

        // Unmount the current display
        if (this.currentDisplay == "hosts") {
            if (this.actionElement.contains(this.hostAddButton)) this.actionElement.removeChild(this.hostAddButton)
            if (this.actionElement.contains(this.backButton)) this.actionElement.removeChild(this.backButton)

            this.hostList.unmount(this.main)
        } else if (this.currentDisplay == "games") {
            if (this.actionElement.contains(this.backButton)) this.actionElement.removeChild(this.backButton)

            this.gameList?.unmount(this.main)
            this.libraryHeader.remove()
        } else if (this.currentDisplay == "settings") {
            if (this.actionElement.contains(this.backButton)) this.actionElement.removeChild(this.backButton)
            if (this.actionElement.contains(this.saveRoleDefaultsButton)) {
                this.actionElement.removeChild(this.saveRoleDefaultsButton)
            }

            this.settings?.unmount(this.main)
            this.main.querySelector(".gs-theme-row")?.remove()
        }

        // Mount the new display
        if (display == "hosts") {
            this.actionElement.appendChild(this.backButton)
            this.actionElement.appendChild(this.hostAddButton)

            this.hostList.mount(this.main)

            setAppState({ display: "hosts" }, pushIntoHistory)
        } else if (display == "games" && extraInfo?.hostId != null) {
            if (this.gameList?.getHostId() != extraInfo?.hostId) {
                this.gameList = new GameList(this.api, extraInfo?.hostId, extraInfo?.hostCache ?? null)
                this.gameList.addForceReloadListener(this.forceFetch.bind(this))
            }

            const libraryTitle = document.createElement("span")
            libraryTitle.hidden = true
            this.libraryHeader.className = "gs-library-header"
            this.libraryHeader.replaceChildren(libraryTitle, this.libraryCount)
            this.gameList.setCountListener(count => {
                this.libraryCount.textContent = I.game.gameCount(count)
            })
            this.main.append(this.libraryHeader)
            this.gameList.mount(this.main)

            this.refreshGameListActiveGame()

            setAppState({ display: "games", hostId: this.gameList?.getHostId() }, pushIntoHistory)
        } else if (display == "settings") {
            this.actionElement.appendChild(this.backButton)
            if (this.user?.role == "Admin") {
                this.actionElement.appendChild(this.saveRoleDefaultsButton)
            }

            this.settings?.mount(this.main)
            this.main.append(this.appearance)

            setAppState({ display: "settings" }, pushIntoHistory)
        }

        this.currentDisplay = display
        if (display === "games") this.lastHostId = extraInfo?.hostId ?? null
        this.pageTitle.textContent = display === "games" ? I.chrome.library : display === "hosts" ? I.chrome.servers : I.chrome.settings
        this.syncNavigation()
    }

    async forceFetch() {
        const promiseUser = this.refreshUserRole()
        const promiseRoles = this.refreshUserPermissions()

        await Promise.all([
            this.hostList.forceFetch(),
            this.gameList?.forceFetch()
        ])

        if (this.currentDisplay == "games"
            && this.gameList
            && !this.hostList.getHost(this.gameList.getHostId())) {
            const firstHost = this.hostList.getHosts()[0]
            if (firstHost) this.setCurrentDisplay("games", { hostId: firstHost.getHostId() }, false)
            else this.setCurrentDisplay("hosts", null, false)
        }

        await Promise.all([
            promiseUser,
            promiseRoles,
            this.refreshGameListActiveGame()
        ])
        this.syncNavigation()
        const firstHost = this.hostList.getHosts()[0]
        if (!this.appStateWasRestored && this.currentDisplay === "hosts" && firstHost) {
            this.setCurrentDisplay("games", { hostId: firstHost.getHostId() }, false)
        }
    }
    private syncNavigation() {
        const hosts = this.hostList.getHosts()
        const selectedHostId = this.currentDisplay === "games" ? this.gameList?.getHostId() : this.lastHostId
        const selectedHost = hosts.find(host => host.getHostId() === selectedHostId) ?? hosts[0]
        this.chrome.selector.hidden = hosts.length === 0
        this.chrome.selector.disabled = hosts.length === 0
        this.chrome.selector.replaceChildren(...hosts.map(host => {
            const option = document.createElement("option")
            option.value = String(host.getHostId())
            option.textContent = host.getCache()?.name ?? String(host.getHostId())
            option.selected = host.getHostId() === selectedHost?.getHostId()
            return option
        }))
        if (selectedHost) {
            this.chrome.selector.value = String(selectedHost.getHostId())
            const cache = selectedHost.getCache()
            const serverState = cache == null ? "unknown" : cache.server_state == null ? "offline" : "online"
            this.chrome.setServer(cache?.name ?? String(selectedHost.getHostId()), serverState)
        } else {
            this.chrome.setServer(I.chrome.serverUnavailable, "unknown")
        }
        this.chrome.resetConnectionTest()
        for (const [buttons, active] of [
            [[this.libraryNav, this.mobileLibrary], this.currentDisplay === "games"],
            [[this.settingsButton, this.mobileSettings], this.currentDisplay === "settings"]
        ] as const) {
            for (const button of buttons) {
                if (active) button.setAttribute("aria-current", "page")
                else button.removeAttribute("aria-current")
            }
        }
    }
    private async testServerConnection() {
        const hostId = Number(this.chrome.selector.value)
        if (!Number.isFinite(hostId)) return
        this.chrome.setConnectionTestState("testing")
        try {
            const result = await testHostConnection(this.api, hostId)
            const format = (value: number) => new Intl.NumberFormat(getCurrentLanguage(), {
                minimumFractionDigits: 1,
                maximumFractionDigits: 1,
            }).format(value)
            this.chrome.setConnectionTestState("success", I.chrome.connectionResult(
                format(result.averageMs),
                format(result.minimumMs),
                format(result.jitterMs),
            ))
        } catch {
            this.chrome.setConnectionTestState("failure", I.chrome.connectionFailed)
        }
    }
    private async refreshUserRole() {
        this.user = await apiGetUser(this.api)
        this.chrome.setIdentity(this.user.name, this.user.role)

        if (this.topLineActions.contains(this.logoutButton)) {
            this.topLineActions.removeChild(this.logoutButton)
        }
        if (this.topLineActions.contains(this.loginButton)) {
            this.topLineActions.removeChild(this.loginButton)
        }
        if (this.topLineActions.contains(this.adminButton)) {
            this.topLineActions.removeChild(this.adminButton)
        }

        if (this.user.is_default_user) {
            this.topLineActions.appendChild(this.loginButton)
        } else {
            this.topLineActions.appendChild(this.logoutButton)
        }

        if (this.user.role == "Admin") {
            this.topLineActions.appendChild(this.adminButton)
            if (this.currentDisplay == "settings" && !this.actionElement.contains(this.saveRoleDefaultsButton)) {
                this.actionElement.appendChild(this.saveRoleDefaultsButton)
            }
        } else if (this.actionElement.contains(this.saveRoleDefaultsButton)) {
            this.actionElement.removeChild(this.saveRoleDefaultsButton)
        }
    }
    private async refreshUserPermissions() {
        const response = await apiGetRole(this.api, { id: null })
        this.role = response.role

        if (this.role.permissions.allow_add_hosts) {
            this.hostAddButton.disabled = false
        } else {
            this.hostAddButton.disabled = true
        }
    }
    private async refreshGameListActiveGame() {
        const gameList = this.gameList
        const hostId = gameList?.getHostId()
        if (hostId == null) {
            return
        }

        const host = this.hostList.getHost(hostId)

        let currentGame = null
        if (host != null) {
            currentGame = await host.getCurrentGame()
        } else {
            const host = await apiGetHost(this.api, { host_id: hostId })
            if (host.current_game != 0) {
                currentGame = host.current_game
            }
        }

        if (currentGame != null) {
            gameList?.setActiveGame(currentGame)
        } else {
            gameList?.setActiveGame(null)
        }
    }

    mount(parent: HTMLElement): void {
        parent.appendChild(this.divElement)
    }
    unmount(parent: HTMLElement): void {
        parent.removeChild(this.divElement)
    }
}
