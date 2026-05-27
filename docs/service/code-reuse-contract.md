# Existing Code Reuse Contract

## Purpose

The production implementation must preserve the behavior and performance profile of the working prototype wherever the current modules already solve the problem. New service architecture should wrap, port, or adapt existing code instead of casually replacing it.

This is a product and engineering requirement, not an optional refactor preference.

## Required Reuse Principle

When implementing the production service, developers and agents must first check whether the current repository already contains working code for the target behavior.

If it exists, the implementation must choose one of these paths:

1. Reuse the existing module directly.
2. Copy the existing logic into the new service layer with minimal behavioral change.
3. Port the existing logic into the new framework while preserving the same inputs, outputs, and failure behavior.
4. Only replace it after documenting why reuse would fail.

The goal is to produce behavior that is the same as, or very close to, the current prototype unless a new requirement explicitly changes it.

## Modules to Preserve

### LayoutModule

Current role:

- Generates Korean title layout items.
- Parses SVG output.
- Applies post-processing:
  - word attraction
  - overlap push-apart
  - spacing normalization
  - last-row centering
  - full-layout centering

Production requirement:

- Release 1 must preserve the same layout item shape:
  - `char`
  - `x`
  - `y`
  - `fs`
  - `rotation`
- The editor and API should use this shape as the compatibility contract.
- Any change to generated layout behavior must be intentional and testable against current examples.

### PromptGenerationModule

Current role:

- Converts title, keywords, required elements, and extra instructions into a prompt for typography image generation.
- Normalizes output into a predictable structure.

Production requirement:

- The user-facing UI may display structured "elements" and "style" lists, but the internal generated content should remain compatible with the prompt format expected by the current Comfy workflow.
- The current normalization behavior should be reused or ported.

### ImageGenerationModule

Current role:

- Uploads input image to Comfy Cloud.
- Patches the fixed Comfy workflow.
- Runs single or parallel batch generation.
- Downloads generated files.

Production requirement:

- Release 1 should call this module or a close port of it.
- The fixed workflow node IDs and validation should be preserved until a new workflow version is introduced.
- Workflow changes must be versioned.

### TypoEffector

Current role:

- Browser WebGL2 material rendering.
- Mask extraction.
- Gemstone and metal presets.
- Glow/shadow/layer composition.
- Transparent PNG export.

Production requirement:

- Release 2 should port this rendering approach into Next.js.
- Rendering should stay browser-first.
- The current shader and layer-composition behavior should be treated as the baseline visual capability.

### PrototypeWebApp

Current role:

- Demonstrates the current end-to-end flow:
  - layout API
  - prompt API
  - generation API
  - browser layout editor

Production requirement:

- Use as behavioral reference, not as final architecture.
- Endpoint behavior, data shapes, loading flow, and editor interactions should guide the Next.js/FastAPI implementation.

## Acceptance Criteria

Before replacing any existing logic, the implementer must answer:

- Which existing file currently handles this behavior?
- What behavior must remain identical?
- What new requirement forces a change?
- How will the changed behavior be verified?

For the first production release, the safest default is reuse over redesign.

## Agent Instruction

Any implementation agent must read this document before modifying service code. Agents must not rewrite core layout, prompt, Comfy, or WebGL logic from scratch unless their task explicitly authorizes it.
