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

const enSidebar = esSidebar.map((item) => ({
  ...item,
  link: item.link === '/' ? '/en/' : '/en' + item.link
}))

const jaSidebar = esSidebar.map((item) => ({
  ...item,
  link: item.link === '/' ? '/ja/' : '/ja' + item.link
}))

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
    logo: '/logo.svg'
  }
})