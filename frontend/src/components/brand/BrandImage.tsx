import { BRAND } from "../../config/brand";

interface Props {
  src?: string;
  alt: string;
  className?: string;
  size?: number;
}

export function SynapseLogo({ className, size = 40 }: { className?: string; size?: number }) {
  return (
    <img
      src={BRAND.logo}
      alt="Synapse"
      className={className}
      width={size}
      height={size}
      draggable={false}
    />
  );
}

export function ChatbotAvatar({ className, size = 32 }: { className?: string; size?: number }) {
  return (
    <img
      src={BRAND.chatbot}
      alt=""
      aria-hidden
      className={className}
      width={size}
      height={size}
      draggable={false}
    />
  );
}

export default function BrandImage({ src, alt, className, size = 24 }: Props) {
  return (
    <img
      src={src ?? BRAND.logo}
      alt={alt}
      className={className}
      width={size}
      height={size}
      draggable={false}
    />
  );
}
