import { Component } from "./index"
import { icon } from "./icon"
import { getCurrentLanguage, getTranslations } from "../i18n"
import { ListComponent } from "./list"

type NotificationLevel = "error" | "warn" | "info"

const ERROR_REMOVAL_TIME_MS = 10000

const notificationListElement = document.getElementById("notification-list")
const notificationListComponent = new ListComponent<NotificationComponent>([], { listClasses: ["notification-list"], elementLiClasses: ["notification-element"] })
if (notificationListElement) {
    notificationListComponent.mount(notificationListElement)
}

let alertedNotificationListNotFound = false

export function showNotification(message: string, level: NotificationLevel = "error", errorObject?: any) {
    console.error(message, errorObject)

    if (!notificationListElement) {
        if (!alertedNotificationListNotFound) {
            alert("couldn't find the notification element")
            alertedNotificationListNotFound = true
        }
        alert(message)
        return;
    }

    const error = new NotificationComponent(message, level)

    notificationListComponent.append(error)

    setTimeout(() => {
        notificationListComponent.removeValue(error)
    }, ERROR_REMOVAL_TIME_MS)
}

function handleError(event: ErrorEvent) {
    showNotification(`${event.error}`, "error", event)
}
function handleRejection(event: PromiseRejectionEvent) {
    showNotification(`${event.reason}`, "error", event)
}

window.addEventListener("error", handleError)
window.addEventListener("unhandledrejection", handleRejection)

class NotificationComponent implements Component {
    private card = document.createElement("div")

    constructor(message: string, level: NotificationLevel) {
        this.card.classList.add("gs-toast", `gs-toast--${level}`)
        this.card.setAttribute("role", level === "error" ? "alert" : "status")
        this.card.setAttribute("aria-atomic", "true")
        const messageElement = document.createElement("p")
        messageElement.textContent = message
        messageElement.classList.add("notification-message")
        const close = document.createElement("button")
        close.type = "button"
        close.classList.add("gs-icon-btn", "gs-toast__close")
        close.setAttribute("aria-label", getTranslations(getCurrentLanguage()).stream.close)
        close.appendChild(icon("x"))
        close.addEventListener("click", () => notificationListComponent.removeValue(this))
        this.card.addEventListener("keydown", event => {
            if (event.key === "Escape") {
                event.stopPropagation()
                notificationListComponent.removeValue(this)
            }
        })
        this.card.append(icon(level === "error" ? "circle-alert" : level === "warn" ? "triangle-alert" : "info", { size: 18 }), messageElement, close)
    }

    mount(parent: Element): void { parent.appendChild(this.card) }
    unmount(parent: Element): void { parent.removeChild(this.card) }
}
