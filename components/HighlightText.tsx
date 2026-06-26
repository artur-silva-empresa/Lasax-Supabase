import React from 'react';

interface HighlightTextProps {
  text: string | number | null | undefined;
  highlight?: string | (string | undefined)[];
}

const HighlightText: React.FC<HighlightTextProps> = ({ text, highlight }) => {
  if (text === null || text === undefined) return null;
  const textStr = String(text);
  
  const highlights = (Array.isArray(highlight) ? highlight : [highlight])
    .filter((h): h is string => Boolean(h && typeof h === 'string' && h.trim()));

  if (highlights.length === 0) {
    return <>{textStr}</>;
  }

  const escapeRegExp = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${highlights.map(h => escapeRegExp(h.trim())).join('|')})`, 'gi');
  const parts = textStr.split(regex);

  return (
    <>
      {parts.map((part, i) => {
        const isMatch = highlights.some(h => h.trim().toLowerCase() === part.toLowerCase());
        return isMatch ? (
          <mark key={i} className="bg-yellow-200 dark:bg-yellow-500/40 text-inherit rounded-[2px] px-[1px]">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        );
      })}
    </>
  );
};

export default HighlightText;
