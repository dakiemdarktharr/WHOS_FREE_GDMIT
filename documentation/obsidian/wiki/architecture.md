# Who's free, gdmit architecture

> Raw: [../raw/product-requirements.md](../raw/product-requirements.md)
> Fingerprint: git:working-tree
> Monitored: documentation/api-contract.json, src/app/api, src/domain, src/lib, src/components, src/app/globals.css
> Status: Current

The app uses a Next.js App Router frontend and backend-for-frontend API route handlers. The API contract is the JSON file at [../../api-contract.json](../../api-contract.json), and route files are checked against it by `scripts/check-architecture.mjs`.

MongoDB stores plans, members, and normalized UTC busy slots. The browser captures its IANA timezone and uses local calendar dates for editing. An Ably channel named `plan:{code}` broadcasts presence and availability events so every open room can update without polling.

The schedule begins at the current month. A member saves each day they want considered. The first and last saved day define their planning window; any saved day with zero busy hours is treated as fully free. The recommendation engine uses the overlap of all member windows and sorts hourly slots by the number of members who marked that UTC hour busy.

The visual system uses a viewport-fixed Three.js wave surface that continuously carries seven chrome, holographic, and grid textures. A solid, beveled chrome GLB title occupies approximately 80% of the landing viewport width and rapidly tilts around the whole title's center in response to the mouse. The background stays fixed while the title scrolls away with the hero. ChromeWorld dynamically loads chrome-scene; a static texture and semantic CSS heading remain available on rendering failure. Pause and reduced-motion support freeze decorative motion. Rajdhani controls and glossy cel-shaded panels remain intact. Selected hours snap into a padlock state; busy days display a purple glint at 50% opacity over their existing color. The presentation file map and behavior contract are recorded in [../../../docs/ARCHITECTURE.md](../../../docs/ARCHITECTURE.md#current-frontend-presentation-2026-09-24) and [../../../docs/visual-contract.json](../../../docs/visual-contract.json). These visual changes do not migrate the legacy API described above.
