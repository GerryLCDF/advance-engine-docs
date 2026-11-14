import { defineConfig } from 'vitepress'

const esSidebar = [
  { text: 'Inicio', link: '/' },
  { text: '00 — Primeros pasos', link: '/00-inicio' },
  { text: '01 — Interfaz', link: '/01-interfaz' },
  { text: '02 — Mundo', link: '/02-mundo' },
  { text: '03 — Sprite', link: '/03-sprite' },
  { text: '04 — Imagen', link: '/04-imagen' },
  { text: '05 — Music', link: '/05-music' },
  { text: '06 — Sound', link: '/06-sound' },
  { text: '07 — Diálogo', link: '/07-dialogo' },
  { text: '08 — Scripting', link: '/08-scripting' },
  { text: '09 — Exportar', link: '/09-exportar' },
  { text: '10 — Programar en C', link: '/10-programar-c-gba' },
  { text: '11 — Manual completo', link: '/11-manual-completo' }
]

const enSidebar = [
  { text: 'Home', link: '/en/' },
  { text: '00 — Getting started', link: '/en/00-inicio' },
  { text: '01 — Interface', link: '/en/01-interfaz' },
  { text: '02 — World', link: '/en/02-mundo' },
  { text: '03 — Sprite', link: '/en/03-sprite' },
  { text: '04 — Image', link: '/en/04-imagen' },
  { text: '05 — Music', link: '/en/05-music' },
  { text: '06 — Sound', link: '/en/06-sound' },
  { text: '07 — Dialog', link: '/en/07-dialogo' },
  { text: '08 — Scripting', link: '/en/08-scripting' },
  { text: '09 — Export', link: '/en/09-exportar' },
  { text: '10 — Programming in C', link: '/en/10-programar-c-gba' },
  { text: '11 — Complete manual', link: '/en/11-manual-completo' }
]

const jaSidebar = [
  { text: 'ホーム', link: '/ja/' },
  { text: '00 — はじめに', link: '/ja/00-inicio' },
  { text: '01 — インターフェース', link: '/ja/01-interfaz' },
  { text: '02 — ワールド', link: '/ja/02-mundo' },
  { text: '03 — スプライト', link: '/ja/03-sprite' },
  { text: '04 — 画像', link: '/ja/04-imagen' },
  { text: '05 — ミュージック', link: '/ja/05-music' },
  { text: '06 — サウンド', link: '/ja/06-sound' },
  { text: '07 — ダイアログ', link: '/ja/07-dialogo' },
  { text: '08 — スクリプティング', link: '/ja/08-scripting' },
  { text: '09 — エクスポート', link: '/ja/09-exportar' },
  { text: '10 — Cプログラミング', link: '/ja/10-programar-c-gba' },
  { text: '11 — 完全マニュアル', link: '/ja/11-manual-completo' }
]

export default defineConfig({
  title: 'AdvanceEngine Docs',
  description: 'Documentación de AdvanceEngine',
  base: '/advance-engine-docs/',
  lang: 'es-ES',
  head: [['link', { rel: 'icon', href: '/favicon.ico' }], ['style', {}, '.VPNav .logo, .VPNav .logo img { height: 48px; width: auto; }']],
  locales: {
    root: {
      label: 'Español',
      lang: 'es-ES',
      themeConfig: {
        nav: [{ text: 'itch.io', link: 'https://gerardolcdf.itch.io/advanceengine' }],
        sidebar: esSidebar,
        search: { provider: 'local' },
        outline: 'deep'
      }
    },
    en: {
      label: 'English',
      lang: 'en-US',
      link: '/en/',
      themeConfig: {
        nav: [{ text: 'itch.io', link: 'https://gerardolcdf.itch.io/advanceengine' }],
        sidebar: enSidebar,
        search: { provider: 'local' },
        outline: 'deep'
      }
    },
    ja: {
      label: '日本語',
      lang: 'ja',
      link: '/ja/',
      themeConfig: {
        nav: [{ text: 'itch.io', link: 'https://gerardolcdf.itch.io/advanceengine' }],
        sidebar: jaSidebar,
        search: { provider: 'local' },
        outline: 'deep'
      }
    }
  },
  themeConfig: {
    logo: { light: '/logo-light.svg', dark: '/logo-dark.svg' }
  }
})