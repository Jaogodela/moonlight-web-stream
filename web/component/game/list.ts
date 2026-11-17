import { getCurrentLanguage, getTranslations } from "../../i18n"
import { icon } from "../icon"
import { Api, apiGetApps } from "../../api"
import { App } from "../../api_bindings"
import { FetchListComponent } from "../fetch_list"
import { ComponentEvent } from "../index"
import { Game, GameCache, GameEventListener } from "./index"

export class GameList extends FetchListComponent<App, Game> {
    private loading = false
    private failed = false
    private countListener: ((count: number) => void) | null = null
    private api: Api

    private eventTarget = new EventTarget()

    private hostId: number
    private activeApp: number | null = null

    constructor(api: Api, hostId: number, cache: App[] | null) {
        super({
            listClasses: ["app-list", "gs-grid--games"],
            elementLiClasses: ["animated-list-element", "app-element"]
        })

        this.api = api

        this.hostId = hostId

        // Update cache
        if (cache != null) {
            this.updateCache(cache)
        } else {
            this.forceFetch()
        }
    }

    setActiveGame(appId: number | null) {
        this.activeApp = appId

        this.forceFetch()
    }

    setCountListener(listener: (count: number) => void) {
        this.countListener = listener
        listener(this.list.get().length)
    }

    override updateCache(cache: App[]) {
        super.updateCache(cache)
        this.countListener?.(cache.length)
        this.renderState()
    }

    async forceFetch() {
        if (this.loading) return
        this.loading = true
        this.failed = false
        this.setLoading(true)
        this.renderState()
        try {
            const apps = await apiGetApps(this.api, { host_id: this.hostId })
            this.updateCache(apps)
        } catch {
            this.failed = true
        } finally {
            this.loading = false
            this.setLoading(false)
            this.renderState()
        }
    }

    private renderState() {
        const i = getTranslations(getCurrentLanguage()).game
        const placeholders: HTMLLIElement[] = []
        if (this.loading && this.list.get().length === 0) {
            for (let index = 0; index < 10; index++) {
                const li = document.createElement("li")
                li.className = "gs-game-placeholder"
                li.setAttribute("aria-hidden", "true")
                const cover = document.createElement("div")
                cover.className = "gs-game__cover gs-skeleton"
                const title = document.createElement("div")
                title.className = "gs-game__title-skeleton gs-skeleton"
                li.append(cover, title)
                placeholders.push(li)
            }
        } else if (this.failed || this.list.get().length === 0) {
            const li = document.createElement("li")
            li.className = `gs-empty${this.failed ? " gs-empty--error" : ""}`
            li.setAttribute("role", "status")
            const symbol = document.createElement("span")
            symbol.className = "gs-empty__icon"
            symbol.append(icon(this.failed ? "circle-alert" : "library-big"))
            const title = document.createElement("h2")
            title.textContent = this.failed ? i.libraryError : i.libraryEmpty
            li.append(symbol, title)
            if (!this.failed) {
                const description = document.createElement("p")
                description.textContent = i.libraryEmptyDescription
                li.append(description)
            }
            const retry = document.createElement("button")
            retry.type = "button"
            retry.className = "gs-btn gs-btn--secondary"
            retry.append(icon("refresh-cw"), document.createTextNode(this.failed ? i.retry : getTranslations(getCurrentLanguage()).index.reload))
            retry.addEventListener("click", () => { void this.forceFetch() })
            li.append(retry)
            placeholders.push(li)
        }
        this.list.setPlaceholder(placeholders)
    }
    private createCache(data: App): GameCache {
        const cache = data as GameCache
        cache.activeApp = this.activeApp
        return cache
    }

    protected updateComponentData(component: Game, data: App): void {
        const cache = this.createCache(data)

        component.updateCache(cache)
    }
    protected getComponentDataId(component: Game): number {
        return component.getAppId()
    }
    protected getDataId(data: App): number {
        return data.app_id
    }
    protected insertList(dataId: number, data: App): void {
        const cache = this.createCache(data)

        const game = new Game(this.api, this.hostId, dataId, cache)
        game.addForceReloadListener(this.onForceReload.bind(this))

        this.list.append(game)
    }

    private onForceReload(event: ComponentEvent<Game>) {
        this.eventTarget.dispatchEvent(new ComponentEvent("ml-gamereload", event.component))
    }

    addForceReloadListener(listener: GameEventListener) {
        this.eventTarget.addEventListener("ml-gamereload", listener as any)
    }
    removeForceReloadListener(listener: GameEventListener) {
        this.eventTarget.removeEventListener("ml-gamereload", listener as any)
    }

    getHostId(): number {
        return this.hostId
    }

    mount(parent: HTMLElement): void {
        this.list.mount(parent)
    }
    unmount(parent: HTMLElement): void {
        this.list.unmount(parent)
    }
}
