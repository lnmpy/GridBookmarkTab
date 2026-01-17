const isProduction = process.env.NODE_ENV === "production";

module.exports = {
  // content: isProduction ? ["./src/**/*.{html,ts}"] : [],
  content: ["./src/index.html"],
  safelist: [
    // Responsive breakpoint classes
    {
      pattern: /(px|py|p|m|gap|space|text|w|max-w)-(xs|sm|md|lg|xl|2xl|3xl|4xl)/,
      variants: ['sm', 'md', 'lg', 'xl', '2xl']
    },
    // Grid columns (responsive)
    {
      pattern: /grid-cols-(1|2|3|4|5|6|7|8|9|10|11|12)/,
      variants: ['sm', 'md', 'lg']
    },
    // Fixed gap
    'gap-4',
    // Border radius
    'rounded-xl',
    'rounded-lg',
    'rounded-2xl',
    'rounded-full',
    // Shadows
    'shadow-sm',
    'shadow-md',
    'shadow-lg',
    'shadow-xl',
    'shadow-2xl',
    'shadow-inner',
    'hover:shadow-xl',
    // Text utilities
    'truncate',
    'line-clamp-1',
    'line-clamp-2',
    'line-clamp-3',
    'truncate-1',
    'truncate-2',
    'truncate-ellipsis',
    'leading-tight',
    'text-center',
    // Transitions
    'transition-all',
    'transition-colors',
    'transition-shadow',
    'duration-150',
    'duration-200',
    'duration-300',
    'ease-out',
    // Hover states
    'hover:shadow-lg',
    'hover:shadow-md',
    'hover:shadow-xl',
    'hover:bg-base-200',
    'hover:bg-base-200/50',
    'hover:bg-base-200/30',
    'hover:text-primary',
    'hover:underline',
    // Group hover
    'group-hover:scale-105',
    'group-hover:scale-110',
    'group-hover:opacity-30',
    // Scale transforms
    'hover:scale-[1.02]',
    'hover:scale-[1.03]',
    'active:scale-[0.98]',
    'scale-105',
    // Borders
    'border',
    'border-base-300/50',
    'border-l-4',
    {
      pattern: /border-(blue|cyan|green|grey|orange|pink|purple|red|yellow)-(500)/
    },
    // Ring focus states
    'ring-2',
    'ring-primary',
    'ring-offset-2',
    'ring-primary/50',
    // Background gradients
    'bg-gradient-to-br',
    'from-base-100',
    'to-base-200/50',
    // Backdrop
    'backdrop-blur-sm',
    'bg-base-100/90',
    'bg-base-100/95',
    'bg-base-100',
    'bg-base-200/30',
    // Animation
    'animate-in',
    'slide-in-from-left',
    'fade-in',
    'zoom-in-95'
  ],
};
