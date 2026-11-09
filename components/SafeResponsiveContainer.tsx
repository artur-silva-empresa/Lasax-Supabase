import React, { useState, useEffect, useRef, ReactNode, cloneElement, isValidElement } from 'react';

interface SafeResponsiveContainerProps {
  children: ReactNode;
  width?: string | number;
  height?: string | number;
  minHeight?: number;
  className?: string;
}

export const SafeResponsiveContainer: React.FC<SafeResponsiveContainerProps> = ({
  children,
  width = '100%',
  height = '100%',
  minHeight = 220,
  className = ''
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState<{ width: number; height: number }>({
    width: 0,
    height: 0
  });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const measure = () => {
      const rect = el.getBoundingClientRect();
      const measuredW = Math.floor(rect.width);
      const fallbackH = typeof height === 'number' ? height : minHeight;
      const measuredH = Math.floor(rect.height > 0 ? rect.height : fallbackH);
      
      if (measuredW > 0 && measuredH > 0) {
        setDimensions(prev => {
          if (prev.width === measuredW && prev.height === measuredH) return prev;
          return { width: measuredW, height: measuredH };
        });
      }
    };

    // Initial measurement
    measure();

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(entries => {
        if (!entries || entries.length === 0) return;
        const entry = entries[0];
        const contentBox = entry.contentRect;
        const w = Math.floor(contentBox.width || entry.target.getBoundingClientRect().width);
        const fallbackH = typeof height === 'number' ? height : minHeight;
        const h = Math.floor(contentBox.height > 0 ? contentBox.height : fallbackH);

        if (w > 0 && h > 0) {
          setDimensions(prev => {
            if (prev.width === w && prev.height === h) return prev;
            return { width: w, height: h };
          });
        }
      });
      resizeObserver.observe(el);
    }

    window.addEventListener('resize', measure);

    return () => {
      if (resizeObserver) resizeObserver.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [height, minHeight]);

  return (
    <div
      ref={containerRef}
      className={`w-full h-full relative ${className}`}
      style={{
        width: typeof width === 'number' ? `${width}px` : width,
        height: typeof height === 'number' ? `${height}px` : height,
        minHeight: `${minHeight}px`
      }}
    >
      {dimensions.width > 0 && dimensions.height > 0 && isValidElement(children) ? (
        cloneElement(children as React.ReactElement<any>, {
          width: dimensions.width,
          height: dimensions.height
        })
      ) : (
        <div className="w-full h-full flex items-center justify-center opacity-0">
          {/* Placeholder while measuring first layout tick */}
        </div>
      )}
    </div>
  );
};

export default SafeResponsiveContainer;
