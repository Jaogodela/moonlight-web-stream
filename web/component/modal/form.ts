import { Component } from "../index"
import { getCurrentLanguage, getTranslations } from "../../i18n"
import { Modal } from "./index"

export abstract class FormModal<Output> implements Component, Modal<Output | null> {

    private formElement: HTMLFormElement = document.createElement("form")
    private mounted: boolean = false
    protected submitButton: HTMLButtonElement = document.createElement("button")
    protected cancelButton: HTMLButtonElement = document.createElement("button")

    readonly appearance?: "auth"

    constructor() {
        const i = getTranslations(getCurrentLanguage()).modal
        this.submitButton.classList.add("gs-btn", "gs-btn--primary")
        this.cancelButton.classList.add("gs-btn", "gs-btn--secondary")
        this.cancelButton.type = "button"
        this.cancelButton.dataset.modalCancel = "true"
        this.submitButton.type = "submit"
        this.submitButton.innerText = i.ok

        this.cancelButton.innerText = i.cancel

        this.formElement.addEventListener("submit", (event) => event.preventDefault())
    }

    abstract reset(): void
    abstract submit(): Output | null

    abstract mountForm(form: HTMLFormElement): void

    mount(parent: Element): void {
        if (!this.mounted) {
            this.mountForm(this.formElement)
            const actions = document.createElement("div")
            actions.classList.add("gs-form__actions")
            actions.append(this.submitButton, this.cancelButton)
            this.formElement.appendChild(actions)
            this.mounted = true
        }

        this.submitButton.removeAttribute("aria-busy")
        this.reset()

        parent.appendChild(this.formElement)
    }
    unmount(parent: Element): void {
        parent.removeChild(this.formElement)
    }

    onFinish(signal: AbortSignal): Promise<Output | null> {
        const abortController = new AbortController()
        signal.addEventListener("abort", abortController.abort.bind(abortController))

        return new Promise((resolve, reject) => {
            this.formElement.addEventListener("submit", event => {
                const output = this.submit()

                if (output == null) {
                    return
                }

                abortController.abort()
                resolve(output)
            }, { signal: abortController.signal })

            this.cancelButton.addEventListener("click", event => {
                event.preventDefault()

                abortController.abort()
                resolve(null)
            }, { signal: abortController.signal })
        })
    }
}
