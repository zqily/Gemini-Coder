import React from 'react';

interface GeminiIconProps {
  size?: number | string;
  className?: string;
}

const GeminiIcon: React.FC<GeminiIconProps> = ({ size = 24, className }) => {
  return (
    <img
      src="/assets/gemini.svg"
      alt="Gemini Icon"
      width={size}
      height={size}
      className={className}
    />
  );
};

export default GeminiIcon;