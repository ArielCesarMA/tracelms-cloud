type EmptyStateProps = {
  icon: string;
  title: string;
  action: string;
  tip?: string;
};

export function EmptyState({ icon, title, action, tip }: EmptyStateProps): JSX.Element {
  return (
    <div className="empty-state">
      <span className="empty-state-icon">{icon}</span>
      <p className="empty-state-title">{title}</p>
      <p className="empty-state-action">{action}</p>
      {tip && <p className="empty-state-tip">{tip}</p>}
    </div>
  );
}
