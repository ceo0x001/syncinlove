import type { MetadataRoute } from 'next'

/**
 * Installability.
 *
 * `appleWebApp: capable` was already set, which covers iOS "Add to Home Screen",
 * but without a manifest Android and desktop Chrome will not offer to install at
 * all — and none of the name, icon, colour or launch behaviour was ours to
 * control. For a product whose whole shape is a thirty-second daily ritual, being
 * on the home screen is most of the habit: an app you have to remember to type a
 * URL for is an app you stop opening.
 *
 * `display: standalone` drops the browser chrome, so a launch from the home
 * screen looks like the app rather than like a web page about it.
 *
 * No screenshots or shortcuts here on purpose. Shortcuts to /menu or /vault would
 * put "the vault" and "menus" in a long-press menu on a shared phone, which is a
 * privacy leak dressed up as convenience — this app is read over people's
 * shoulders by design.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'SyncinLove',
    short_name: 'Sync',
    description: 'One question a day, for two people.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    // Warm White and Deep Midnight — the same values the viewport theme colour
    // uses, so the splash does not flash a different colour than the app.
    background_color: '#fffcfa',
    theme_color: '#fffcfa',
    categories: ['lifestyle', 'social'],
    icons: [
      {
        src: '/brand/syncicon.png',
        sizes: '512x512',
        type: 'image/png',
        // `any maskable` lets Android apply its own mask rather than dropping the
        // square icon into a circle and clipping the hearts.
        purpose: 'maskable',
      },
      {
        src: '/brand/syncicon.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
    ],
  }
}
