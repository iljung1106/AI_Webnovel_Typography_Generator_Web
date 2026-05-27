# Design Research Notes

## Sources Checked

The design document format and examples were reviewed from:

- VoltAgent `awesome-design-md` repository.
- Figma DESIGN.md example.
- Notion DESIGN.md example.
- Intercom DESIGN.md example.
- Wise DESIGN.md example.
- BHB website.
- Topaz Labs website.
- User-provided light desktop editor reference image.

The repository frames DESIGN.md as a Markdown design-system document that agents can read to generate consistent UI. The examples commonly include theme, color roles, typography, component styling, layout principles, depth/elevation, do/don't rules, responsive behavior, and agent guidance.

Source links:

- https://github.com/VoltAgent/awesome-design-md
- https://raw.githubusercontent.com/VoltAgent/awesome-design-md/main/design-md/figma/DESIGN.md
- https://raw.githubusercontent.com/VoltAgent/awesome-design-md/main/design-md/notion/DESIGN.md
- https://raw.githubusercontent.com/VoltAgent/awesome-design-md/main/design-md/intercom/DESIGN.md
- https://raw.githubusercontent.com/VoltAgent/awesome-design-md/main/design-md/wise/DESIGN.md
- https://bhb.co.jp/
- https://www.topazlabs.com/

## Useful Patterns Observed

### Figma Example

Useful for this project:

- Tool-first confidence.
- Clear monochrome core.
- Strong section rhythm.
- Color used as structural emphasis, not random decoration.

What not to copy:

- Large marketing-page composition.
- Oversized decorative color blocks inside the actual app workflow.

### Notion Example

Useful for this project:

- Friendly productivity tone.
- Clear input and card systems.
- Tinted surfaces for approachable hierarchy.
- Structured workspace-like interaction patterns.

What not to copy:

- All-in-one workspace framing.
- Heavy illustration-led brand world.

### Intercom Example

Useful for this project:

- Warm off-white canvas.
- Product-led quiet interface.
- Sparse accent color.
- Trustworthy support/product tone.

What not to copy:

- B2B support-suite density.
- Marketing page emphasis on screenshots as the main hero object.

### Wise Example

Useful for this project:

- Friendly financial clarity.
- Strong CTAs.
- Simple rounded controls.
- Clear trust cues around money-like actions.

What not to copy:

- Bright lime as a dominant brand signature.
- Banking-style hero scale.

## Resulting Direction

The chosen source document for the current `DESIGN.md` is the Apple example from `VoltAgent/awesome-design-md`.

Why Apple is the base:

- It is white-first.
- It makes the artifact/product the hero.
- It uses one disciplined interactive color instead of scattered accents.
- It keeps UI chrome quiet.
- It avoids decorative gradients.
- It provides a strong correction against both monochrome blue UI and arbitrary multi-color mixing.

Earlier MVP UI direction combined:

- Notion-like approachability.
- Intercom-like warmth and restraint.
- Wise-like clarity for credit/payment moments.
- Figma-like confidence around creative tools.

The webnovel-native modification adds:

- BHB-like memorability and personality, without copying its humor-first brand.
- Topaz-like AI creative-tool credibility and output confidence.
- The user-provided editor reference's light gray desktop tool structure, central canvas, compact inspector, soft shadows, and warm action accent.
- A subtle fantasy atelier mood suitable for Korean webnovel title typography.

The warm action accent from the editor reference is no longer used as the main palette direction. The current direction uses a white-first base and one disciplined cool primary accent.

This does not mean copying any brand. It means using a light, tool-focused system with clear steps, low visual noise, stable controls, and a controlled webnovel fantasy flavor.

## Design Scope Note

This research informs a design-direction document only. Detailed visual design, exact brand identity, logo, illustration style, marketing pages, and final color palette remain deferred.
