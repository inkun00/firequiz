const characterItemDefinitions = require('../../shared/characterItems.json');

const CHARACTER_ITEMS = Object.freeze(Object.fromEntries(
  characterItemDefinitions.map(definition => [
    definition.avatarKey,
    Object.freeze({ ...definition, ownerAvatar: definition.avatarKey, isCharacterSpecial: true })
  ])
));

function getAvatarKey(avatar) {
  const match = String(avatar || '').match(/\/([^/?#]+)\.(?:webp|png)(?:[?#].*)?$/i);
  return match?.[1] || null;
}

function getCharacterItem(avatar) {
  return CHARACTER_ITEMS[getAvatarKey(avatar)] || null;
}

module.exports = { CHARACTER_ITEMS, getAvatarKey, getCharacterItem };
