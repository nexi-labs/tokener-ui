type SimpleIconData = {
  title: string;
  path: string;
  hex: string;
};

/**
 * Renders a real brand icon from the `simple-icons` package (simpleicons.org) and never a
 * generic placeholder glyph for a named brand (Google, Microsoft, GitHub, Okta, Slack,
 * OpenAI, Anthropic, AWS, etc.).
 */
export function SimpleIcon({
  icon,
  size = 18,
  className,
  monochrome = true,
}: {
  icon: SimpleIconData;
  size?: number;
  className?: string;
  monochrome?: boolean;
}) {
  return (
    <svg
      role="img"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      fill={monochrome ? "currentColor" : `#${icon.hex}`}
      aria-label={icon.title}
    >
      <path d={icon.path} />
    </svg>
  );
}
