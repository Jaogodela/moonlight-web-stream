import { Component } from "../component/index"
import { getCurrentLanguage, getTranslations } from "../i18n"
import { showNotification } from "./notification"
import { ListComponent } from "./list"

document.addEventListener("click", () => removeContextMenu())

export type ContextMenuElement = {
    name: string,
    callback(event: MouseEvent): void
    classes?: string[]
}

export type ContextMenuInit = {
    elements?: ContextMenuElement[]
}

let menuTrigger: HTMLElement | null = null
const contextMenuElement = document.getElementById("context-menu")
const contextMenuList = new ListComponent<ContextMenuElementComponent>([], {
    listClasses: ["context-menu-list"]
})

export function setContextMenu(event: MouseEvent, init?: ContextMenuInit) {
    const i = getTranslations(getCurrentLanguage()).common
    event.preventDefault()
    event.stopPropagation()

    if (contextMenuElement == null) {
        showNotification(i.missingContextMenu)
        return;
    }

    menuTrigger = document.activeElement instanceof HTMLElement ? document.activeElement : null
    contextMenuElement.setAttribute("role", "menu")
    contextMenuElement.setAttribute("aria-label", getTranslations(getCurrentLanguage()).index.appTitle)
    contextMenuElement.classList.add("gs-popover")
    contextMenuElement.style.setProperty("left", `${event.clientX}px`)
    contextMenuElement.style.setProperty("top", `${event.clientY}px`)

    contextMenuList.clear()

    for (const element of init?.elements ?? []) {
        contextMenuList.append(new ContextMenuElementComponent(element))
    }

    contextMenuList.mount(contextMenuElement)
    contextMenuElement.querySelector("ul")?.setAttribute("role", "none")
    contextMenuElement.classList.remove("context-menu-disabled")
    contextMenuElement.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
    const rect = contextMenuElement.getBoundingClientRect()
    contextMenuElement.style.left = `${Math.max(8, Math.min(event.clientX, window.innerWidth - rect.width - 8))}px`
    contextMenuElement.style.top = `${Math.max(8, Math.min(event.clientY, window.innerHeight - rect.height - 8))}px`
}

contextMenuElement?.addEventListener("keydown", event => {
    const items = Array.from(contextMenuElement.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'))
    const index = items.indexOf(document.activeElement as HTMLButtonElement)
    let next: number | undefined
    if (event.key === "ArrowDown") next = (index + 1) % items.length
    if (event.key === "ArrowUp") next = (index - 1 + items.length) % items.length
    if (event.key === "Home") next = 0
    if (event.key === "End") next = items.length - 1
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); removeContextMenu(true) }
    if (event.key === "Tab") removeContextMenu(true)
    if (next !== undefined) { event.preventDefault(); items[next]?.focus() }
})

export function removeContextMenu(restoreFocus = false) {
    if (contextMenuElement == null) return

    contextMenuElement.classList.add("context-menu-disabled")
    if (restoreFocus) menuTrigger?.focus()
}

class ContextMenuElementComponent implements Component {
    private nameElement: HTMLButtonElement = document.createElement("button")

    constructor(element: ContextMenuElement) {
        this.nameElement.type = "button"
        this.nameElement.setAttribute("role", "menuitem")
        this.nameElement.innerText = element.name

        this.nameElement.classList.add("context-menu-element")

        this.nameElement.addEventListener("click", event => {
            removeContextMenu(true)
            element.callback(event)
        })

        // Also register right click for certain devices which make left click hard: https://github.com/MrCreativ3001/moonlight-web-stream/issues/55
        this.nameElement.addEventListener("contextmenu", event => {
            event.preventDefault()
            removeContextMenu(true)

            element.callback(event)
        }, { passive: false })

        if (element.classes) {
            this.nameElement.classList.add(...element.classes)
        }
    }

    mount(parent: Element): void {
        parent.setAttribute("role", "none")
        parent.appendChild(this.nameElement)
    }
    unmount(parent: Element): void {
        parent.removeChild(this.nameElement)
    }
}
