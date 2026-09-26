# RGBoner visual style guide

This is the design direction for visual changes to RGBoner. **“Pixel perfect” describes the game image we want to evoke: a clean, sharp RGB signal from a retro console. It does not mean fixing the website to a console resolution or making every UI element pixel art.** The site must still adapt to screens, browser zoom, and readable text.

The shared library, search, player, and settings styles in `app/globals.css` follow this guide. Keep new screens and changes consistent with those styles and update the guide when the agreed direction changes.

## Design intent

Imagine a well-calibrated display showing the console's direct RGB output: dark surrounding hardware, vivid but controlled colors, distinct pixels in actual pixel artwork, and clear labels. The game cover or artwork is the main event. Interface decoration should frame it, not compete with it.

Three principles govern decisions:

1. **Protect the game image.** Preserve artwork's source proportions and rendering style. Make covers and screenshots easy to inspect.
2. **Use the logo as the signature.** The R is red, the G is green, and “Boner” is blue. Keep the exact wordmark and favicon colors and geometry unless the user explicitly asks to change the brand.
3. **Make every state legible.** Clear text, focus, loading, errors, and controls matter more than nostalgia effects.

The references to RGB describe the intended visual mood, not a claim that every historical console had identical output or square pixels. The image treatment should be chosen for the source material.

## Brand assets

| Asset | Source of truth | Rule |
| --- | --- | --- |
| Header wordmark | `BrandWordmark` in `app/site-header.tsx` | Preserve the glyph patterns, letter order, and color assignment. Keep a clear margin around it; never add glow, blur, shadows, outlines, gradients, or a second font version. |
| Favicon | `public/favicon.svg` | Preserve the block R/G/B on the near-black tile. Keep it recognizable at small sizes. |

Brand colors are fixed: **red `#FF1010`**, **green `#00E51B`**, **blue `#173CFF`**, and favicon ground **`#08080B`**. These are logo colors, not a mandate to use all three across each page. Treat RGB as a small, memorable accent; use neutrals for most interface area. A three-color bar or a few square pixels may echo the mark when there is a clear reason, but repeating RGB stripes on every card dilutes it.

The wordmark SVG has a `42 × 7` viewBox. Its current display sizes are integer multiples: `168 × 28` CSS pixels normally and `126 × 21` on narrow screens. Keep that relationship when changing its size and inspect the result at browser zoom levels. `shape-rendering="crispEdges"` is a rendering hint, not a guarantee that every browser and display scale yields identical edges.

## Color system

These semantic tokens are defined in `app/globals.css`. Use the role that matches the job instead of inserting a new one-off color.

| Role | Suggested value | Use |
| --- | --- | --- |
| `--rgb-page` | `#101319` | Main canvas; neutral and dark enough to let artwork stand out. |
| `--rgb-panel` | `#191E27` | Cards, search field, menus, and grouped settings. |
| `--rgb-panel-raised` | `#202632` | Secondary control fill. |
| `--rgb-ink` | `#E9EEF5` | Primary text. |
| `--rgb-muted` | `#AAB7C8` | Secondary text and metadata, including dates and platform names. |
| `--rgb-control-edge` | `#66758A` | Borders essential to identifying fields or controls. |
| `--rgb-focus` | `#8EA2FF` | Keyboard focus outline. |
| `--rgb-action` | `#00E51B` | Selected state or one important action in a view. Pair with near-black text if filled. |
| `--rgb-info` | `#8EA2FF` | Readable blue for links or informational states. |
| `--rgb-danger` | `#FF6B66` | Readable error or destructive action. |
| `--rgb-rule` | `#343D4B` | Decorative separators and quiet card edges. |
| `--rgb-black` | `#08080B` | Header and artwork letterboxing. |

The tokens do not replace contrast checks on actual color pairs. On the panel, primary text, muted text, focus blue, action green, and danger red all exceed 4.5:1 by calculation; the control edge exceeds 3:1 against the panel. The **brand blue `#173CFF` does not reach 3:1 on the dark panel** and must not be used for small text, icons that convey meaning, focus outlines, or control boundaries there. It remains exact in the logo. Reserve pure brand red and green for the logo or carefully checked accents; prefer the semantic state colors for messages.

Use one prominent accent action per region. A colored state also needs a visible word, icon, border, or selected shape so color is never the only clue. Do not set game art to a brand duotone or cover it with color overlays.

## Type and layout

- Use a plain, highly legible sans-serif for paragraphs, forms, navigation, and game titles. The current Arial/Helvetica stack is acceptable until a deliberate type change is made. Avoid tiny pixel fonts for reading tasks. The logo already supplies the pixel lettering.
- Use a monospaced or pixel face only for short decorative labels, counters, or section markers, and only if it remains readable. Do not turn all headings or body copy into an arcade font.
- Keep body text around `16px` with comfortable line height (about `1.5`); metadata may be smaller, but avoid relying on `10–12px` text for essential information. Use `rem` for type sizing so browser text preferences still work.
- Build visual rhythm from a small spacing scale such as `4, 8, 12, 16, 24, 32, 48, 64` CSS pixels. Align panels, labels, image edges, and actions consistently. This is a layout rhythm, not a fake console pixel grid.
- Keep content at a readable width; allow grids to change column count as space shrinks. At narrow widths, stack controls and keep their labels visible. Do not crop important actions to maintain a retro silhouette.
- Favor flat surfaces, clear 1px dividers, modest corner radii, and square or stepped accents. Avoid glassmorphism, soft glow, heavy drop shadows, beveled plastic, and large gradient backgrounds. A few sharp details are more effective than making every box look like a cartridge.

## Game imagery and pixel art

- **Pixel art and low-resolution screenshots:** retain the native source, its aspect ratio, and intentional pixel structure. When enlarging raster pixel art, prefer integer scale factors (2×, 3×, 4×) and `image-rendering: pixelated` or `crisp-edges`; test in the browsers we support. Leave letterboxing or a neutral frame if needed. Browser zoom and device pixel ratios can still make some pixels uneven, so inspect rather than promise mathematically identical physical pixels.
- **Modern cover art, photography, and illustrations:** use normal smooth image rendering. Do not apply `image-rendering: pixelated` globally or enlarge low-quality covers to manufacture pixel art. If a listing requires a consistent crop, use a deliberate `object-fit` choice and keep the full cover available where useful.
- **Icons and ornament:** prefer simple geometric shapes and a consistent icon family. A pixel motif should use a clear grid and limited colors. Do not mix high-detail faux 8-bit scenery with ordinary UI icons.
- **Effects:** do not add scanlines, phosphor glow, chromatic aberration, static, signal noise, VHS distortion, or rounded CRT glass by default. Those imply display degradation or analog artifacts and obscure the clean RGB idea. If a future feature genuinely needs a display simulation, confine it to the artwork preview and make it optional.

## Role visibility

Admin status is never a public visual identity. Do not add role badges, special colors, labels, admin links, or role management controls. A server-authorized admin viewer may see additional data and existing action controls on their own page view; other viewers see the normal interface. Private profile labels and friend controls reflect actual visibility and friendship, even when the current viewer has permission to see private data. Admin challenge controls reuse the existing confirmation, favorite, rank, and remove buttons; each confirmation button has an accessible name and tooltip identifying whose confirmation it changes.

## Component behavior

| Component | Visual direction |
| --- | --- |
| Header | Let the wordmark lead. Keep search and the account control visually quieter, with clear boundaries and focus. Put signed-in navigation and sign out in the account dropdown; show guests a direct, understated Sign in link in the same area. Keep the search form available at narrow widths. |
| Friends timeline | Use a near-black square monitor frame around the activity list, a single small RGB bar beside the section label, and monospaced secondary labels. Keep game batches compact with four visible covers and a keyboard-accessible disclosure for the rest. Game names open the game details dialog; fit the green **+ Add challenge** action into the available space at the end of each row without enlarging the batch layout. Challenge covers and titles open the shared challenge details popup; omit the separate profile link. Covers retain their proportions, and challenge status uses text alongside color. Stack entries at narrow widths. My library lives under the account icon; the logo returns home. |
| Favorite games | Place the ordered game grid at the top of visible profiles, above challenges. Reuse compact cover-left cards with intact artwork and a count out of nine; show order through list position and omit printed rank numbers. Owners and authorized viewers use the challenge-style up/down arrows and filled star, grouped at the upper right above the artwork. Keep the controls close to the game row and make profile covers slightly larger than general library covers. Wrap the section heading and Find games link on narrow screens. Game details use a labeled star toggle with limit and error messages. |
| Game card | Artwork first, then title and compact metadata. The artwork/title area opens a full game file. Show the selected platform on every library copy. |
| Game file dialog | Use a large, unobstructed cover, readable IGDB metadata, and a complete platform list. Keep platform actions in labeled rows; show saved, current, and unavailable states in words as well as color. Library copies can be added or removed in the same platform list. A small RGB edge detail may echo the wordmark without coloring the artwork. |
| Player card | Treat player identity and friendship state as text and structure, not only a colored indicator. |
| Challenge card | Pair the game's cover and title with the challenge title, and omit the description from the card view. Make the cover and title clear, keyboard-accessible detail buttons that open a compact popup with the game cover, challenge title, game context, and description; preserve the cover's aspect ratio and keep participant links and challenge controls separate. Keep the participant name close to the challenge title. Use a hollow green circle for the viewer's unconfirmed state and a filled green circle for their confirmed state; the card is complete only when both participants confirm, shown by the green left edge without a Completed label. Place the up/down rank controls on the left side of the top row above the image, with the confirmation circle, recipient's star toggle, and red top-right X grouped on the right. Show rank controls only on the recipient's active favorited profile challenges, within the Favorites group in Pending or Completed. In the expanded Challenges list inside a collection game card, show only challenge titles with available confirmation and recipient remove controls; make each title a detail button that opens the same compact popup. Omit images and other challenge details from the row. The X is the single remove action, replaces a separate decline control, and the challenged player (recipient), or an admin viewing the page, can permanently remove the challenge for both participants after confirmation; older declined records can be removed the same way. Keep favorite groups labeled and preserve the edge color for each challenge state. |
| Challenge form | Use a centered, focused modal dialog with labeled title and description fields, a clear cancel action, and inline errors. |
| Search and filters | On idle search, show up to six popular recent games with the same compact, cover-left card styling and responsive grid as the library. Keep covers intact and show the player count in muted text; omit the library-only challenges area. Make the selected filter obvious through fill/border **and** its label or checked state. Multi-select filters use clearly labeled checkboxes, and selected platforms have a labeled clear button inside the dropdown search field that can be activated separately from typing. Place the returned game count beside the Games heading so the dropdown stays in place. For long option lists, put a restrained search field at the top of the dropdown and keep it visible while options scroll; searching narrows visible choices without clearing selections. Keep the current game grid in place with a muted, inactive state while a platform change loads new results. Keep result types separated. Guests may search; saving a game or adding a friend sends them to sign-in. |
| Settings and forms | Use straightforward field labels, inline help, and explicit success/error messages. Keep the same panel and action language as the library. |
| Email sign-in | Keep the wordmark above a single readable form panel. Label every field, show errors and confirmation beside the form, and use the shared action, border, and focus colors. Verification and password reset use the same panel. |
| Empty/loading/error states | Be concise and useful. Use a small accent at most; avoid a full-screen arcade animation. |

Use hover as a subtle enhancement. Every hover affordance must have a keyboard focus counterpart. Motion should be brief and restrained; respect `prefers-reduced-motion`, and avoid flashing or continuously moving decoration.

## Accessibility and responsive checks

Treat WCAG 2.2 AA as the minimum design target. For each visual change:

- Verify normal text contrast of at least **4.5:1**, large text at least **3:1**, and meaningful control or state indicators at least **3:1**. The logo has a standards exception, but still needs to be identifiable.
- Keep a visible keyboard focus indicator. Never remove an outline without replacing it with something equally clear; check it on both page and panel backgrounds.
- Make pointer targets at least **24 × 24 CSS pixels** or satisfy the WCAG spacing exception; aim for larger touch targets where space permits.
- Check layout at a **320 CSS pixel** viewport width and at **200% text zoom**. Content and controls must remain available without horizontal page scrolling for ordinary screens.
- Pair state colors with text or form, supply text alternatives for meaningful imagery, and keep the logo link's accessible name.
- Check reduced-motion settings and test any decorative effect over real game artwork before shipping it.

## Rules for future agents

1. Read this guide and inspect the current wordmark and favicon before changing visuals. Preserve those brand assets unless the user's request explicitly includes them.
2. For new UI, choose semantic tokens and reusable component styles over isolated one-off colors and measurements. If a new role is necessary, document why and add it to the palette.
3. Keep the library, search, player, and settings screens consistent with this guide while preserving their behavior. Check any new screen against the shared styles before adding visual exceptions.
4. Review desktop, narrow/mobile, keyboard focus, browser zoom, contrast, and reduced motion. Inspect game images separately from pixel art.
5. Update this guide when an agreed visual decision changes. Update `README.md` or `docs/architecture.md` as needed if the implemented behavior or component structure changes. Keep the guide as current guidance, without dated change logs.

## Research basis

These sources support the technical and usability rules above. The palette, component direction, and choice to avoid default CRT effects are RGBoner design decisions.

- [RetroRGB introduction to RGB video](https://retrorgb.com/rgbintro.html): separated RGB signals are associated with sharper images and more defined colors than typical composite or RF output.
- [MDN: crisp pixel art](https://developer.mozilla.org/en-US/docs/Games/Techniques/Crisp_pixel_art_look) and [MDN: `image-rendering`](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/image-rendering): image scaling methods and practical limits at non-integer display scales.
- [MDN: SVG `shape-rendering`](https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Attribute/shape-rendering): `crispEdges` is a rendering preference, not a pixel guarantee.
- [U.S. Web Design System: design tokens](https://designsystem.digital.gov/design-tokens/) and [using color](https://designsystem.digital.gov/design-tokens/color/overview/): use a limited, role-based set of values for consistency.
- [W3C WCAG 2.2](https://www.w3.org/TR/wcag/): contrast, reflow, focus, and target-size criteria; [use of color](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color) and [reduced motion](https://www.w3.org/WAI/WCAG22/Techniques/css/C39) guidance.
