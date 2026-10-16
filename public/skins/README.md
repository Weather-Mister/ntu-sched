# Campus Week appearance skins

Garden is the first alternate skin. Select **Settings → Appearance → Garden** (花園 in Traditional Chinese). It uses the existing encrypted, per-student `theme` preference and the existing local appearance fallback. Daylight, Dark and System remain available.

The source reference is `Weather-Mister/ntu-mail-push`, `sites/begum/`, commit `a7bb648`. Garden reuses its floral SVGs, bee construction, randomized five-path flight animation, pollen, cream/sage/pink palette, Fraunces and DM Sans fonts, and mail illustration. Fonts are self-hosted with their OFL licenses.

`garden.css` maps those visuals to the existing Campus Week DOM. `garden.mjs` mounts only aria-hidden, pointer-transparent decorations. `garden-bees.mjs` adapts the original animation to return a cleanup function: switching themes cancels timers/animations, disconnects observers, removes listeners and deletes the decoration nodes. Flights pause when the page or app is hidden, and respect reduced motion.

No personal-site schedule, mail client, account, storage, notification or task code is imported. The shared Campus Week controls and data remain the only application implementation. Existing content, dates, completion states, course colors, resizing, dialogs, mail, translations and login flow are unchanged. The garden palette follows the shared desktop/mobile layout and scroll behavior, rather than importing incompatible layout rules from the personal site.

Future skins should follow this same cosmetic adapter pattern. Keep all selectors scoped, preserve focus and status states, and never replace application nodes or data handlers. Do not put new product features in a skin.
