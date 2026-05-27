import { effectPresets } from "@/lib/typo-effector/effects";

type EffectName = keyof typeof effectPresets;

export type TypoEffectPreset = {
  id: string;
  label: string;
  effectName: EffectName;
  colors: {
    highlight: string;
    mid: string;
    shadow: string;
    satin: string;
  };
  lightAngle: number;
  bevel: number;
  glow: number;
};

export const typoEffectPresets: TypoEffectPreset[] = Object.entries(effectPresets).flatMap(([effectName, presets]) =>
  presets.map((preset) => ({
    id: preset.id,
    label: preset.label,
    effectName: effectName as EffectName,
    colors: {
      highlight: preset.params.colorA,
      mid: preset.params.colorB,
      shadow: preset.params.colorC,
      satin: preset.params.satinColor
    },
    lightAngle: preset.params.lightAngle,
    bevel: preset.params.bevel,
    glow: preset.params.rim
  }))
);

export function getTypoEffectPreset(presetId: string) {
  return typoEffectPresets.find((preset) => preset.id === presetId) ?? typoEffectPresets[0];
}
