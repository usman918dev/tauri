import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { translationsEn } from 'pptx-react-viewer/i18n'

if (!i18n.isInitialized) {
  i18n
    .use(initReactI18next)
    .init({
      resources: {
        en: {
          translation: translationsEn || {},
        },
      },
      lng: 'en',
      fallbackLng: 'en',
      interpolation: {
        escapeValue: false,
      },
    })
}

export default i18n
