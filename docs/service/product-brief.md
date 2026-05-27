# AI Typography Web App Product Brief

## Purpose

This service helps Korean webnovel authors and small management teams create title typography for cover use. It is not a cover generation service. The product focuses on making title typography cheaper, faster, and easier to try than a full custom design commission.

The service should feel light, friendly, and linear. Users should not need design knowledge to finish a result, but they should be able to adjust the important parts when they want control.

## Target Users

- Individual Korean webnovel authors.
- Small webnovel management or publishing teams.
- Users who may be curious about AI-assisted typography if the price is low enough.
- Users who want usable title typography, not a full design suite.

## Positioning

- AI-assisted webnovel title typography.
- A simple guided production flow, not a general-purpose design tool.
- Professional trust is supported by mentioning collaboration with real typography designers.
- Designer collaboration is a brand trust device only in MVP. It is not a human retouch workflow.

## Product Boundaries

In scope:

- Korean title typography generation.
- User-adjustable title layout.
- AI-resolved decorative element and style guidance.
- Black-and-white typography candidate generation.
- Browser-based effect application and cover preview.
- Basic PNG export and advanced high-resolution/layer export.

Out of scope for MVP:

- Cover illustration generation.
- PSD export.
- Vector export.
- Team or workspace accounts.
- Subscription plans.
- Long-term asset library.
- Human retouch requests.
- Public gallery or showcase.
- Using user projects as marketing examples.
- Sending uploaded cover images to the AI typography image generation model.

## Core Workflow

Every step has forward and back navigation.

1. Select genre/reference
   - The user chooses from predefined genre cards.
   - Each genre shows typography examples.
   - The chosen genre informs initial typography style and downstream generation.
   - The user can optionally upload a cover image.

2. Enter title
   - The user enters the Korean title.

3. Review AI layout
   - The system shows a loading state.
   - The service generates an initial title layout.
   - The user can move, resize, and rotate individual letters.
   - The user can request another AI recommendation.

4. Enter elements and style direction
   - The user writes short words or phrases.
   - The system expands them into structured element and style lists.
   - Internally this is a prompt, but the UI presents it as editable lists.
   - Before generation, the service shows a credit cost confirmation.

5. Generate typography candidates
   - One paid generation batch produces three black-and-white typography candidates.
   - The waiting screen explains that generation can take from about 10 seconds to several minutes.
   - The screen shows three generation slots.
   - Completed images can remain blurred until the batch is ready.
   - If some slots fail or time out, the service refunds credits proportionally.

6. Choose a candidate and apply effects
   - The user selects one black-and-white candidate.
   - The service applies a recommended effect preset by default.
   - The preview shows typography placed on the uploaded cover, or on a default background.
   - The user can adjust typography position, scale, rotation, and effect settings.

7. Export
   - Basic export produces a final PNG composited on the cover at a reasonable resolution.
   - Basic export also allows downloading the intermediate transparent black typography PNG.
   - Advanced export costs extra credits and produces high-resolution PNG output plus layer-separated PNG files in a ZIP.

## Cover Upload Rules

Uploaded covers are used only for:

- Preview background.
- Color and brightness analysis.
- Approximate light direction analysis.
- Automatic typography placement suggestion.

Uploaded covers are not sent to OpenRouter or Comfy Cloud for typography image generation.

The UI and privacy policy must clearly say this.

## Content and Data Use

User titles, covers, prompts, generated candidates, and exports are not used for:

- Model training.
- Marketing examples.
- Public showcases.
- Third-party case studies.

Only operational logs, anonymous aggregate metrics, and failure diagnostics may be used to improve the service.

## Commercial Use

Paid generated outputs should be commercially usable by the user. Terms must also explain that the user is responsible for inputs that may infringe third-party rights, including copyrighted works, trademarks, or protected character names.

This section needs legal review before launch.
