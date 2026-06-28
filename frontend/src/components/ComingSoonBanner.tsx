type ComingSoonBannerProps = {
  icon: string;
  hint?: string;
};

export function ComingSoonBanner({ icon, hint }: ComingSoonBannerProps): JSX.Element {
  return (
    <div className="coming-soon-block">
      <div className="coming-soon-icon-lg">{icon}</div>
      <h3>This feature is coming soon</h3>
      {hint && <p className="coming-soon-note-text">{hint}</p>}
    </div>
  );
}
