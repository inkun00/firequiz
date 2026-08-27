import React from 'react';
import { DEFAULT_AVATAR } from '../data/avatarOptions';

export default function AvatarPortrait({ avatar, alt = '선택한 캐릭터', className = '' }) {
  const isImageAvatar = typeof avatar === 'string' && avatar.startsWith('/assets/');

  if (isImageAvatar || !avatar) {
    return (
      <img
        src={isImageAvatar ? avatar : DEFAULT_AVATAR}
        alt={alt}
        className={`h-full w-full object-cover object-top ${className}`}
      />
    );
  }

  return (
    <span className={`flex h-full w-full items-center justify-center text-2xl ${className}`} role="img" aria-label={alt}>
      {avatar}
    </span>
  );
}
