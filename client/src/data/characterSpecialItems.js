import characterItemDefinitions from '../../../shared/characterItems.json';

const CHARACTER_SPECIAL_ITEMS = new Map(
  characterItemDefinitions.map(item => [item.avatarKey, item])
);

const getAvatarKey = (avatarSrc) => String(avatarSrc || '')
  .match(/\/([^/?#]+)\.(?:webp|png)(?:[?#].*)?$/i)?.[1] || null;

export function getCharacterSpecialItem(avatarSrc) {
  return CHARACTER_SPECIAL_ITEMS.get(getAvatarKey(avatarSrc)) || null;
}

export function getSpecialItemRarity(dropRate = 0) {
  if (dropRate <= 0.06) return '전설';
  if (dropRate <= 0.09) return '희귀';
  if (dropRate <= 0.13) return '보통';
  return '자주';
}

export function formatSpecialItemDropRate(dropRate = 0) {
  return `${Math.round(dropRate * 100)}%`;
}
