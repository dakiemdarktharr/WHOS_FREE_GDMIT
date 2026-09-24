# Visual reference attribution audit

This audit separates the project-owner-supplied files from public Pinterest discovery results. Pinterest pins are not automatically the original work, so a search result is recorded as a lead unless the supplied raster can be matched confidently to the pin and its underlying creator.

| Project asset | Supplied in project conversation | Search result / creator lead | Attribution status |
|---|---:|---|---|
| `reference-1.png` | Yes | No exact creator match verified | Do not assign authorship from Pinterest search alone |
| `reference-2.png` | Yes | No exact creator match verified | Do not assign authorship from Pinterest search alone |
| `reference-3.png` | Yes | No exact creator match verified | Do not assign authorship from Pinterest search alone |
| `reference-4.png` | Yes | [Prismatic Chrome Lens effect](https://in.pinterest.com/pin/prismatic-chrome-lens-photo-effect-youworkforthem--809944314263001417/) — YouWorkForThem is named by the pin title | Search lead only; exact supplied raster match not verified |
| `reference-5.png` | Yes | No exact creator match verified | Do not assign authorship from Pinterest search alone |
| `reference-6.png` | Yes | [Retro wave wireframe grid](https://in.pinterest.com/pin/retro-wave-synthases-grid-patterns-wireframe-grid-backgrounds-in-black-and-white-colors--445223113180531800/) — pin points to Freepik | Search lead only; exact supplied raster match not verified |
| `reference-7.png` | Yes | [Halftone stars stock vector](https://in.pinterest.com/pin/stars-pattern-vector-halftone-texture-abstract-stock-vector-royalty-free-2153333789--393502086202945355/) — pin title points to Shutterstock | Search lead only; exact supplied raster match not verified |

## Usage note

The production renderer uses the supplied raster references as inputs to an original shader composition. It does not scrape Pinterest at runtime, and it does not present the Pinterest pins as owned project assets. Before redistributing any original source raster commercially, confirm the source license and replace any unverified reference with a properly licensed asset or an asset created for this project.

If the original Pinterest pin URLs or creator names become available, update this file with the exact pin, underlying source creator, and license before making an ownership claim.
