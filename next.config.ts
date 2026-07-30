import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          // Stops a browser second-guessing a declared content type, which is how
          // a served file ends up executed as a script.
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // Nothing here is meant to be framed. Clickjacking an app whose buttons
          // include "destroy this letter" and "end the pairing" is worth ruling
          // out outright.
          { key: 'X-Frame-Options', value: 'DENY' },
          // Send the origin cross-site but never the path. Our paths name what
          // somebody is doing — /vault, /rich-list — and a full referrer would
          // hand that to anything either partner follows a link to.
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
      {
        // The service worker specifically.
        source: '/sw.js',
        headers: [
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
          // A cached service worker is how a fixed bug fails to reach anybody for a
          // day. It is a few hundred bytes and re-fetching it costs nothing.
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ]
  },
}

export default nextConfig
