import { Component, ComponentEvent } from "../index"
import { Api, apiGetAppImage, apiHostCancel } from "../../api"
import { App } from "../../api_bindings"
import { getCurrentLanguage, getTranslations } from "../../i18n"
import { setContextMenu } from "../context_menu"
import { showMessage } from "../modal/index"
import { APP_NO_IMAGE } from "../../resources/index"
import { icon } from "../icon"
import { buildUrl } from "../../config_"

// Fetch the bundled default once; compare bytes, never display it as game art.
let defaultImageBytes: Promise<Uint8Array | null> | undefined
function getDefaultImageBytes() {
    return defaultImageBytes ??= fetch(APP_NO_IMAGE)
        .then(response => response.ok ? response.arrayBuffer() : null)
        .then(buffer => buffer ? new Uint8Array(buffer) : null)
        .catch(() => null)
}

export type GameCache = App & { activeApp: number | null }

export type GameEventListener = (event: ComponentEvent<Game>) => void

export class Game implements Component {
    private api: Api

    private hostId: number
    private appId: number

    private mounted: number = 0
    private divElement = document.createElement("button")
    private coverElement = document.createElement("span")
    private titleElement = document.createElement("p")
    private badgeElement = document.createElement("span")
    private initialsElement = document.createElement("span")
    private fallbackElement = document.createElement("span")
    private imageFailed = false
    private imageRequest = 0

    private imageBlob: Blob | null = null
    private imageBlobUrl: string | null = null
    private imageElement: HTMLImageElement = document.createElement("img")

    private cache: GameCache

    constructor(api: Api, hostId: number, appId: number, cache: GameCache) {
        this.api = api

        this.hostId = hostId
        this.appId = appId

        this.cache = cache

        this.divElement.type = "button"
        this.divElement.className = "app gs-game"
        this.coverElement.className = "gs-game__cover gs-skeleton"
        this.imageElement.className = "app-image"
        this.imageElement.alt = ""
        this.imageElement.hidden = true
        this.imageElement.addEventListener("load", () => {
            if (!this.imageBlobUrl || this.mounted <= 0 || this.imageFailed) return
            this.imageElement.hidden = false
            this.imageElement.classList.add("app-image-loaded")
            this.coverElement.classList.remove("gs-skeleton")
        })
        this.imageElement.addEventListener("error", () => this.showFallback())
        this.fallbackElement.className = "gs-game__fallback"
        this.fallbackElement.hidden = true
        this.fallbackElement.setAttribute("aria-hidden", "true")
        this.fallbackElement.append(icon("gamepad-2", { size: 32 }), this.initialsElement)
        this.badgeElement.className = "gs-game__badge"
        const play = document.createElement("span")
        play.className = "gs-game__play"
        play.setAttribute("aria-hidden", "true")
        play.append(icon("play"))
        this.titleElement.className = "gs-game__title"
        this.coverElement.append(this.imageElement, this.fallbackElement, this.badgeElement, play)
        this.divElement.append(this.coverElement, this.titleElement)
        this.divElement.addEventListener("click", this.onClick.bind(this))
        this.divElement.addEventListener("contextmenu", this.onContextMenu.bind(this))
        this.divElement.addEventListener("keydown", event => {
            if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
                event.preventDefault()
                const rect = this.divElement.getBoundingClientRect()
                this.onContextMenu(new MouseEvent("contextmenu", {
                    clientX: rect.left + rect.width / 2,
                    clientY: rect.top + rect.height / 2
                }))
            }
        })
        void this.forceLoadImage(false)

        this.updateCache(cache)
    }

    async forceLoadImage(forceServerRefresh: boolean) {
        const request = ++this.imageRequest
        try {
            const blob = await apiGetAppImage(this.api, {
                host_id: this.hostId,
                app_id: this.appId,
                force_refresh: forceServerRefresh
            })
            const [bytes, defaultBytes] = await Promise.all([
                blob.arrayBuffer().then(buffer => new Uint8Array(buffer)), getDefaultImageBytes()
            ])
            if (request !== this.imageRequest) return
            if (!bytes.length || (defaultBytes && bytes.length === defaultBytes.length &&
                bytes.every((value, index) => value === defaultBytes[index]))) {
                this.showFallback()
                return
            }
            this.releaseImage()
            this.imageFailed = false
            this.imageBlob = blob
            this.coverElement.classList.remove("gs-game__cover--fallback")
            this.coverElement.classList.add("gs-skeleton")
            this.fallbackElement.hidden = true
            this.updateImage()
        } catch {
            if (request === this.imageRequest) this.showFallback()
        }
    }

    private releaseImage() {
        this.imageElement.hidden = true
        this.imageElement.classList.remove("app-image-loaded")
        this.imageElement.removeAttribute("src")
        if (this.imageBlobUrl) URL.revokeObjectURL(this.imageBlobUrl)
        this.imageBlobUrl = null
    }

    private showFallback() {
        this.releaseImage()
        this.imageBlob = null
        this.imageFailed = true
        this.coverElement.classList.remove("gs-skeleton")
        this.coverElement.classList.add("gs-game__cover--fallback")
        this.fallbackElement.hidden = false
    }

    private updateImage() {
        if (this.mounted <= 0) {
            this.releaseImage()
        } else if (this.imageBlob && !this.imageBlobUrl && !this.imageFailed) {
            this.coverElement.classList.add("gs-skeleton")
            this.imageBlobUrl = URL.createObjectURL(this.imageBlob)
            this.imageElement.src = this.imageBlobUrl
        }
    }

    updateCache(cache: GameCache) {
        this.cache = cache
        const i = getTranslations(getCurrentLanguage()).game
        this.titleElement.textContent = cache.title
        this.initialsElement.textContent = cache.title.trim().split(/\s+/).slice(0, 2)
            .map((word: string) => Array.from(word)[0] ?? "").join("").toLocaleUpperCase().slice(0, 2)
        this.badgeElement.textContent = i.running
        this.badgeElement.hidden = !this.isActive()
        this.divElement.setAttribute("aria-label", this.isActive() ? i.runningLabel(cache.title) : i.playLabel(cache.title))

        this.divElement.classList.remove("app-inactive")
        this.divElement.classList.remove("app-active")

        if (this.isActive()) {
            this.divElement.classList.add("app-active")
        } else if (this.cache.activeApp != null) {
            this.divElement.classList.add("app-inactive")
        }
    }

    private async onClick(event: MouseEvent) {
        const i = getTranslations(getCurrentLanguage()).game
        if (this.cache.activeApp != null) {
            const elements = []

            if (this.isActive()) {
                elements.push({
                    name: i.resumeSession,
                    classes: ["gs-game-menu--play"],
                    callback: async () => {
                        this.startStream()

                        const event = new ComponentEvent("ml-gamereload", this)
                        this.divElement.dispatchEvent(event)
                    }
                })
            }

            elements.push({
                name: i.stopCurrentSession,
                classes: ["gs-game-menu--stop"],
                callback: async () => {
                    const response = await apiHostCancel(this.api, { host_id: this.hostId })
                    if (!response.success) {
                        await showMessage(i.failedToCloseApp)
                    }

                    const event = new ComponentEvent("ml-gamereload", this)
                    this.divElement.dispatchEvent(event)
                }
            })

            setContextMenu(event, {
                elements
            })
        } else {
            this.startStream()

            await new Promise(r => window.setTimeout(r, 6000))

            const event = new ComponentEvent("ml-gamereload", this)
            this.divElement.dispatchEvent(event)
        }
    }
    private startStream() {
        let query = new URLSearchParams({
            hostId: this.getHostId(),
            appId: this.getAppId(),
        } as any)

        if (window.matchMedia('(display-mode: standalone)').matches) {
            // If we're in a pwa: open in the current tab
            // If we don't do this we might get a url bar at the top
            window.location.href = buildUrl(`/stream.html?${query}`)
        } else {
            window.open(buildUrl(`/stream.html?${query}`), "_blank")
        }
    }

    private onContextMenu(event: MouseEvent) {
        const i = getTranslations(getCurrentLanguage()).game
        const elements = []

        elements.push({
            name: i.showDetails,
            callback: this.showDetails.bind(this),
        })

        elements.push({
            name: i.open,
            callback: async () => {
                this.startStream()

                const event = new ComponentEvent("ml-gamereload", this)
                this.divElement.dispatchEvent(event)
            }
        })

        setContextMenu(event, {
            elements
        })
    }

    private async showDetails() {
        const app = this.cache
        const i = getTranslations(getCurrentLanguage()).game
        await showMessage(i.details(app))
    }

    private isActive(): boolean {
        return this.cache.activeApp == this.appId
    }

    addForceReloadListener(listener: GameEventListener) {
        this.divElement.addEventListener("ml-gamereload", listener as any)
    }
    removeForceReloadListener(listener: GameEventListener) {
        this.divElement.removeEventListener("ml-gamereload", listener as any)
    }

    getHostId(): number {
        return this.hostId
    }
    getAppId(): number {
        return this.appId
    }

    mount(parent: HTMLElement): void {
        this.mounted++
        this.updateImage()

        parent.appendChild(this.divElement)
    }
    unmount(parent: HTMLElement): void {

        parent.removeChild(this.divElement)

        this.mounted--
        this.updateImage()
    }
}
