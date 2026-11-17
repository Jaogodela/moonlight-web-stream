import { Component } from "../index"
import { showNotification } from "../notification"
import { getCurrentLanguage, getTranslations } from "../../i18n"
import { FormModal } from "./form"

export interface Modal<Output> extends Component {
    onFinish(abort: AbortSignal): Promise<Output>
}

let modalAbort: AbortController | null = null
const modalBackground = document.getElementById("modal-overlay")
const modalParent = document.getElementById("modal-parent")
let modalTrigger: HTMLElement | null = null
let previousModal: Modal<unknown> | null = null

// Don't allow context menu event through this background
modalBackground?.addEventListener("contextmenu", event => {
    event.stopImmediatePropagation()
})

export function getModalBackground(): HTMLElement | null {
    return modalBackground
}

export async function showModal<Output>(modal: Modal<Output> | null): Promise<Output | null> {
    const i = getTranslations(getCurrentLanguage()).common
    if (modalParent == null) {
        showNotification(i.missingModalParent)
        return null
    }
    if (modalBackground == null) {
        showNotification(i.missingModalOverlay)
    }

    // Preserve the original trigger across a replacement dialog.
    if (!modalAbort) modalTrigger = document.activeElement instanceof HTMLElement ? document.activeElement : null
    modalAbort?.abort()
    if (previousModal) previousModal.unmount(modalParent)
    previousModal = modal
    modalAbort = null
    if (!modal) {
        modalBackground?.classList.add("modal-disabled")
        modalTrigger?.focus()
        modalTrigger = null
        return null
    }

    const abortController = new AbortController()
    modalAbort = abortController
    modal.mount(modalParent)
    modalBackground?.classList.remove("modal-disabled")
    modalParent.tabIndex = -1
    modalParent.setAttribute("role", "dialog")
    modalParent.setAttribute("aria-modal", "true")
    const heading = modalParent.querySelector<HTMLElement>("h1, h2, h3, h4, h5, h6")
    modalParent.removeAttribute("aria-labelledby")
    modalParent.removeAttribute("aria-label")
    if (heading) {
        if (!heading.id) heading.id = "gs-dialog-title"
        modalParent.setAttribute("aria-labelledby", heading.id)
    } else {
        modalParent.setAttribute("aria-label", modalParent.querySelector("p")?.textContent || getTranslations(getCurrentLanguage()).modal.ok)
    }
    const focusable = () => Array.from(modalParent.querySelectorAll<HTMLElement>(
        'input:not([type="hidden"]), select, textarea, button, a[href], [tabindex]'
    )).filter(el => !el.matches(":disabled, [tabindex='-1']") && !el.closest("[hidden], [inert]") && el.getClientRects().length > 0)
    const initial = focusable().find(el => el.matches("input, select, textarea"))
        ?? focusable().find(el => el.matches(".gs-btn--primary")) ?? focusable()[0] ?? modalParent
    initial.focus()
    document.addEventListener("focusin", event => {
        if (!modalParent.contains(event.target as Node)) (focusable()[0] ?? modalParent).focus()
    }, { signal: abortController.signal })
    document.addEventListener("keydown", event => {
        if (event.key === "Escape") {
            const cancel = modalParent.querySelector<HTMLButtonElement>('button[data-modal-cancel]')
            if (cancel) { event.preventDefault(); event.stopPropagation(); cancel.click() }
        } else if (event.key === "Tab") {
            const controls = focusable()
            const first = controls[0] ?? modalParent
            const last = controls[controls.length - 1] ?? modalParent
            if (!controls.length || (event.shiftKey ? document.activeElement === first || document.activeElement === modalParent : document.activeElement === last || document.activeElement === modalParent)) {
                event.preventDefault()
                ;(event.shiftKey ? last : first).focus()
            }
        }
    }, { signal: abortController.signal })

    try {
        return await Promise.race([
            modal.onFinish(abortController.signal),
            new Promise<null>(resolve => abortController.signal.addEventListener("abort", () => resolve(null), { once: true }))
        ])
    } finally {
        // A replaced modal must never hide or steal focus from the new one.
        if (modalAbort === abortController) {
            modalBackground?.classList.add("modal-disabled")
            modalAbort = null
            abortController.abort()
            modalTrigger?.focus()
            modalTrigger = null
        }
        abortController.abort()
    }
}

/// --- Helper Modals

// TODO: remove this
export async function showPrompt(prompt: string, promptInit?: PromptInit): Promise<string | null> {
    const modal = new PromptModal(prompt, promptInit)

    return await showModal(modal)
}

type PromptInit = {
    defaultValue?: string,
    name?: string,
    type?: "text" | "password",
}

class PromptModal extends FormModal<string> {
    private message: HTMLElement = document.createElement("p")
    private textInput: HTMLInputElement = document.createElement("input")

    constructor(prompt: string, init?: PromptInit) {
        super()

        this.message.innerText = prompt

        if (init?.type) {
            this.textInput.type = init?.type
        }
        if (init?.defaultValue) {
            this.textInput.defaultValue = init?.defaultValue
        }
        if (init?.name) {
            this.textInput.name = init?.name
        }
    }

    reset(): void {
        this.textInput.value = ""
    }
    submit(): string | null {
        return this.textInput.value
    }

    mountForm(form: HTMLFormElement): void {
        form.appendChild(this.message)
        form.appendChild(this.textInput)
    }
}

type MessageInit = {
    signal?: AbortSignal
}

export async function showMessage(message: string, init?: MessageInit) {
    const modal = new MessageModal(message, init)

    await showModal(modal)
}

class MessageModal implements Component, Modal<void> {

    private signal?: AbortSignal
    private textElement: HTMLElement = document.createElement("p")
    private okButton: HTMLButtonElement = document.createElement("button")

    constructor(message: string, init?: MessageInit) {
        const i = getTranslations(getCurrentLanguage()).modal
        this.textElement.innerText = message

        this.okButton.innerText = i.ok
        this.okButton.classList.add("gs-btn", "gs-btn--primary", "gs-message-ok")

        this.signal = init?.signal
    }

    mount(parent: Element): void {
        parent.appendChild(this.textElement)
        parent.appendChild(this.okButton)
    }
    unmount(parent: Element): void {
        parent.removeChild(this.textElement)
        parent.removeChild(this.okButton)
    }

    onFinish(abort: AbortSignal): Promise<void> {
        return new Promise((resolve, reject) => {
            let customController: AbortController | null = null

            if (this.signal) {
                customController = new AbortController()
                this.signal.addEventListener("abort", () => {
                    resolve()
                    customController?.abort()
                }, { once: true, signal: customController.signal })
            }

            this.okButton.addEventListener("click", () => {
                resolve()
                customController?.abort()
            }, { signal: customController?.signal })

            if (customController) {
                abort.addEventListener("abort", customController.abort.bind(customController))
            }
        })
    }
}
