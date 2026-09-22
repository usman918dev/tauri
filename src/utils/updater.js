import { isTauri } from './storage'

let isChecking = false

export const checkAppUpdates = async ({ silent = true, onUpdateFound = null } = {}) => {
  if (!isTauri() || isChecking) {
    return null
  }

  isChecking = true
  try {
    const { check } = await import('@tauri-apps/plugin-updater')
    const update = await check()

    if (update && update.available) {
      console.log(`[Auto-Updater] Found new update version: ${update.version}`)

      if (onUpdateFound) {
        onUpdateFound(update)
      } else {
        const confirmUpdate = window.confirm(
          `🚀 A new update (v${update.version}) for PPTXPro is available!\n\nWould you like to download and install it now?`
        )

        if (confirmUpdate) {
          console.log('[Auto-Updater] Downloading update...')
          await update.downloadAndInstall()
          
          const { relaunch } = await import('@tauri-apps/plugin-process')
          alert('✅ Update installed successfully! PPTXPro will now restart.')
          await relaunch()
        }
      }
      return update
    } else {
      if (!silent) {
        alert('✨ You are already running the latest version of PPTXPro!')
      }
      return null
    }
  } catch (err) {
    console.warn('[Auto-Updater] Check failed:', err?.message || err)
    if (!silent) {
      alert('⚠️ Unable to check for updates at this time.')
    }
    return null
  } finally {
    isChecking = false
  }
}
