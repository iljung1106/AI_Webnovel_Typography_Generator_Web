---
version: alpha
name: Webnovel-Typography-Forge-design
description: "A white-first, result-centered Korean webnovel typography creation interface with crisp surfaces, disciplined accent color, generous spacing, and controlled webnovel fantasy atmosphere."
---

# DESIGN.md

## Overview

The app is a Korean webnovel title typography creation tool. It should feel like a precise, white-first creative workspace where the user's title typography is the main artifact.

The interface should be:

- clean
- sharp
- quiet
- practical
- Korean-first
- lightly fantastical
- centered on the generated typography result

The app is not a general design suite, not a cover-generation product, and not a decorative fantasy website. It is a guided production tool for authors who want to create usable title typography without learning professional design software.

## Visual Principle

**The typography is the artifact. The UI is the pedestal.**

Each workflow step should frame one primary object:

- genre examples
- title layout
- resolved style list
- generated candidates
- selected typography on cover
- final export preview

The surrounding UI should be calm and exact so the result feels important.

## Color System

Use a white and near-white base with one cool primary accent. The palette should feel crisp rather than colorful.

### Core Palette

- `canvas`: `#ffffff`
  - Main page background.

- `canvas-soft`: `#f6f7f9`
  - Outer app background, inactive bands, subtle workspace depth.

- `surface`: `#ffffff`
  - Panels, cards, editor surfaces.

- `surface-raised`: `#fbfcfe`
  - Slightly elevated panels and inspector surfaces.

- `ink`: `#17181c`
  - Primary text.

- `ink-muted`: `#6e7480`
  - Secondary text.

- `ink-faint`: `#9aa1ad`
  - Disabled labels and fine helper text.

- `line-soft`: `#edf0f4`
  - Soft dividers and card borders.

- `hairline`: `#dfe4ea`
  - Stronger control borders and selected card structure.

### Accent Palette

- `primary`: `#2563eb`
  - Main action, active step, selected state.

- `primary-hover`: `#1d4ed8`
  - Primary hover and pressed state.

- `primary-soft`: `#eff5ff`
  - Selected chip, subtle active background.

- `primary-ring`: `#93b4ff`
  - Focus ring and selected object outline.

- `ai`: `#6d5dfc`
  - AI recommendation affordance.

- `ai-soft`: `#f2f0ff`
  - AI recommendation panel or chip background.

- `starlight`: `#c7ccd8`
  - Tiny ornamental marks, specimen glints, inactive magical detail.

### Status Colors

- `success`: `#16a36a`
- `warning`: `#d88a18`
- `danger`: `#dc3d43`

### Usage

- Primary actions use `primary`.
- AI recommendation controls use `ai`.
- Status colors are reserved for actual state feedback.
- Genre mood appears mainly through thumbnails, typography specimens, and preview imagery.
- The app chrome stays mostly white, pale gray, and near-black.

## Typography

Use a Korean-first sans-serif system.

Recommended stack:

- `Pretendard`
- `SUIT`
- `Inter`
- `system-ui`
- `sans-serif`

### Hierarchy

- `page-title`
  - 32-40px
  - weight 650-700
  - line-height 1.15

- `section-title`
  - 22-28px
  - weight 650
  - line-height 1.2

- `body`
  - 15-17px
  - weight 400
  - line-height 1.55

- `caption`
  - 12-14px
  - weight 400-500
  - line-height 1.4

- `button`
  - 14-15px
  - weight 650
  - line-height 1

UI typography should stay clean. Expressive typography belongs in the generated title previews, not in the app chrome.

## Layout

The app is desktop-first.

### App Shell

Use a restrained editor layout:

- top step bar
- large central canvas
- compact right inspector
- bottom action bar
- optional slim tool rail when useful

The central canvas should feel like a white proofing board. It should be the largest and quietest object on editor screens.

### Spacing

Use an 8px-based rhythm:

- `4px`: tiny icon/text gap
- `8px`: small internal gaps
- `12px`: compact field spacing
- `16px`: card internal spacing
- `24px`: panel spacing
- `32px`: major layout gap
- `48px`: screen-level breathing room

The interface should feel open. Avoid compressing the workflow into dense dashboard panels.

### Genre Selection Grid

Genre selection should feel like choosing a shelf of webnovel title directions.

Cards should be consistent in chrome:

- same surface treatment
- same border logic
- same selected state
- varied specimen imagery inside the card

## Components

### Buttons

Primary:

- background: `primary`
- text: white
- radius: 999px or 10px depending on context
- one primary action per step

Secondary:

- background: white
- text: `ink`
- border: `line-soft`

AI recommendation:

- background: `ai-soft`
- text: `ai`
- border: soft violet hairline
- used only for recommendation or refinement actions

### Step Progress

Step progress should be quiet and exact.

- Active step uses `primary`.
- Completed steps are subdued.
- Future steps are faint.
- Labels are short Korean nouns.

Example labels:

- 장르
- 표지
- 제목
- 배치
- 스타일
- 시안
- 효과
- 내보내기

### Genre Cards

Each genre card includes:

- genre name
- typography specimen or cover-like thumbnail
- short descriptor
- selected state when active

Selected state:

- `primary` border or ring
- small `primary-soft` chip
- subtle check mark

### Canvas Editor

Layout editor:

- white proofing board
- black typography glyphs
- selected glyph outline in `primary-ring`
- visible resize and rotate handles
- compact inspector with sliders and numeric fields

Effect editor:

- cover preview dominates
- typography is selectable and transformable
- effect presets appear as specimen swatches
- advanced controls are secondary

### Inspector Panel

Inspector panels should be compact and readable:

- white or `surface-raised`
- thin border
- concise labels
- sliders with values
- segmented controls
- small preview thumbnails

Avoid turning the inspector into a dense professional design-tool wall.

### Credit Confirmation

Before spending credits, show:

- what action will happen
- credit cost
- technical failure refund note
- primary confirmation
- secondary cancel

The tone should be calm and clear.

### Generation Waiting

Waiting should feel active and understandable.

Show:

- three candidate slots
- current status
- expected time range
- friendly waiting copy
- refund state if a slot fails

Fantasy atmosphere can appear through small starlight marks, specimen placeholders, or subtle paper/glass textures.

## Imagery

Imagery should make the product feel webnovel-native.

Use:

- genre thumbnails
- typography specimens
- cover previews
- generated candidates
- effect material swatches

The service should not look like it generates cover illustrations. Imagery supports typography decisions.

## Fantasy Detail

Fantasy detail should be structural and restrained.

Use:

- subtle silver glints
- tiny star/rune marks
- pale moonlit paper texture inside thumbnails
- material names such as gem, metal, lacquer, ink
- delicate divider details in rare places

The app itself remains a clean working interface.

## Copy Tone

Voice:

- Korean-first
- plain
- helpful
- slightly imaginative
- never overpromising

Preferred examples:

- "AI가 추천한 배치입니다. 필요하면 글자를 직접 옮길 수 있어요."
- "선택한 장르는 첫 배치와 시안 추천에만 사용돼요."
- "표지는 생성 AI에 전달되지 않고, 색상과 배치 추천에만 사용됩니다."
- "3개의 타이포 시안을 만들고 있습니다."
- "실패한 시안은 자동으로 환불됩니다."

## Elevation

Use restrained depth:

- 1px borders
- soft hairlines
- very soft panel shadows only where necessary
- subtle sticky-bar blur only when useful

The generated result may have visual drama. The UI frame should remain quiet.

## Responsive Behavior

Desktop:

- full editor with central canvas and inspector

Tablet:

- inspector may stack below canvas

Mobile:

- browsing, login, and result viewing are supported
- full editing can be limited in MVP

## Guardrails

- Do not imply cover illustration generation.
- Do not expose raw prompt engineering as the main UI.
- Do not use decorative fantasy frames around the whole app.
- Do not use dark fantasy chrome as the default.
- Do not make the app feel like a generic analytics dashboard.
- Do not rebuild existing layout, prompt, Comfy, or WebGL behavior from scratch.

## Agent Prompt Guide

Build a Korean-first desktop web app for AI webnovel title typography creation. Use a white-first interface where the typography result is the main artifact. Keep chrome quiet, spacing generous, controls precise, and the workflow linear. Use blue for primary actions, violet for AI recommendation affordances, and restrained silver fantasy details for atmosphere. Express genre through thumbnails, typography specimens, cover previews, and material swatches rather than heavy decoration.
