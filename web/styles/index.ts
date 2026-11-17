import tokens from "./tokens.css";
import fonts from "./fonts.css";
import "./theme";
import { globalDefaultSettings, getLocalStreamSettings } from "../component/settings_menu"

// Legacy defaults share Gaspar; Moonlight remains explicitly selectable.
import gasparUrl from "./gaspar.css";
import moonlightUrl from "./moonlight.css";

export type PageStyle = "gaspar" | "standard" | "old" | "moonlight";

let currentStyle: PageStyle | null = null

const styleMap: Record<PageStyle, LazyStyleModule> = {
    gaspar: gasparUrl,
    standard: gasparUrl,
    old: gasparUrl,
    moonlight: moonlightUrl
};

export function setStyle(style: PageStyle) {
    if (style === "old" || style === "standard") style = "gaspar"
    if (currentStyle === style) return
    if (currentStyle) {
        styleMap[currentStyle].unuse()
    }

    styleMap[style].use()
    currentStyle = style
}

export function getStyle(): PageStyle {
    return currentStyle as PageStyle
}

tokens.use()
fonts.use()

const settings = getLocalStreamSettings(globalDefaultSettings())

setStyle(settings.pageStyle)
