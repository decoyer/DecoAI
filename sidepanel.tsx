import { Icon } from "@iconify/react"
import { useEffect, useMemo, useState, type ButtonHTMLAttributes, type ReactNode } from "react"

import { useStorage } from "@plasmohq/storage/hook"

import {
  DEFAULT_MODEL_ENABLED,
  LOADING_OVERLAY_STYLE,
  MODEL_ENABLED_STORAGE_KEY,
  SCREENSHOT_ATTACH_MESSAGE,
  SIDE_PANEL_STATUS_MESSAGE,
  SIDE_PANEL_THEME_MESSAGE,
  type ModelEnabledMap,
  type SidePanelStatusMessage,
  type SidePanelStatusResponse
} from "./utils"

type ModelKey = keyof ModelEnabledMap
type TooltipButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string
  children: ReactNode
}

type AiSite = {
  key: ModelKey
  label: string
  url: string
  icon: string
}

const t = (key: string) => chrome.i18n.getMessage(key)

const AI_SITES: AiSite[] = [
  {
    key: "chatgpt",
    label: "ChatGPT",
    url: "https://chatgpt.com/",
    icon: "bi:openai"
  },
  {
    key: "gemini",
    label: "Gemini",
    url: "https://gemini.google.com/app",
    icon: "vscode-icons:file-type-gemini"
  },
  {
    key: "claude",
    label: "Claude",
    url: "https://claude.ai/new",
    icon: "logos:claude-icon"
  },
  {
    key: "grok",
    label: "Grok",
    url: "https://grok.com/",
    icon: "selfhst:grok-light"
  }
]

const getInitialSite = (sites: AiSite[]) => {
  const params = new URLSearchParams(window.location.search)
  const requested = params.get("model")
  return sites.find((site) => site.key === requested)?.key || sites[0]?.key
}

function TooltipButton({ label, children, ...buttonProps }: TooltipButtonProps) {
  return (
    <span className="tooltip-action">
      <button {...buttonProps}>{children}</button>
      <span className="tooltip" role="tooltip">{label}</span>
    </span>
  )
}

function SidePanel() {
  const [modelEnabled] = useStorage<ModelEnabledMap>(MODEL_ENABLED_STORAGE_KEY, DEFAULT_MODEL_ENABLED)
  const enabledSites = useMemo(
    () => AI_SITES.filter((site) => modelEnabled?.[site.key] !== false),
    [modelEnabled]
  )
  const [activeKey, setActiveKey] = useState<ModelKey>(() => getInitialSite(AI_SITES))
  const [visited, setVisited] = useState<Set<ModelKey>>(() => new Set([activeKey]))
  const [loadingSites, setLoadingSites] = useState<Partial<Record<ModelKey, boolean>>>({ [activeKey]: true })
  const [reloadKeys, setReloadKeys] = useState<Partial<Record<ModelKey, number>>>({})
  const activeSite = enabledSites.find((site) => site.key === activeKey) || enabledSites[0]

  useEffect(() => {
    let sidePanelWindowId: number | undefined

    void chrome.windows.getCurrent().then((currentWindow) => {
      sidePanelWindowId = currentWindow.id
    })

    const onMessage = (
      message: SidePanelStatusMessage,
      _sender: chrome.runtime.MessageSender,
      sendResponse: (response: SidePanelStatusResponse) => void
    ) => {
      if (message.type !== SIDE_PANEL_STATUS_MESSAGE || message.windowId !== sidePanelWindowId) return
      sendResponse({ open: true })
    }

    chrome.runtime.onMessage.addListener(onMessage)
    return () => chrome.runtime.onMessage.removeListener(onMessage)
  }, [])

  useEffect(() => {
    if (!activeSite || activeSite.key === activeKey) return
    setActiveKey(activeSite.key)
  }, [activeKey, activeSite])

  useEffect(() => {
    if (!activeSite) return
    setVisited((current) => {
      if (current.has(activeSite.key)) return current
      const next = new Set(current)
      next.add(activeSite.key)
      return next
    })
    setLoadingSites((current) => {
      if (activeSite.key in current) return current
      return { ...current, [activeSite.key]: true }
    })
  }, [activeSite])

  const reloadActiveSite = () => {
    if (!activeSite) return
    setLoadingSites((current) => ({ ...current, [activeSite.key]: true }))
    setReloadKeys((current) => ({
      ...current,
      [activeSite.key]: (current[activeSite.key] || 0) + 1
    }))
  }

  const openActiveSiteInTab = () => {
    if (activeSite) void chrome.tabs.create({ url: activeSite.url })
  }

  const captureAndAttachScreenshot = async () => {
    const activeFrame = document.querySelector<HTMLIFrameElement>(".ai-frame.active")
    const currentWindow = await chrome.windows.getCurrent()
    if (!activeSite || !activeFrame?.contentWindow || currentWindow.id == null) return

    const dataUrl = await chrome.tabs.captureVisibleTab(currentWindow.id, { format: "png" })
    activeFrame.contentWindow.postMessage(
      {
        type: SCREENSHOT_ATTACH_MESSAGE,
        dataUrl
      },
      new URL(activeSite.url).origin
    )
  }

  return (
    <main className="shell">
      <style>{`
        :root {
          color-scheme: dark;
          font-family: Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          background: #333;
        }
        * { box-sizing: border-box; }
        html, body, #__plasmo { width: 100%; height: 100%; margin: 0; overflow: hidden; }
        button { font: inherit; }
        .shell {
          width: 100%;
          height: 100%;
          display: grid;
          grid-template-rows: auto minmax(0, 1fr);
          isolation: isolate;
          color: #fff;
          background: #333;
        }
        .toolbar {
          z-index: 2;
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 4px 8px;
          background: #333;
        }
        .toolbar-group {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 2px;
          background: #000;
          border-radius: 999px;
        }
        .toolbar-button {
          width: 32px;
          height: 32px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 4px;
          border: 0;
          border-radius: 999px;
          color: #fff;
          background: transparent;
          cursor: pointer;
          transition: background-color 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .toolbar-button:not(.is-active):not(:disabled):hover { background: #4b5563; }
        .toolbar-button.is-active { background: #66cdaa; }
        .toolbar-button:disabled {
          opacity: 0.35;
          cursor: default;
        }
        .tooltip-action {
          position: relative;
          display: inline-flex;
        }
        .tooltip {
          position: absolute;
          z-index: 3;
          top: calc(100% + 2px);
          left: 50%;
          padding: 4px 8px;
          border: 1px solid #66cdaa4d;
          border-radius: 8px;
          color: #fff;
          background: #000;
          font-size: 12px;
          line-height: 1.2;
          max-width: calc(100vw - 16px);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          opacity: 0;
          pointer-events: none;
          transform: translate(-50%, -2px);
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .tooltip-action > button:hover + .tooltip,
        .tooltip-action > button:focus-visible + .tooltip {
          opacity: 1;
          transform: translate(-50%, 0);
        }
        .toolbar-models > .tooltip-action:first-child .tooltip {
          left: 0;
          transform: translate(0, -2px);
        }
        .toolbar-models > .tooltip-action:first-child > button:hover + .tooltip,
        .toolbar-models > .tooltip-action:first-child > button:focus-visible + .tooltip {
          transform: translate(0, 0);
        }
        .toolbar-actions > .tooltip-action:last-child .tooltip {
          right: 0;
          left: auto;
          transform: translate(0, -2px);
        }
        .toolbar-actions > .tooltip-action:last-child > button:hover + .tooltip,
        .toolbar-actions > .tooltip-action:last-child > button:focus-visible + .tooltip {
          transform: translate(0, 0);
        }
        .stage {
          position: relative;
          min-height: 0;
          background: #000;
        }
        .ai-frame {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          display: none;
          border: 0;
          background: #000;
        }
        .ai-frame.active { display: block; }
        .empty {
          height: 100%;
          display: grid;
          place-items: center;
          padding: 20px;
          text-align: center;
        }
      `}</style>

      <header className="toolbar">
        <div className="toolbar-group toolbar-models">
          {AI_SITES.map((site) => {
            const enabled = enabledSites.some((enabledSite) => enabledSite.key === site.key)

            return (
              <TooltipButton
                key={site.key}
                type="button"
                label={site.label}
                className={`toolbar-button${site.key === activeSite?.key ? " is-active" : ""}`}
                disabled={!enabled}
                onClick={() => setActiveKey(site.key)}>
                <Icon icon={site.icon} height={20} aria-hidden="true" />
              </TooltipButton>
            )
          })}
        </div>

        <div className="toolbar-group toolbar-actions">
          <TooltipButton
            className="toolbar-button"
            type="button"
            label={t("screenshot")}
            disabled={!activeSite}
            onClick={() => void captureAndAttachScreenshot()}>
            <Icon icon="lucide:scan-square" height={20} aria-hidden="true" />
          </TooltipButton>
          <TooltipButton
            className="toolbar-button"
            type="button"
            label={t("reload")}
            disabled={!activeSite}
            onClick={reloadActiveSite}>
            <Icon icon="lucide:rotate-cw" height={20} aria-hidden="true" />
          </TooltipButton>
          <TooltipButton
            className="toolbar-button"
            type="button"
            label={t("newTab")}
            disabled={!activeSite}
            onClick={openActiveSiteInTab}>
            <Icon icon="lucide:external-link" height={20} aria-hidden="true" />
          </TooltipButton>
        </div>
      </header>

      <section className="stage">
        {activeSite ? (
          AI_SITES.filter((site) => visited.has(site.key) && enabledSites.some((enabled) => enabled.key === site.key)).map(
            (site) => (
              <iframe
                key={`${site.key}:${reloadKeys[site.key] || 0}`}
                className={`ai-frame${site.key === activeSite.key ? " active" : ""}`}
                src={site.url}
                title={site.label}
                allow="clipboard-read; clipboard-write; microphone; camera"
                onLoad={(event) => {
                  setLoadingSites((current) => ({ ...current, [site.key]: false }))
                  event.currentTarget.contentWindow?.postMessage(
                    { type: SIDE_PANEL_THEME_MESSAGE },
                    new URL(site.url).origin
                  )
                }}
              />
            )
          )
        ) : (
          <div className="empty">
            <span>{t("error_noModel")}</span>
          </div>
        )}
        {activeSite && loadingSites[activeSite.key] && (
          <div style={LOADING_OVERLAY_STYLE}>
            <Icon icon="line-md:loading-twotone-loop" height={48} color="#66cdaa" aria-hidden="true" />
          </div>
        )}
      </section>
    </main>
  )
}

export default SidePanel
