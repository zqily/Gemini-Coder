import React from 'react';

const GeminiIcon: React.FC<{ size?: number; className?: string }> = ({ size = 18, className }) => (
  <img src="/assets/gemini.svg" alt="Gemini" width={size} height={size} className={className} />
);

export default GeminiIcon;
