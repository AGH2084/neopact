export function Brand({ inverse = false }: { inverse?: boolean }) {
  return (
    <img
      className="brand-logo"
      src={`/brand/neopact-logo-${inverse ? "reversed" : "primary"}.svg`}
      alt="neopact"
      width={167}
      height={36}
    />
  );
}
