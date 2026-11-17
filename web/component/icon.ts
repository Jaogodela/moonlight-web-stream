import {
    createElement, LogIn, CircleUserRound, LogOut, ShieldCheck, Monitor, MonitorCheck, MonitorOff, LockKeyhole, Plus, Gamepad2, LibraryBig, Play, Square, RotateCcw, Settings2, Sun, Moon, MonitorSmartphone, Activity, Maximize, Minimize, ArrowLeft, ChevronLeft, Save, Keyboard, MousePointer2, Lock, Command, DoorOpen, PanelLeftOpen, PanelLeftClose, EllipsisVertical, RefreshCw, Info, TriangleAlert, CircleAlert, CircleCheck, CircleHelp, Eye, EyeOff, FileKey, Users, KeyRound, Search, X
} from "lucide";

const ICONS = {
    "log-in": LogIn,
    "circle-user-round": CircleUserRound,
    "log-out": LogOut,
    "shield-check": ShieldCheck,
    "monitor": Monitor,
    "monitor-check": MonitorCheck,
    "monitor-off": MonitorOff,
    "lock-keyhole": LockKeyhole,
    "plus": Plus,
    "gamepad": Gamepad2,
    "gamepad-2": Gamepad2,
    "library-big": LibraryBig,
    "play": Play,
    "square": Square,
    "rotate-ccw": RotateCcw,
    "settings-2": Settings2,
    "sun": Sun,
    "moon": Moon,
    "monitor-smartphone": MonitorSmartphone,
    "activity": Activity,
    "maximize": Maximize,
    "minimize": Minimize,
    "arrow-left": ArrowLeft,
    "chevron-left": ChevronLeft,
    "save": Save,
    "keyboard": Keyboard,
    "mouse-pointer-2": MousePointer2,
    "lock": Lock,
    "command": Command,
    "door-open": DoorOpen,
    "panel-left-open": PanelLeftOpen,
    "panel-left-close": PanelLeftClose,
    "ellipsis-vertical": EllipsisVertical,
    "refresh-cw": RefreshCw,
    "info": Info,
    "triangle-alert": TriangleAlert,
    "circle-alert": CircleAlert,
    "circle-check": CircleCheck,
    "circle-help": CircleHelp,
    "eye": Eye,
    "eye-off": EyeOff,
    "file-key": FileKey,
    "users": Users,
    "key-round": KeyRound,
    "search": Search,
    "x": X,
} as const;

export type IconName = keyof typeof ICONS;

export function icon(name: IconName, opts?: { size?: number, label?: string }): SVGElement {
    const el = createElement(ICONS[name]);
    el.setAttribute("width", String(opts?.size ?? 20));
    el.setAttribute("height", String(opts?.size ?? 20));
    el.setAttribute("stroke-width", "1.75");
    el.classList.add("gs-icon");
    if (opts?.label) {
        el.setAttribute("role", "img");
        el.setAttribute("aria-label", opts.label);
    } else {
        el.setAttribute("aria-hidden", "true");
    }
    return el;
}
