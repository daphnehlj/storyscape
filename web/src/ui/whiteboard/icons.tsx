import type { ReactElement } from 'react';

/** Inline so the toolbar has no icon dependency and inherits colour from CSS. */
const svg = (children: ReactElement) => (
  <svg
    viewBox="0 0 24 24"
    width="100%"
    height="100%"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
);

export const PenIcon = () =>
  svg(
    <>
      <path d="M15.5 3.8 20.2 8.5 9.4 19.3l-6 1.3 1.3-6z" />
      <path d="m13.2 6.1 4.7 4.7" />
    </>,
  );

export const EraserIcon = () =>
  svg(
    <>
      <path d="M8.6 20.5h11.9" />
      <path d="M14.1 3.9 3.6 14.4a1.8 1.8 0 0 0 0 2.5l3.6 3.6h4.3l9-9a1.8 1.8 0 0 0 0-2.5l-3.9-3.9a1.8 1.8 0 0 0-2.5 0Z" />
      <path d="m9.3 8.7 6.4 6.4" />
    </>,
  );

export const FillIcon = () =>
  svg(
    <>
      <path d="M10 3.5 3.8 9.7a1.6 1.6 0 0 0 0 2.3l5.5 5.5a1.6 1.6 0 0 0 2.3 0l6.2-6.2z" />
      <path d="M7.6 5.9 5.2 3.5" />
      <path d="M20.4 15c0 1.3-1 2.4-2.2 2.4s-2.2-1.1-2.2-2.4S18.2 11 18.2 11s2.2 2.7 2.2 4Z" />
    </>,
  );

export const LineIcon = () => svg(<path d="M4.5 19.5 19.5 4.5" />);

export const RectIcon = () => svg(<rect x="4" y="5.5" width="16" height="13" rx="1.6" />);

export const EllipseIcon = () => svg(<ellipse cx="12" cy="12" rx="8.3" ry="7" />);

export const UndoIcon = () =>
  svg(
    <>
      <path d="M4 9.5h9.5a5.5 5.5 0 0 1 0 11H8" />
      <path d="m8 5.5-4 4 4 4" />
    </>,
  );

export const RedoIcon = () =>
  svg(
    <>
      <path d="M20 9.5h-9.5a5.5 5.5 0 0 0 0 11H16" />
      <path d="m16 5.5 4 4-4 4" />
    </>,
  );

export const TrashIcon = () =>
  svg(
    <>
      <path d="M4.5 6.5h15" />
      <path d="M9.5 6.5V4.8a1.3 1.3 0 0 1 1.3-1.3h2.4a1.3 1.3 0 0 1 1.3 1.3v1.7" />
      <path d="M6.5 6.5 7.4 19a1.5 1.5 0 0 0 1.5 1.4h6.2a1.5 1.5 0 0 0 1.5-1.4l.9-12.5" />
    </>,
  );
