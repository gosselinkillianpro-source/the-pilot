import Link from 'next/link';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'dark' | 'success';
export type ButtonSize = 'sm' | 'md' | 'lg';

function classes(
  variant: ButtonVariant,
  size: ButtonSize,
  block: boolean | undefined,
  className?: string,
) {
  return cn(
    'btn',
    `btn-${variant}`,
    size !== 'md' && `btn-${size}`,
    block && 'btn-block',
    className,
  );
}

export function Button({
  variant = 'secondary',
  size = 'md',
  block,
  className,
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
}) {
  return <button type={type} className={classes(variant, size, block, className)} {...props} />;
}

export function LinkButton({
  href,
  variant = 'secondary',
  size = 'md',
  block,
  className,
  children,
}: {
  href: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} className={classes(variant, size, block, className)}>
      {children}
    </Link>
  );
}
