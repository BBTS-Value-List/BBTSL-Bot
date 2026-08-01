import { MessageFlags } from "discord.js";

export const ComponentType = Object.freeze({
  ActionRow: 1,
  Button: 2,
  StringSelect: 3,
  Section: 9,
  TextDisplay: 10,
  Thumbnail: 11,
  MediaGallery: 12,
  Separator: 14,
  Container: 17
});

export function v2(components, ephemeral = false) {
  return {
    flags: ephemeral ? MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral : MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
    components
  };
}

export function container(children, accentColor = 0xff8a3d) {
  return { type: ComponentType.Container, accent_color: accentColor, components: children };
}

export function text(content) {
  return { type: ComponentType.TextDisplay, content: String(content || "") };
}

export function separator(spacing = 1) {
  return { type: ComponentType.Separator, divider: true, spacing };
}

export function thumbnail(url, description = "") {
  return { type: ComponentType.Thumbnail, media: { url }, description };
}

export function section(children, accessory) {
  return { type: ComponentType.Section, components: children, accessory };
}

export function mediaGallery(items) {
  return {
    type: ComponentType.MediaGallery,
    items: items.map(normalizeMediaItem).filter(Boolean).slice(0, 10)
  };
}

export function actionRow(components) {
  return { type: ComponentType.ActionRow, components: components.slice(0, 5) };
}

export function button(customId, label, style = 2) {
  return { type: ComponentType.Button, custom_id: customId, label: String(label).slice(0, 80), style };
}

export function linkButton(url, label) {
  return { type: ComponentType.Button, url, label: String(label).slice(0, 80), style: 5 };
}

export function select(customId, placeholder, options) {
  return {
    type: ComponentType.StringSelect,
    custom_id: customId,
    placeholder,
    min_values: 1,
    max_values: 1,
    options: options.slice(0, 25)
  };
}

function normalizeMediaItem(item) {
  if (!item) return null;
  if (typeof item === "string") return { media: { url: item } };
  const url = item.url || item.media?.url;
  if (!url) return null;
  return {
    media: { url },
    description: item.description || undefined,
    spoiler: Boolean(item.spoiler)
  };
}
