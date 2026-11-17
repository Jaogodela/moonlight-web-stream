import { icon } from "../icon"
import { ComponentEvent } from "../index"
import { getCurrentLanguage, getTranslations } from "../../i18n"
import { InputComponent } from "../input"
import { FormModal } from "./form"

export type UserAuth = {
    name: string,
    password: string
}

export class ApiUserPasswordPrompt extends FormModal<UserAuth> {

    readonly appearance = "auth" as const

    private text: HTMLElement = document.createElement("h2")
    private passwordInput?: HTMLInputElement
    private passwordToggle = document.createElement("button")

    private name: InputComponent
    private password: InputComponent
    private passwordFile: InputComponent

    constructor() {
        super()
        const i = getTranslations(getCurrentLanguage()).modal

        this.text.innerText = i.login
        this.submitButton.innerText = i.login
        this.submitButton.classList.add("gs-btn--lg")
        this.cancelButton.classList.replace("gs-btn--secondary", "gs-btn--ghost")
        const spinner = document.createElement("span")
        spinner.className = "gs-auth-spinner"
        spinner.setAttribute("aria-hidden", "true")
        this.submitButton.prepend(spinner)

        this.name = new InputComponent("ml-api-name", "text", i.username, {
            formRequired: true
        })

        this.password = new InputComponent("ml-api-password", "password", i.password, {
            formRequired: true
        })

        this.passwordFile = new InputComponent("ml-api-password-file", "file", i.passwordAsFile, { accept: ".txt" })
        this.passwordFile.addChangeListener(this.setFilePassword.bind(this))
    }

    private async setFilePassword(event: ComponentEvent<InputComponent>) {
        const files = event.component.getFiles()
        if (!files) {
            return
        }

        const file = files[0]
        if (!file) {
            return
        }
        const text = await file.text()

        // Remove carriage return and new line
        const password = text
            .replace(/\r/g, "")
            .replace(/\n/g, "")

        this.password.setValue(password)
    }

    reset(): void {
        if (this.passwordInput) this.passwordInput.type = "password"
        this.updatePasswordToggle()
        this.name.reset()
        this.password.reset()
        this.passwordFile.reset()
    }
    submit(): UserAuth | null {
        const name = this.name.getValue()
        const password = this.password.getValue()

        if (name && password) {
            this.submitButton.setAttribute("aria-busy", "true")
            return { name, password }
        } else {
            return null
        }
    }

    onFinish(abort: AbortSignal): Promise<UserAuth | null> {
        const abortController = new AbortController()
        abort.addEventListener("abort", abortController.abort.bind(abortController))

        return new Promise((resolve, reject) => {
            super.onFinish(abortController.signal).then((data) => {
                abortController.abort()
                resolve(data)
            }, (data) => {
                abortController.abort()
                reject(data)
            })
        })
    }

    private updatePasswordToggle(): void {
        const visible = this.passwordInput?.type === "text"
        const i = getTranslations(getCurrentLanguage()).modal
        this.passwordToggle.setAttribute("aria-pressed", String(visible))
        this.passwordToggle.setAttribute("aria-label", visible ? i.hidePassword : i.showPassword)
        this.passwordToggle.replaceChildren(icon(visible ? "eye-off" : "eye"))
    }

    mountForm(form: HTMLFormElement): void {
        const i = getTranslations(getCurrentLanguage()).modal
        form.classList.add("gs-auth-form")
        const brand = document.createElement("div")
        brand.className = "gs-auth-wordmark"
        brand.textContent = "gaspar"
        const pixel = document.createElement("span")
        pixel.setAttribute("aria-hidden", "true")
        brand.appendChild(pixel)
        const subtitle = document.createElement("p")
        subtitle.className = "gs-auth-subtitle"
        subtitle.textContent = i.loginSubtitle
        form.append(brand, this.text, subtitle)

        this.name.mount(form)
        form.querySelector<HTMLInputElement>("#ml-api-name")!.autocomplete = "username"
        this.password.mount(form)
        this.passwordInput = form.querySelector<HTMLInputElement>("#ml-api-password")!
        this.passwordInput.autocomplete = "current-password"
        const passwordControl = document.createElement("div")
        passwordControl.className = "gs-auth-password"
        this.passwordInput.replaceWith(passwordControl)
        this.passwordToggle.type = "button"
        this.passwordToggle.className = "gs-icon-btn"
        this.passwordToggle.setAttribute("aria-controls", this.passwordInput.id)
        this.updatePasswordToggle()
        this.passwordToggle.addEventListener("click", () => {
            this.passwordInput!.type = this.passwordInput!.type === "password" ? "text" : "password"
            this.updatePasswordToggle()
        })
        passwordControl.append(this.passwordInput, this.passwordToggle)

        const fileContainer = document.createElement("div")
        fileContainer.hidden = true
        this.passwordFile.mount(fileContainer)
        const fileInput = fileContainer.querySelector<HTMLInputElement>('input[type="file"]')!
        fileInput.tabIndex = -1
        const useFile = document.createElement("button")
        useFile.type = "button"
        useFile.className = "gs-auth-file gs-btn--ghost"
        useFile.append(icon("file-key", { size: 16 }), document.createTextNode(i.usePasswordFile))
        useFile.addEventListener("click", () => fileInput.click())
        form.append(fileContainer, useFile)
    }
}
